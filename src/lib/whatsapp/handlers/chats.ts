import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppChatHandlers {
	#connection: WhatsAppConnection;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
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

	#historySync: EventHandler<"messaging-history.set"> = async (data) => {};

	#upsert: EventHandler<"chats.upsert"> = async (data) => {};

	#update: EventHandler<"chats.update"> = async (data) => {};

	#delete: EventHandler<"chats.delete"> = async (data) => {};
}
