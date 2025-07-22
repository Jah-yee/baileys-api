import {
	type BaileysEventMap,
	getKeyAuthor,
	jidNormalizedUser,
	toNumber,
} from "baileys";
import { and, eq, inArray, sql } from "drizzle-orm";
import type pino from "pino";
import { db, type TransactionDbClient, tables } from "../../db";
import { generateExcludedFields } from "../../db/utils";
import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppMessageHandlers {
	#connection: WhatsAppConnection;
	#logger: pino.Logger;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#logger = connection.logger.child({ name: "WhatsAppMessageHandlers" });
		this.#handlers = {
			"messaging-history.set": this.#historySync,
			"messages.upsert": this.#upsert,
			"messages.update": this.#update,
			"messages.delete": this.#delete,
			"messages.reaction": this.#reaction,
			"message-receipt.update": this.#receipt,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#historySync: EventHandler<"messaging-history.set"> = async ({
		messages,
		isLatest,
	}) => {
		try {
			await db.transaction(async (tx) => {
				if (isLatest) {
					await tx
						.delete(tables.messages)
						.where(eq(tables.messages.connectionId, this.#connection.id));
				}

				await this.#upsert({ messages, type: "append" }, tx);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync messages history");
		}
	};

	async #upsert(
		{ messages, type }: BaileysEventMap["messages.upsert"],
		maybeTx?: TransactionDbClient,
	) {
		try {
			const upsert = async (tx: TransactionDbClient) => {
				const data = messages.map((message) => ({
					...message,
					key: {
						...message.key,
						remoteJid: jidNormalizedUser(message.key.remoteJid!),
					},
					connectionId: this.#connection.id,
				}));
				const result = await tx
					.insert(tables.messages)
					.values(data)
					.onConflictDoUpdate({
						target: [tables.messages.connectionId, tables.messages.key],
						set: generateExcludedFields(data[0]!, ["connectionId", "key"]),
					})
					.returning({ internalId: tables.messages.internalId });

				this.#logger.info(`Synced ${result.length} messages`);

				if (type !== "notify") {
					return;
				}

				const normalizedMessages = messages.map((message) => ({
					...message,
					key: {
						...message.key,
						remoteJid: jidNormalizedUser(message.key.remoteJid!),
					},
				}));
				const jids = new Set(
					normalizedMessages.map((message) => message.key.remoteJid),
				);

				const foundChats = await tx.query.chats.findMany({
					columns: { id: true },
					where: and(
						eq(tables.chats.connectionId, this.#connection.id),
						inArray(tables.chats.id, Array.from(jids)),
					),
				});

				for (const jid of jids) {
					if (foundChats.some((chat) => chat.id === jid)) {
						continue;
					}

					const latestMessage = normalizedMessages
						.filter((message) => message.key.remoteJid === jid)
						.sort(
							(a, b) =>
								toNumber(b.messageTimestamp) - toNumber(a.messageTimestamp),
						)[0];
					if (!latestMessage) {
						continue;
					}

					this.#connection.connection.ev.emit("chats.upsert", [
						{
							id: jid,
							conversationTimestamp: latestMessage.messageTimestamp,
							unreadCount: 1,
						},
					]);
				}
			};

			if (maybeTx) {
				await upsert(maybeTx);
			} else {
				await db.transaction(upsert);
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync messages history");
		}
	}

	#update: EventHandler<"messages.update"> = async (updates) => {
		try {
			for (const { key, update } of updates) {
				if (!key.id || !key.remoteJid) {
					this.#logger.warn(
						{ update },
						"Got unexpected message update without key",
					);
					continue;
				}

				await db.transaction(async (tx) => {
					const affected = await tx
						.update(tables.messages)
						.set(update)
						.where(
							and(
								eq(tables.messages.connectionId, this.#connection.id),
								eq(sql`${tables.messages.key}->>'remoteJid'`, key.remoteJid),
								eq(sql`${tables.messages.key}->>'id'`, key.id),
							),
						)
						.returning({ internalId: tables.messages.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ update },
							`Got update for non-existent message with key: "${key}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update messages");
		}
	};

	#delete: EventHandler<"messages.delete"> = async (payload) => {
		try {
			await db.transaction(async (tx) => {
				if ("all" in payload) {
					const normalizedJid = jidNormalizedUser(payload.jid);
					const affected = await tx
						.delete(tables.messages)
						.where(
							and(
								eq(tables.messages.connectionId, this.#connection.id),
								eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
							),
						)
						.returning({ internalId: tables.messages.internalId });

					this.#logger.info(
						`Deleted ${affected.length} messages from "${normalizedJid}"`,
					);
					return;
				}

				const normalizedJid = jidNormalizedUser(payload.keys[0]!.remoteJid!);
				const affected = await tx
					.delete(tables.messages)
					.where(
						and(
							eq(tables.messages.connectionId, this.#connection.id),
							eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
							inArray(
								sql`${tables.messages.key}->>'id'`,
								payload.keys.map((key) => key.id!),
							),
						),
					)
					.returning({ internalId: tables.messages.internalId });

				this.#logger.info(
					`Deleted ${affected.length} messages from "${normalizedJid}"`,
				);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to delete messages");
		}
	};

	#reaction: EventHandler<"messages.reaction"> = async (updates) => {
		try {
			for (const { key, reaction } of updates) {
				if (!key.id || !key.remoteJid) {
					this.#logger.warn(
						{ reaction },
						"Got unexpected message reaction without key",
					);
					continue;
				}

				const normalizedJid = jidNormalizedUser(key.remoteJid);
				const message = await db.query.messages.findFirst({
					where: and(
						eq(tables.messages.connectionId, this.#connection.id),
						eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
						eq(sql`${tables.messages.key}->>'id'`, key.id),
					),
				});
				if (!message) {
					this.#logger.warn(
						{ reaction },
						`Got reaction for non-existent message with key: "${key}"`,
					);
					continue;
				}

				await db.transaction(async (tx) => {
					const authorJid = getKeyAuthor(reaction.key);
					const reactions = (message.reactions || []).filter(
						(r) => getKeyAuthor(r.key) !== authorJid,
					);
					reaction.text = reaction.text || "";
					reactions.push(reaction);

					const affected = await tx
						.update(tables.messages)
						.set({ reactions })
						.where(
							and(
								eq(tables.messages.connectionId, this.#connection.id),
								eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
								eq(sql`${tables.messages.key}->>'id'`, key.id),
							),
						)
						.returning({ internalId: tables.messages.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ reaction },
							`Got reaction for non-existent message with key: "${key}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update message reactions");
		}
	};

	#receipt: EventHandler<"message-receipt.update"> = async (updates) => {
		try {
			for (const { key, receipt } of updates) {
				if (!key.id || !key.remoteJid) {
					this.#logger.warn(
						{ receipt },
						"Got unexpected message receipt without key",
					);
					continue;
				}

				const normalizedJid = jidNormalizedUser(key.remoteJid);
				const message = await db.query.messages.findFirst({
					where: and(
						eq(tables.messages.connectionId, this.#connection.id),
						eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
						eq(sql`${tables.messages.key}->>'id'`, key.id),
					),
				});
				if (!message) {
					this.#logger.warn(
						{ receipt },
						`Got receipt for non-existent message with key: "${key}"`,
					);
					continue;
				}

				await db.transaction(async (tx) => {
					const receipts = (message.userReceipt || []).filter(
						(r) => r.userJid !== receipt.userJid,
					);
					const originalReceipt = (message.userReceipt || []).find(
						(r) => r.userJid === receipt.userJid,
					);
					receipts.push({ ...originalReceipt, ...receipt });

					const affected = await tx
						.update(tables.messages)
						.set({ userReceipt: receipts })
						.where(
							and(
								eq(tables.messages.connectionId, this.#connection.id),
								eq(sql`${tables.messages.key}->>'remoteJid'`, normalizedJid),
								eq(sql`${tables.messages.key}->>'id'`, key.id),
							),
						)
						.returning({ internalId: tables.messages.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ receipt },
							`Got receipt for non-existent message with key: "${key}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update message receipts");
		}
	};
}
