import { type Contact, jidNormalizedUser } from "baileys";
import { and, eq } from "drizzle-orm";
import type pino from "pino";
import { db, tables } from "../../db";
import { generateExcludedFields } from "../../db/utils";
import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppContactHandlers {
	#connection: WhatsAppConnection;
	#logger: pino.Logger;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#logger = connection.logger.child({ name: "WhatsAppContactHandlers" });
		this.#handlers = {
			"messaging-history.set": this.#historySync,
			"contacts.upsert": this.#upsert,
			"contacts.update": this.#update,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#historySync: EventHandler<"messaging-history.set"> = async ({
		contacts,
	}) => {
		await this.#upsert(contacts);
	};

	#upsert: EventHandler<"contacts.upsert"> = async (contacts: Contact[]) => {
		try {
			await db.transaction(async (tx) => {
				const data = contacts.map((contact) => ({
					...contact,
					id: jidNormalizedUser(contact.id),
					connectionId: this.#connection.id,
				}));
				const result = await tx
					.insert(tables.contacts)
					.values(data)
					.onConflictDoUpdate({
						target: [tables.contacts.connectionId, tables.contacts.id],
						set: generateExcludedFields(data[0]!, ["connectionId", "id"]),
					})
					.returning({ internalId: tables.contacts.internalId });

				this.#logger.info(`Synced ${result.length} contacts`);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync contacts history");
		}
	};

	#update: EventHandler<"contacts.update"> = async (updates) => {
		try {
			for (const { id, ...update } of updates) {
				if (!id) {
					this.#logger.warn(
						{ update },
						"Got unexpected contact update without id",
					);
					continue;
				}

				const normalizedId = jidNormalizedUser(id);
				await db.transaction(async (tx) => {
					const affected = await tx
						.update(tables.contacts)
						.set(update)
						.where(
							and(
								eq(tables.contacts.connectionId, this.#connection.id),
								eq(tables.contacts.id, normalizedId),
							),
						)
						.returning({ internalId: tables.contacts.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ update },
							`Got update for non-existent contact with id: "${normalizedId}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update contacts");
		}
	};
}
