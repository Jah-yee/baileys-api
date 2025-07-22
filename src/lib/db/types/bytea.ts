import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Uint8Array }>({
	dataType() {
		return "bytea";
	},
	toDriver(value) {
		return Buffer.from(value);
	},
	fromDriver(value) {
		return new Uint8Array(value as Buffer);
	},
});
