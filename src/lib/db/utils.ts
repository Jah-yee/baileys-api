import { type SQL, sql } from "drizzle-orm";

export function mapToExcluded<T extends Record<string, unknown>, U extends keyof T = never>(
	data: T,
	excludedKeys: U[] = [],
): Omit<Record<keyof T, SQL>, U> {
	return Object.keys(data)
		.filter((key) => !excludedKeys.includes(key as U))
		.reduce(
			(obj, key) => {
				obj[key as Exclude<keyof T, U>] = sql.raw(`excluded.${key}`);
				return obj;
			},
			{} as Omit<Record<keyof T, SQL>, U>,
		);
}
