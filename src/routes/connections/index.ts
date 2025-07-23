import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "../../lib/db";
import { serializeError } from "../../lib/error";
import { getConnectionByName, WhatsAppConnection } from "../../lib/whatsapp";
import { route as createRoute } from "./create";
import { route as findRoute } from "./find";
import { route as listRoute } from "./list";

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

app.openapi(listRoute, async (c) => {
	const query = c.req.valid("query");

	try {
		const connections = await db.query.connections.findMany({
			limit: query.size,
			offset: (query.page - 1) * query.size,
			orderBy: [desc(tables.connections.createdAt)],
		});
		const data = connections.map((connection) => {
			const instance = getConnectionByName(connection.name);
			return {
				...connection,
				status: (instance
					? instance.status
					: "disconnected") as WhatsAppConnection["status"],
			};
		});

		return c.json(
			{
				success: true as const,
				message: "Connections retrieved successfully",
				data,
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

app.openapi(findRoute, async (c) => {
	const params = c.req.valid("param");
	const instance = c.get("instance");

	try {
		const connection = await db.query.connections.findFirst({
			where: eq(tables.connections.name, params.name),
		});
		if (!connection) {
			return c.json(
				{
					success: false as const,
					error: serializeError(`Connection "${params.name}" not found`),
				},
				404,
			);
		}

		return c.json(
			{
				success: true as const,
				message: `Connection "${params.name}" details retrieved successfully`,
				data: {
					...connection,
					// Idk why it yells without this cast
					status: instance.status as WhatsAppConnection["status"],
				},
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
