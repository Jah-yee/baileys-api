import { jidNormalizedUser } from "baileys";
import { and, eq } from "drizzle-orm";
import type pino from "pino";
import { db, tables } from "../../db";
import { generateExcludedFields } from "../../db/utils";
import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppGroupHandlers {
	#connection: WhatsAppConnection;
	#logger: pino.Logger;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#logger = connection.logger.child({ name: "WhatsAppGroupHandlers" });
		this.#handlers = {
			"groups.upsert": this.#upsert,
			"groups.update": this.#update,
			"group-participants.update": this.#participantsUpdate,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#upsert: EventHandler<"groups.upsert"> = async (groups) => {
		try {
			await db.transaction(async (tx) => {
				const data = groups.map((group) => ({
					...group,
					id: jidNormalizedUser(group.id),
					connectionId: this.#connection.id,
				}));
				const result = await tx
					.insert(tables.groups)
					.values(data)
					.onConflictDoUpdate({
						target: [tables.groups.connectionId, tables.groups.id],
						set: generateExcludedFields(data[0]!, ["connectionId", "id"]),
					})
					.returning({ internalId: tables.groups.internalId });

				this.#logger.info(`Synced ${result.length} groups`);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to sync groups");
		}
	};

	#update: EventHandler<"groups.update"> = async (updates) => {
		try {
			for (const { id, ...update } of updates) {
				if (!id) {
					this.#logger.warn(
						{ update },
						"Got unexpected group update without id",
					);
					continue;
				}

				const normalizedId = jidNormalizedUser(id);
				await db.transaction(async (tx) => {
					const affected = await tx
						.update(tables.groups)
						.set(update)
						.where(
							and(
								eq(tables.groups.connectionId, this.#connection.id),
								eq(tables.groups.id, normalizedId),
							),
						)
						.returning({ internalId: tables.groups.internalId });

					if (affected.length <= 0) {
						this.#logger.warn(
							{ update },
							`Got update for non-existing group with id: "${normalizedId}"`,
						);
					}
				});
			}
		} catch (err) {
			this.#logger.error({ err }, "Failed to update groups");
		}
	};

	#participantsUpdate: EventHandler<"group-participants.update"> = async (
		update,
	) => {
		try {
			await db.transaction(async (tx) => {
				const normalizedId = jidNormalizedUser(update.id);
				const group = await tx.query.groups.findFirst({
					where: and(
						eq(tables.groups.connectionId, this.#connection.id),
						eq(tables.groups.id, normalizedId),
					),
				});
				if (!group) {
					this.#logger.warn(
						{ update },
						`Got participants update for non-existing group with id: "${normalizedId}"`,
					);
					return;
				}

				let participants = group.participants;
				switch (update.action) {
					case "add":
						participants.push(
							...update.participants.map((id) => ({
								id,
								isAdmin: false,
								isSuperAdmin: false,
							})),
						);
						break;
					case "demote":
					case "promote":
						for (const participant of participants) {
							if (update.participants.includes(participant.id)) {
								participant.isAdmin = update.action === "promote";
							}
						}
						break;
					case "remove":
						participants = participants.filter(
							(participant) => !update.participants.includes(participant.id),
						);
						break;
				}

				await tx
					.update(tables.groups)
					.set({ participants })
					.where(
						and(
							eq(tables.groups.connectionId, this.#connection.id),
							eq(tables.groups.id, normalizedId),
						),
					);
			});
		} catch (err) {
			this.#logger.error({ err }, "Failed to update group participants");
		}
	};
}
