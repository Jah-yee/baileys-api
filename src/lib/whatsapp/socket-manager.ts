import { NodeCache } from "@cacheable/node-cache";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import {
	type Cause,
	Deferred,
	Effect,
	Exit,
	HashMap,
	Option,
	PubSub,
	Ref,
	Scope,
	Stream,
} from "effect";
import * as ConnectionError from "~/modules/connections/errors.js";
import type * as ConnectionSchema from "~/modules/connections/schema.js";
import type * as Database from "../db/index.js";
import * as WhatsAppSocket from "./socket.js";

interface WhatsAppSocketManagerMapEntry extends WhatsAppSocket.WhatsAppSocket {
	readonly connection: ConnectionSchema.Connection;
	readonly stateRef: Ref.Ref<WhatsAppSocket.WhatsAppSocketState>;
	readonly scope: Scope.CloseableScope;
	readonly retryCounterCache: NodeCache<unknown>;
}

export class WhatsAppSocketManager extends Effect.Service<WhatsAppSocketManager>()(
	"WhatsAppSocketManager",
	{
		scoped: Effect.gen(function* () {
			const pubsub = yield* PubSub.unbounded<WhatsAppSocket.WhatsAppSocketStreamData>();
			const sockets = yield* Ref.make(
				HashMap.empty<ConnectionSchema.RecordId, WhatsAppSocketManagerMapEntry>(),
			);
			const managerScope = yield* Scope.Scope;

			const createInternal: (
				connection: ConnectionSchema.Connection,
				scope: Scope.CloseableScope,
				stateRef: Ref.Ref<WhatsAppSocket.WhatsAppSocketState>,
				retryCounterCache: NodeCache<unknown>,
			) => Effect.Effect<
				WhatsAppSocketManagerMapEntry,
				EffectDrizzleQueryError | Cause.TimeoutException,
				Database.Database | Scope.Scope
			> = Effect.fn("WhatsAppSocketManager.createInternal")(
				function* (connection, scope, stateRef, retryCounterCache) {
					const socket = yield* WhatsAppSocket.make({
						pubsub,
						stateRef,
						connection,
						retryCounterCache,
					}).pipe(Scope.extend(scope));

					const entry: WhatsAppSocketManagerMapEntry = {
						...socket,
						connection,
						stateRef,
						scope,
						retryCounterCache,
					};

					yield* Ref.update(sockets, HashMap.set(connection.recordId, entry));

					// Setup restart handler
					yield* Effect.gen(function* () {
						const shouldRestart = yield* Deferred.await(socket.restartSignal);
						yield* Effect.log(`Received restart signal, restarting = ${shouldRestart}.`);
						// Remove from map then close scope
						yield* Ref.update(sockets, HashMap.remove(connection.recordId));
						yield* Scope.close(scope, Exit.void);

						if (shouldRestart) {
							// Create fresh scope then recreate the socket
							const newScope = yield* Scope.make();
							yield* createInternal(connection, newScope, stateRef, retryCounterCache).pipe(
								Effect.forkIn(managerScope),
							);
						}
					}).pipe(Effect.forkIn(managerScope));

					return entry;
				},
			);

			const create = Effect.fn("WhatsAppSocketManager.create")(function* (
				connection: ConnectionSchema.Connection,
			) {
				const map = yield* Ref.get(sockets);
				const existing = HashMap.get(map, connection.recordId);

				if (Option.isSome(existing)) {
					return yield* new ConnectionError.ConnectionAlreadyExists(connection.recordId);
				}

				const scope = yield* Scope.make();
				const stateRef = yield* Ref.make<WhatsAppSocket.WhatsAppSocketState>({
					status: "connecting" as const,
					lastDisconnectCode: null,
					qrGenerationAttempts: 0,
					reconnectAttempts: 0,
					qrCode: null,
					pairCode: null,
				});
				const retryCounterCache = new NodeCache();

				yield* createInternal(connection, scope, stateRef, retryCounterCache);
				yield* Effect.log("Connection created.");
			});

			const get = Effect.fn("WhatsAppSocketManager.get")(function* (id: ConnectionSchema.RecordId) {
				const map = yield* Ref.get(sockets);
				const existing = HashMap.get(map, id);
				if (Option.isNone(existing)) {
					return yield* new ConnectionError.ConnectionNotFound(id);
				}

				return existing.value;
			});

			const list = Effect.fn("WhatsAppSocketManager.list")(function* () {
				const map = yield* Ref.get(sockets);
				return Array.from(HashMap.values(map));
			});

			const remove = Effect.fn("WhatsAppSocketManager.remove")(function* (
				id: ConnectionSchema.RecordId,
			) {
				const existing = yield* get(id);
				yield* Scope.close(existing.scope, Exit.void);
				yield* Ref.update(sockets, HashMap.remove(id));
				yield* Effect.log("Connection removed.");
			});

			const restart = Effect.fn("WhatsAppSocketManager.restart")(function* (
				id: ConnectionSchema.RecordId,
			) {
				const existing = yield* get(id);
				const isSignalFired = yield* Deferred.isDone(existing.restartSignal);

				if (!isSignalFired) {
					yield* Deferred.succeed(existing.restartSignal, true);
					yield* Effect.log("Connection restart signal fired.");
				} else {
					yield* Effect.logError("Restart signal already fired for this connection.");
				}
			});

			const subscribe = Effect.fn("WhatsAppSocketManager.subscribe")(function* (
				id: ConnectionSchema.RecordId,
			) {
				const existing = yield* get(id);
				return Stream.fromPubSub(pubsub).pipe(
					Stream.filter((data) => data.connection.recordId === existing.connection.recordId),
					Stream.map((data) => data.events),
				);
			});

			return {
				create,
				get,
				list,
				remove,
				restart,
				subscribe,
			};
		}),
	},
) {}
