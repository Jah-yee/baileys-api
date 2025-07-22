import { type SQL, sql } from "drizzle-orm";

export function generateExcludedFields<
	Data extends Record<string, unknown>,
	ExcludedKeys extends (keyof Data)[] = never,
>(
	data: Data,
	excludedKeys?: ExcludedKeys,
): Omit<Record<keyof Data, SQL>, ExcludedKeys[number]> {
	return Object.keys(data)
		.filter((key) => !excludedKeys?.includes(key as keyof Data))
		.reduce(
			(acc, key) => {
				acc[key] = sql`excluded.${key}`;
				return acc;
			},
			// biome-ignore lint/suspicious/noExplicitAny: No brainer way to type this
			{} as any,
		);
}
