import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppContactHandlers {
	#connection: WhatsAppConnection;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#handlers = {
			"messaging-history.set": this.#historySync,
			"contacts.upsert": this.#upsert,
			"contacts.update": this.#update,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#historySync: EventHandler<"messaging-history.set"> = async (data) => {};

	#upsert: EventHandler<"contacts.upsert"> = async (data) => {};

	#update: EventHandler<"contacts.update"> = async (data) => {};
}
