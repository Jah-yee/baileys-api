import type { WhatsAppConnection } from "../connection";
import type { EventHandler, EventHandlers } from "../types";

export class WhatsAppGroupHandlers {
	#connection: WhatsAppConnection;
	#handlers: EventHandlers;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#handlers = {
			"messaging-history.set": this.#historySync,
			"groups.update": this.#update,
			"group-participants.update": this.#participantsUpdate,
		};
	}

	get handlers() {
		return this.#handlers;
	}

	#historySync: EventHandler<"messaging-history.set"> = async (data) => {};

	#update: EventHandler<"groups.update"> = async (data) => {};

	#participantsUpdate: EventHandler<"group-participants.update"> = async (
		data,
	) => {};
}
