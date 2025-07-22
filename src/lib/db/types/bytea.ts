import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Uint8Array }>({
	dataType() {
		return "bytea";
	},
	toDriver(value) {
		// Drizzle will send this Buffer to Postgres
		return Buffer.from(value);
	},
	fromDriver(value) {
		// Received as Buffer, convert back to Uint8Array
		return new Uint8Array(value as Buffer);
	},
});
