import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppMessageHandlers {
	#connection: WhatsAppConnection;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
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

	#historySync: EventHandler<"messaging-history.set"> = async (data) => {};

	#upsert: EventHandler<"messages.upsert"> = async (data) => {};

	#update: EventHandler<"messages.update"> = async (data) => {};

	#delete: EventHandler<"messages.delete"> = async (data) => {};

	#reaction: EventHandler<"messages.reaction"> = async (data) => {};

	#receipt: EventHandler<"message-receipt.update"> = async (data) => {};
}
