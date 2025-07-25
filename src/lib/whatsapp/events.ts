import { EventEmitter } from "node:events";

export const eventEmitter = new EventEmitter();

export type ConnectionEvents =
	| {
			name:
				| "connection:initialize"
				| "connection:authenticated"
				| "connection:reconnecting";
			data: { message: string };
	  }
	| {
			name: "connection:token_received";
			data: { type: "qr" | "pair"; token: string };
	  }
	| {
			name: "connection:error";
			data: {
				code:
					| "disconnected"
					| "max_qr_attempts_reached"
					| "pair_code_timeout_reached";
				message: string;
			};
	  };

export interface Events {
	connection: { name: string };
	event: ConnectionEvents;
}
