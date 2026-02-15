import { bigint, jsonb, pgTable, varchar } from "drizzle-orm/pg-core";
import type * as ConnectionSchema from "~/modules/connections/schema.js";
import { timestampColumns } from "../columns.js";

export const connections = pgTable("connections", {
	recordId: bigint({ mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),

	name: varchar({ length: 128 }).notNull().unique(),
	phoneNumber: varchar({ length: 15 }).notNull(),
	config: jsonb().$type<typeof ConnectionSchema.Connection.Type.config>().notNull(),

	...timestampColumns,
});
export type Connection = typeof connections.$inferSelect;
export type ConnectionInsert = typeof connections.$inferInsert;
