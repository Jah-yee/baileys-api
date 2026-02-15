import type { SQL } from "drizzle-orm";

export type WithSql<T extends Record<string, unknown>> = {
	[key in keyof T]: T[key] | SQL;
};
