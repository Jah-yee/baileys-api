import { createRoute, z } from "@hono/zod-openapi";
import { createSelectSchema } from "drizzle-zod";
import { tables } from "~/lib/db";
import {
	successResponseSchema as baseSuccessResponseSchema,
	errorResponseSchema,
} from "~/lib/validation";
import { createConnectionBodySchema } from "./create";

export const connectionSchema = createSelectSchema(tables.connections)
	.extend({
		status: z.enum(["disconnected", "connected", "authenticated"]),
	})
	.openapi("Connection");

export const findConnectionParamsSchema = createConnectionBodySchema.pick({
	name: true,
});

const successResponseSchema = baseSuccessResponseSchema.extend({
	data: connectionSchema,
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "Get connection details",
	description: "Retrieve details of a specific connection",
	method: "get",
	path: "/{name}",
	request: {
		params: findConnectionParamsSchema,
	},
	responses: {
		200: {
			description: "Connection details retrieved successfully",
			content: {
				"application/json": {
					schema: successResponseSchema,
				},
			},
		},
		400: {
			description: "Invalid request parameters",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
		404: {
			description: "Connection not found",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
		500: {
			description: "Internal server error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
	},
});
