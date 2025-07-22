import { type Chat, jidNormalizedUser } from "baileys";
import { and, eq, inArray, sql } from "drizzle-orm";
import type pino from "pino";
import { db, type TransactionDbClient, tables } from "../../db";
import { generateExcludedFields } from "../../db/utils";
import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppChatHandlers {
	#connection: WhatsAppConnection;
	#logger: pino.Logger;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#logger = connection.logger.child({ name: "WhatsAppChatHandlers" });
		this.#handlers = {
			"messaging-history.set": this.#historySync,
			"chats.upsert": this.#upsert,
			"chats.update": this.#update,
			"chats.delete": this.#delete,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#historySync: EventHandler<"messaging-history.set"> = async ({
		chats,
		isLatest,
	}) => {
		try {
			await db.transaction(async (tx) => {
				if (isLatest) {
					await tx
						.delete(tables.chats)
						.where(eq(tables.chats.connectionId, this.#connection.id));
				}

				await this.#upsert(chats, tx);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync chats history");
		}
	};

	async #upsert(chats: Chat[], maybeTx?: TransactionDbClient) {
		try {
			const upsert = async (tx: TransactionDbClient) => {
				const data = chats.map((chat) => ({
					...chat,
					id: jidNormalizedUser(chat.id),
					connectionId: this.#connection.id,
				}));
				const result = await tx
					.insert(tables.chats)
					.values(data)
					.onConflictDoUpdate({
						target: [tables.chats.connectionId, tables.chats.id],
						set: generateExcludedFields(data[0]!, ["connectionId", "id"]),
					})
					.returning({ internalId: tables.chats.internalId });

				this.#logger.info(`Synced ${result.length} chats`);
			};

			if (maybeTx) {
				await upsert(maybeTx);
			} else {
				await db.transaction(upsert);
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync chats history");
		}
	}

	#update: EventHandler<"chats.update"> = async (updates) => {
		try {
			for (const { id, ...update } of updates) {
				if (!id) {
					this.#logger.warn(
						{ update },
						"Got unexpected chat update without id",
					);
					continue;
				}

				const normalizedId = jidNormalizedUser(id);
				await db.transaction(async (tx) => {
					const affected = await tx
						.update(tables.chats)
						.set({
							...update,
							unreadCount: update.unreadCount
								? sql`${tables.chats.unreadCount} + ${update.unreadCount}`
								: undefined,
						})
						.where(
							and(
								eq(tables.chats.connectionId, this.#connection.id),
								eq(tables.chats.id, normalizedId),
							),
						)
						.returning({ internalId: tables.chats.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ update },
							`Got update for non-existent chat with id: "${normalizedId}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update chats");
		}
	};

	#delete: EventHandler<"chats.delete"> = async (ids) => {
		try {
			await db.transaction(async (tx) => {
				const affected = await tx
					.delete(tables.chats)
					.where(
						and(
							eq(tables.chats.connectionId, this.#connection.id),
							inArray(tables.chats.id, ids.map(jidNormalizedUser)),
						),
					)
					.returning({ internalId: tables.chats.internalId });

				this.#logger.info(`Deleted ${affected.length} chats`);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to delete chats");
		}
	};
}
