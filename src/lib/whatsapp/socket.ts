import { writeFile } from "node:fs/promises";
import path from "node:path";
import type NodeCache from "@cacheable/node-cache";
import makeWASocket, {
	type BaileysEventMap,
	Browsers,
	type CacheStore,
	DisconnectReason,
	makeCacheableSignalKeyStore,
	type WASocket,
} from "baileys";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause, Deferred, Effect, Either, PubSub, Queue, Ref, type Scope, Stream } from "effect";
import type * as Database from "~/lib/db/index.js";
import type * as ConnectionSchema from "~/modules/connections/schema.js";
import { encodeToJson } from "../codec.js";
import { env } from "../env.js";
import * as WhatsAppAuthState from "./auth-state.js";
import { chatHandler } from "./handlers/chat.js";
import { connectionHandler } from "./handlers/connection.js";
import { contactHandler } from "./handlers/contact.js";
import { groupHandler } from "./handlers/group.js";
import { historySyncHandler } from "./handlers/history-sync.js";
import { messageHandler } from "./handlers/message.js";
import { makeFilteredEventHandler } from "./handlers/utils.js";
import { BaileysLogger } from "./logger.js";
import { type AnyJid, getAlternateJidFromDb, isPhoneNumberJid } from "./utils.js";

export interface WhatsAppSocketStreamData {
	readonly connection: ConnectionSchema.Connection;
	readonly events: Partial<BaileysEventMap>;
}

export type WhatsAppSocketStatus = "authenticated" | "connected" | "connecting" | "disconnected";

export interface WhatsAppSocketState {
	readonly status: WhatsAppSocketStatus;
	readonly lastDisconnectCode: DisconnectReason | null;
	readonly qrGenerationAttempts: number;
	readonly reconnectAttempts: number;
	readonly qrCode: string | null;
	readonly pairCode: string | null;
}

export interface WhatsAppSocketOptions {
	readonly pubsub: PubSub.PubSub<WhatsAppSocketStreamData>;
	readonly stateRef: Ref.Ref<WhatsAppSocketState>;
	readonly connection: ConnectionSchema.Connection;
	readonly retryCounterCache: NodeCache<unknown>;
}

export interface WhatsAppSocket {
	readonly state: Effect.Effect<WhatsAppSocketState>;
	readonly instance: WASocket;
	readonly restartSignal: Deferred.Deferred<boolean>;
	readonly requestPairCode: () => Effect.Effect<
		string,
		Cause.TimeoutException | Cause.UnknownException
	>;
	readonly getAlternateJid: (
		jid: string,
	) => Effect.Effect<
		AnyJid | null,
		EffectDrizzleQueryError | Cause.UnknownException,
		Database.Database
	>;
}

export const make: ({
	pubsub,
	stateRef,
	connection,
	retryCounterCache,
}: WhatsAppSocketOptions) => Effect.Effect<
	WhatsAppSocket,
	EffectDrizzleQueryError | Cause.TimeoutException,
	Scope.Scope | Database.Database
> = Effect.fn("WhatsAppSocket.make")(function* ({
	pubsub,
	stateRef,
	connection,
	retryCounterCache,
}) {
	const runtime = yield* Effect.runtime();
	const eventQueue = yield* Queue.unbounded<WhatsAppSocketStreamData>();
	const restartSignal = yield* Deferred.make<boolean>();
	const firstQrCodeSignal = yield* Deferred.make<string>();

	const authState = yield* WhatsAppAuthState.make(connection);
	const logger = new BaileysLogger(runtime);
	const instance = makeWASocket({
		generateHighQualityLinkPreview: true,
		markOnlineOnConnect: false,
		syncFullHistory: true,
		browser: Browsers.windows("Desktop"),
		...connection.config.baileysConfig,
		logger,
		msgRetryCounterCache: retryCounterCache as CacheStore,
		auth: {
			creds: authState.state.creds,
			keys: makeCacheableSignalKeyStore(
				authState.state.keys,
				logger.child({ name: "SignalKeyStoreCache" }),
			),
		},
	});

	const requestPairCode = Effect.fn("WhatsAppSocket.requestPairCode")(function* () {
		const state = yield* Ref.get(stateRef);
		if (!state.qrCode) {
			// Add 1 minute timeout since it should be impossible for qr event
			// to take that long to be fired, unless something went wrong
			yield* Deferred.await(firstQrCodeSignal).pipe(Effect.timeout("1 minute"));
		}

		const pairCode = yield* Effect.tryPromise(() =>
			instance.requestPairingCode(connection.phoneNumber),
		);
		yield* Ref.update(stateRef, (s) => ({ ...s, pairCode }));
		yield* Effect.log("Pair code generated:", pairCode);

		// Create a timeout that instructs to destroy the socket if not authenticated
		// within the timeout period after requesting pair code
		yield* Effect.gen(function* () {
			yield* Effect.sleep(env.PAIR_CODE_TIMEOUT);

			if (!authState.state.creds.me?.id) {
				yield* Effect.logError("Pair code timeout reached. Signaling for socket destruction.");
				yield* Deferred.succeed(restartSignal, false);
			}
		})
			// Don't need to scope this, as this is redundant if the socket is destroyed anyway
			.pipe(Effect.fork);

		return pairCode;
	});

	const getAlternateJid: WhatsAppSocket["getAlternateJid"] = Effect.fn(
		"WhatsAppSocket.getAlternateJid",
	)(function* (jid: string) {
		const maybeAlternateJid = yield* getAlternateJidFromDb(jid);
		if (maybeAlternateJid) {
			return maybeAlternateJid;
		}

		// If it's not phone number, then assume it's lid per baileys normalization
		const kind = isPhoneNumberJid(jid) ? "phone-number" : "lid";
		// Instruct baileys to do the lookup as final resort
		const result = yield* Effect.tryPromise(() =>
			kind === "phone-number"
				? instance.signalRepository.lidMapping.getLIDForPN(jid)
				: instance.signalRepository.lidMapping.getPNForLID(jid),
		);
		return result as AnyJid | null;
	});

	const socket = {
		state: Ref.get(stateRef),
		instance,
		restartSignal,
		requestPairCode,
		getAlternateJid,
	} as const;

	const lifecycleHandler = makeFilteredEventHandler(["connection.update", "creds.update", "call"])(
		Effect.fn("WhatsAppSocket.lifecycleHandler")(function* ({ events }) {
			if (events["connection.update"]) {
				const update = events["connection.update"];
				const isSignalFired = yield* Deferred.isDone(firstQrCodeSignal);
				if (update.qr && !isSignalFired) {
					yield* Deferred.succeed(firstQrCodeSignal, update.qr);
				}
			}

			if (events["creds.update"]) {
				yield* authState.save();
			}

			// TODO: Move this outside
			if (events.call && connection.config.shouldRejectCalls) {
				for (const call of events.call) {
					if (call.status !== "offer") {
						continue;
					}

					const maybeRejected = yield* Effect.either(
						Effect.tryPromise({
							try: () => instance.rejectCall(call.id, call.from),
							catch: (e) => new Cause.UnknownException(e),
						}),
					);
					if (Either.isRight(maybeRejected)) {
						yield* Effect.log("Rejected incoming call.", call);
					} else {
						yield* Effect.logError("Failed to reject incoming call:", maybeRejected.left);
					}
				}
			}
		}),
	);

	const handlerStream = Stream.fromQueue(eventQueue).pipe(
		Stream.map((data) => ({ ...data, socket, stateRef })),
		Stream.tap(({ events }) =>
			Effect.gen(function* () {
				if (!env.ENABLE_DEBUG_EVENTS_TO_FILE) {
					return;
				}

				const target = path.join(
					process.cwd(),
					"debug",
					`events-${Date.now()}-${crypto.randomUUID()}.json`,
				);
				yield* Effect.tryPromise(() => writeFile(target, encodeToJson(events, 2))).pipe(
					Effect.catchAll((e) => Effect.logError("Failed to write events debug file:", e)),
				);
			}),
		),
		Stream.flatMap((args) =>
			Effect.all(
				[
					connectionHandler(args),
					lifecycleHandler(args),
					historySyncHandler(args),
					contactHandler(args),
					chatHandler(args),
					messageHandler(args),
					groupHandler(args),
				],
				{
					concurrency: "unbounded",
					mode: "either",
				},
			),
		),
		Stream.tap((result) =>
			Effect.gen(function* () {
				const errors = result.filter(Either.isLeft).map((e) => e.left);
				if (errors.length > 0) {
					yield* Effect.logError("Finished executing handlers with errors:", errors);
				}
			}),
		),
		Stream.ensuring(Effect.log("Handler stream finalized.")),
	);
	yield* Stream.runDrain(handlerStream).pipe(Effect.forkScoped);

	const eventsCleanup = instance.ev.process(async (events) => {
		await Effect.runPromiseExit(
			Effect.gen(function* () {
				yield* Queue.offer(eventQueue, { connection, events });
				yield* PubSub.publish(pubsub, { connection, events });
			}),
		);
	});

	yield* Effect.addFinalizer(() =>
		Effect.gen(function* () {
			yield* Effect.log("Executing socket cleanup.");
			// Flush any remaining events, then detach the handler
			instance.ev.flush();
			eventsCleanup();

			const lastState = yield* socket.state;
			// If authenticated and not logged out, persist the credentials
			if (
				authState.state.creds.me?.id &&
				lastState.lastDisconnectCode !== DisconnectReason.loggedOut
			) {
				yield* authState
					.save()
					.pipe(
						Effect.catchAll((e) =>
							Effect.logError("Failed to save auth credentials during socket cleanup:", e),
						),
					);
			} else if (lastState.lastDisconnectCode === DisconnectReason.loggedOut) {
				// Otherwise, clean up the auth state from database
				yield* authState
					.reset()
					.pipe(
						Effect.catchAll((e) =>
							Effect.logError("Failed to clean up auth states during socket cleanup:", e),
						),
					);
			}

			// Close the socket connection if not already closed
			if (!lastState.lastDisconnectCode) {
				instance.end(new Error("Intentional socket shutdown."));
			}
		}),
	);

	return socket;
});
