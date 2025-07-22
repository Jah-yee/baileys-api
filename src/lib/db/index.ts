import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, {
	schema,
	logger: env.NODE_ENV === "development",
	casing: "snake_case",
});

export * as tables from "./schema";

export type TransactionDbClient = Parameters<
	Parameters<(typeof db)["transaction"]>[0]
>[0];
