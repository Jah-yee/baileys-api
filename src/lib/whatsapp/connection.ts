import { Boom } from "@hapi/boom";
import {
	Browsers,
	DisconnectReason,
	type GroupMetadata,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
	makeWASocket,
	type proto,
	type SocketConfig,
	type WASocket,
} from "baileys";
import { and, eq, sql } from "drizzle-orm";
import type pino from "pino";
import type z from "zod/v4";
import type { bodySchema } from "../../routes/connections/create";
import { db, tables } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import type { ShallowExtract } from "../types";
import { WhatsAppAuthState } from "./auth-state";
import { type Events, eventEmitter } from "./events";
import { WhatsAppChatHandlers } from "./handlers/chats";
import { WhatsAppContactHandlers } from "./handlers/contacts";
import { WhatsAppGroupHandlers } from "./handlers/groups";
import { WhatsAppMessageHandlers } from "./handlers/messages";
import type { BaileysEvents, EventHandler, EventHandlers } from "./types";

const connectionsMap = new Map<string, WhatsAppConnection>();
const reconnectAttemptsMap = new Map<string, number>();
const qrAttemptsMap = new Map<string, number>();

const MAX_RECONNECT_ATTEMPTS = env.MAX_RECONNECT_ATTEMPTS;
const RECONNECT_INTERVAL = env.RECONNECT_INTERVAL;
const MAX_QR_ATTEMPTS = env.MAX_QR_ATTEMPTS;
const PAIR_CODE_TIMEOUT = env.PAIR_CODE_TIMEOUT;

export type WhatsAppConnectionOptions = z.infer<typeof bodySchema>;

export class WhatsAppConnection {
	#id: number | null;
	#options: WhatsAppConnectionOptions;
	#logger: pino.Logger;

	#connection: WASocket | null = null;
	#eventHandlers: EventHandlers;

	#qrCode: string | null = null;
	#pairCode: string | null = null;
	#pairCodeTimeout: NodeJS.Timeout | null = null;

	constructor(options: WhatsAppConnectionOptions, id?: number) {
		this.#id = id ?? null;
		this.#options = options;
		this.#logger = logger.child({
			name: "WhatsAppConnection",
			connectionName: options.name,
			phone: options.phone,
		});

		const chatHandlers = new WhatsAppChatHandlers(this);
		const contactHandlers = new WhatsAppContactHandlers(this);
		const groupHandlers = new WhatsAppGroupHandlers(this);
		const messageHandlers = new WhatsAppMessageHandlers(this);

		this.#eventHandlers = {
			...chatHandlers.handlers,
			...contactHandlers.handlers,
			...groupHandlers.handlers,
			...messageHandlers.handlers,
			"connection.update": this.#handleConnectionUpdate.bind(this),
			call: this.#handleCall.bind(this),
		};
	}

	get id() {
		if (!this.#id) {
			throw new Error("Attempting to access connection ID before it was set");
		}
		return this.#id;
	}

	get status() {
		if (!this.#connection) {
			return "disconnected";
		}

		const authenticatedJid = this.#connection.authState.creds.me?.id;
		return authenticatedJid ? "authenticated" : "connected";
	}

	get connection() {
		if (!this.#connection) {
			throw new Error("Connection is not initialized");
		}
		return this.#connection;
	}

	async setOptions(options: Partial<WhatsAppConnectionOptions>) {
		const existingConnection = options.name
			? connectionsMap.get(options.name)
			: null;
		if (existingConnection) {
			const message = `Connection with name ${options.name} already exists`;
			this.#logger.error(message);
			throw new Error(message);
		}

		// Reset auth method if phone number changed
		if (options.phone && options.phone !== this.#options.phone) {
			await this.setAuthMethod("qr");
		} else if (
			options.authMethod &&
			options.authMethod !== this.#options.authMethod
		) {
			await this.setAuthMethod(options.authMethod);
		}

		this.#options = {
			...this.#options,
			...options,
			baileysOptions: {
				...this.#options.baileysOptions,
				...options.baileysOptions,
			},
		};
		this.#logger = logger.child({
			name: "WhatsAppConnection",
			connectionName: options.name,
			phone: options.phone,
		});

		logger.info("Restarting connection due to options change");
		this.#connection?.end(
			new Boom("Restarting connection", {
				statusCode: DisconnectReason.restartRequired,
			}),
		);
	}

	async setAuthMethod(method: WhatsAppConnectionOptions["authMethod"]) {
		if (method === "qr") {
			this.#resetPairCode();
			return;
		}

		// Stop if we already authenticated, client is not ready, QR has not been issued or we have alive pair code
		if (this.status !== "connected" || !this.#qrCode || this.#pairCode) {
			return;
		}

		await this.#requestAndBroadcastPairCode();
	}

	async connect() {
		connectionsMap.set(this.#options.name, this);
		if (!this.#id) {
			const message = "Initializing connection";
			this.#logger.info(message);
			this.#broadcastEvent("connection:initialize", { message });
			await this.#save();
		}

		const authState = new WhatsAppAuthState(this.id, this.#logger);
		await authState.initialize();

		this.#connection = makeWASocket({
			markOnlineOnConnect: false,
			browser: Browsers.ubuntu("Google Chrome"),
			syncFullHistory: true,
			...this.#options.baileysOptions,
			logger,
			auth: {
				creds: authState.state.creds,
				keys: makeCacheableSignalKeyStore(authState.state.keys, logger),
			},
			getMessage: this.#getMessage.bind(this),
			cachedGroupMetadata: this.#getGroup.bind(this),
		});

		this.#connection.ev.process(async (events) => {
			if (events["creds.update"]) {
				await authState.saveCredentials();
			}

			for (const [event, data] of Object.entries(events)) {
				const handler = this.#eventHandlers[event as BaileysEvents];
				if (handler) {
					// biome-ignore lint/suspicious/noExplicitAny: This is a dynamic event handler
					void handler(data as any);
				}
			}
		});
	}

	async destroy(shouldLogout = true) {
		try {
			if (shouldLogout) {
				await this.#connection?.logout();
			}

			await db.transaction(async (tx) => {
				await tx
					.delete(tables.connections)
					.where(eq(tables.connections.name, this.#options.name));
			});
		} catch (err) {
			this.#logger.error(
				{ err },
				"Unexpected error while destroying connection",
			);
		}

		this.#connection?.ev.removeAllListeners("creds.update");
		this.#connection?.ev.removeAllListeners("connection.update");
		// @ts-expect-error this is a valid event used by the batching system
		this.#connection?.ev.removeAllListeners("event");

		this.#connection = null;
		this.#qrCode = null;
		this.#resetPairCode();

		connectionsMap.delete(this.#options.name);
		reconnectAttemptsMap.delete(this.#options.name);
		qrAttemptsMap.delete(this.#options.name);
	}

	async #save() {
		const message = "Failed to save connection, destroying connection";

		try {
			await db.transaction(async (tx) => {
				const [connection] = await tx
					.insert(tables.connections)
					.values({
						name: this.#options.name,
						data: this.#options,
					})
					.onConflictDoUpdate({
						target: tables.connections.name,
						set: { data: this.#options },
					})
					.returning();
				if (!connection) {
					this.#logger.error(message);
					await this.destroy(false);
					return;
				}

				this.#id = connection.id;
			});
		} catch (err) {
			this.#logger.error({ err }, message);
			await this.destroy(false);
			throw new Error(message);
		}
	}

	async #requestAndBroadcastPairCode() {
		const pairCode = await this.connection.requestPairingCode(
			this.#options.phone,
		);
		this.#pairCode = pairCode;
		this.#broadcastEvent("connection:token_received", {
			type: "pair",
			token: pairCode,
		});

		// Abort the connection after the timeout reached
		this.#pairCodeTimeout = setTimeout(async () => {
			if (this.status !== "authenticated") {
				this.#broadcastEvent("connection:error", {
					code: "pair_code_timeout_reached",
					message: "Pair code timeout reached, destroying connection",
				});
				await this.destroy();
			}
		}, PAIR_CODE_TIMEOUT);
	}

	#shouldReconnect() {
		const attempts = reconnectAttemptsMap.get(this.#options.name) || 0;
		if (attempts >= MAX_RECONNECT_ATTEMPTS) {
			this.#logger.error(
				"Max reconnect attempts reached, destroying connection",
			);
			return { reconnect: false, delay: 0 };
		}

		const delay = RECONNECT_INTERVAL ** attempts;
		reconnectAttemptsMap.set(this.#options.name, attempts + 1);
		return { reconnect: true, delay };
	}

	#resetPairCode() {
		this.#pairCode = null;
		if (this.#pairCodeTimeout) {
			clearTimeout(this.#pairCodeTimeout);
			this.#pairCodeTimeout = null;
		}
	}

	#handleConnectionUpdate: EventHandler<"connection.update"> = async (
		update,
	) => {
		const { connection, lastDisconnect } = update;
		if (connection === "open") {
			reconnectAttemptsMap.delete(this.#options.name);
			qrAttemptsMap.delete(this.#options.name);

			this.#qrCode = null;
			this.#resetPairCode();
			this.#broadcastEvent("connection:authenticated", {
				message: "Connection authenticated successfully",
			});
			return;
		}

		if (connection === "close") {
			const code =
				lastDisconnect?.error instanceof Boom
					? lastDisconnect.error.output.statusCode
					: 0;
			const { reconnect, delay } = this.#shouldReconnect();

			if (code === DisconnectReason.loggedOut || !reconnect) {
				await this.destroy(code !== DisconnectReason.loggedOut);
				this.#broadcastEvent("connection:error", {
					code: "disconnected",
					message:
						"Logged out or max reconnect attempts reached,destroying connection",
				});
				return;
			}

			if (code !== DisconnectReason.restartRequired) {
				const message = `Disconnected from server. Reconnecting in ${(delay / 1000).toFixed(2)} seconds`;
				this.#logger.warn({ code, delay }, message);
				this.#broadcastEvent("connection:reconnecting", { message });
			}
			setTimeout(
				async () => {
					await this.connect();
				},
				code === DisconnectReason.restartRequired ? 0 : delay,
			);
			return;
		}

		const qrAttempts = qrAttemptsMap.get(this.#options.name) ?? 0;
		if (update.qr) {
			this.#qrCode = update.qr;

			// Do nothing and wait for the user to pair the device or the timeout to abort the connection
			if (this.#options.authMethod === "pair" && this.#pairCode) {
				return;
			}

			if (this.#options.authMethod === "pair" && !this.#pairCode) {
				await this.#requestAndBroadcastPairCode();
				return;
			}

			if (this.#options.authMethod === "qr" && qrAttempts >= MAX_QR_ATTEMPTS) {
				this.#broadcastEvent("connection:error", {
					code: "max_qr_attempts_reached",
					message: `Max QR attempts exceeded, destroying connection`,
				});
				await this.destroy();
				return;
			}

			qrAttemptsMap.set(this.#options.name, qrAttempts + 1);
			this.#broadcastEvent("connection:token_received", {
				type: "qr",
				token: this.#qrCode,
			});
		}
	};

	#handleCall: EventHandler<"call"> = async (calls) => {
		if (this.#options.shouldRejectCall) {
			for (const call of calls) {
				await this.#connection?.rejectCall(call.id, call.from);
			}
		}
	};

	#getMessage: SocketConfig["getMessage"] = async (key) => {
		if (!key.remoteJid || !key.id) {
			return undefined;
		}

		try {
			const normalizedJid = jidNormalizedUser(key.remoteJid);
			const data = await db.query.messages.findFirst({
				where: and(
					eq(tables.messages.connectionId, this.id),
					eq(sql`${tables.messages.key}->>remoteJid`, normalizedJid),
					eq(sql`${tables.messages.key}->>id`, key.id),
				),
			});

			return data?.message as proto.IMessage;
		} catch (err) {
			this.#logger.error({ err, key }, `Failed to get message`);
			return undefined;
		}
	};

	#getGroup: SocketConfig["cachedGroupMetadata"] = async (jid) => {
		try {
			const normalizedJid = jidNormalizedUser(jid);
			const data = await db.query.groups.findFirst({
				where: and(
					eq(tables.groups.connectionId, this.id),
					eq(tables.groups.id, normalizedJid),
				),
			});

			return data as GroupMetadata;
		} catch (err) {
			this.#logger.error({ err, jid }, `Failed to get group metadata`);
			return undefined;
		}
	};

	#broadcastEvent<EventName extends Events["name"]>(
		name: EventName,
		data: ShallowExtract<Events, { name: EventName }>["data"],
	) {
		const event = { name, data };
		this.#logger.info({ event }, `Broadcasting event`);
		eventEmitter.emit("event", event);
	}
}

export async function restoreConnections() {
	const connections = await db.query.connections.findMany();
	for (const connection of connections) {
		const options = connection.data as WhatsAppConnectionOptions;
		const instance = new WhatsAppConnection(options, connection.id);

		void instance.connect();
		logger.info(`Restoring connection "${options.name}"...`);
	}
}

export function getConnectionByName(name: string) {
	return connectionsMap.get(name) ?? null;
}
