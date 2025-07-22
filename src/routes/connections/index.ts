import { OpenAPIHono } from "@hono/zod-openapi";
import { serializeError } from "../../lib/error";
import { getConnectionByName, WhatsAppConnection } from "../../lib/whatsapp";
import { route as createRoute } from "./create";

const app = new OpenAPIHono();

app.openapi(createRoute, async (c) => {
	const body = c.req.valid("json");
	const existingConnection = getConnectionByName(body.name);
	if (existingConnection) {
		return c.json(
			{
				success: false as const,
				error: serializeError(
					`Connection with name "${body.name}" already exists`,
				),
			},
			400,
		);
	}

	try {
		const instance = new WhatsAppConnection(body);
		await instance.connect();

		return c.json(
			{
				success: true as const,
				message: `Connection "${body.name}" created successfully`,
			},
			200,
		);
	} catch (err) {
		return c.json(
			{
				success: false as const,
				error: serializeError(err),
			},
			500,
		);
	}
});

export { app as connectionRoutes };
