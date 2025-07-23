import { createRoute, z } from "@hono/zod-openapi";
import {
	errorResponseSchema,
	paginationSchema,
	successResponseSchema,
} from "./../../lib/validation";
import { connectionSchema } from "./find";

export const successSchema = successResponseSchema.extend({
	data: z.array(connectionSchema),
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "List all connections",
	description: "Retrieve a list of saved connections in paginated format",
	method: "get",
	path: "/",
	request: {
		query: paginationSchema,
	},
	responses: {
		200: {
			description: "Connections list retrieved successfully",
			content: {
				"application/json": {
					schema: successSchema,
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
