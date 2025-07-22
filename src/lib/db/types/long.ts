import { customType } from "drizzle-orm/pg-core";
import Long from "long";

export const long = customType<{ data: number | Long; driverData: number }>({
	dataType() {
		return "bigint";
	},
	toDriver(value: Long | number) {
		return Long.isLong(value) ? value.toNumber() : value;
	},
	fromDriver(value) {
		return value;
	},
});
