import z from "zod/v4";

const schema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	LOG_LEVEL: z.string().default("debug"),
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(3000),
	MAX_RECONNECT_ATTEMPTS: z.coerce.number().min(1).default(5),
	RECONNECT_INTERVAL: z.coerce.number().min(1000).default(5000),
	MAX_QR_ATTEMPTS: z.coerce.number().min(1).default(5),
	PAIR_CODE_TIMEOUT: z.coerce.number().min(1000).default(60_000),
});

export const env = schema.parse(process.env);
