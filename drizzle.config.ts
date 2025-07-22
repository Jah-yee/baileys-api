import { defineConfig } from "drizzle-kit";
import { env } from "./src/lib/env";

export default defineConfig({
	dialect: "postgresql",
	dbCredentials: { url: env.DATABASE_URL },
	out: "./migrations/",
	schema: "./src/lib/db/schema.ts",
	casing: "snake_case",
});
