import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { connectionRoutes } from "./routes/connections";

const app = new OpenAPIHono();
app.use(cors());
app.use(honoLogger());

app.route("/connections", connectionRoutes);

app.doc("/doc", {
	openapi: "3.0.0",
	info: {
		version: "1.0.0",
		title: "Baileys API",
		description: `API documentation for the [Baileys API](https://github.com/ookamiiixd/baileys-api) project.

**Note**: Any routes that accepts a body, expects it in JSON format. Make sure to include the appropriate header`,
	},
});
app.get("/ui", swaggerUI({ url: "/doc" }));

const server = serve({ port: env.PORT, fetch: app.fetch });
logger.info(`Server is running on http://localhost:${env.PORT}`);

process.on("SIGINT", () => {
	server.close();
	process.exit(0);
});
process.on("SIGTERM", () => {
	server.close((err) => {
		if (err) {
			logger.error({ err }, "Unexpected error while closing server");
			process.exit(1);
		}
		process.exit(0);
	});
});
