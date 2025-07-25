import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq, lt } from "drizzle-orm";
import { streamSSE } from "hono/streaming";
import { db, tables } from "~/lib/db";
import { getError, serializeError } from "~/lib/error";
import {
	type Events,
	eventEmitter,
	getConnectionByName,
	WhatsAppConnection,
} from "~/lib/whatsapp";
import { connectionMiddleware } from "~/middlewares/connection";
import { route as createRoute } from "./create";
import { route as deleteRoute } from "./delete";
import { route as eventsRoute } from "./events";
import { route as findRoute } from "./find";
import { route as listRoute } from "./list";
import { route as pairRoute } from "./pair";
import { route as qrRoute } from "./qr";
import { route as updateRoute } from "./update";

const app = new OpenAPIHono();
const guarded = new OpenAPIHono();
guarded.use(connectionMiddleware);

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
			where: query.cursor ? lt(tables.connections.id, query.cursor) : undefined,
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
				cursor: data.length === query.size ? data[data.length - 1]!.id : null,
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

guarded.openapi(findRoute, async (c) => {
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
				message: `Connection details retrieved successfully`,
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

guarded.openapi(qrRoute, (c) => {
	const instance = c.get("instance");
	return c.json(
		{
			success: true as const,
			message: `QR code retrieved successfully`,
			data: instance.qrCode,
		},
		200,
	);
});

guarded.openapi(pairRoute, (c) => {
	const instance = c.get("instance");
	return c.json(
		{
			success: true as const,
			message: `Pair code retrieved successfully`,
			data: instance.pairCode,
		},
		200,
	);
});

guarded.openapi(updateRoute, async (c) => {
	const body = c.req.valid("json");
	const instance = c.get("instance");

	try {
		await instance.setOptions(body);
		return c.json(
			{
				success: true as const,
				message: `Connection updated successfully`,
			},
			200,
		);
	} catch (err) {
		const error = getError(err);
		// TODO: Should use a more deterministic approach
		const code = error.message.includes("already exists") ? 400 : 500;

		return c.json(
			{
				success: false as const,
				error: serializeError(err),
			},
			code,
		);
	}
});

guarded.openapi(deleteRoute, async (c) => {
	const instance = c.get("instance");

	try {
		await instance.destroy();
		return c.json(
			{
				success: true as const,
				message: `Connection deleted successfully`,
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

app.openapi(eventsRoute, async (c) => {
	return streamSSE(c, async (stream) => {
		async function handler(data: Events) {
			await stream.writeSSE({ data: JSON.stringify(data) });
		}

		eventEmitter.on("event", handler);
		stream.onAbort(() => {
			eventEmitter.off("event", handler);
		});

		// Keep the stream alive
		while (true) {
			await stream.sleep(60_000);
		}
	});
});

app.route("/", guarded);

export { app as connectionRoutes };
