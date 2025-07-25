import { createRoute, z } from "@hono/zod-openapi";
import {
	successResponseSchema as baseSuccessResponseSchema,
	errorResponseSchema,
	paginationSchema,
} from "~/lib/validation";
import { connectionSchema } from "./find";

const successResponseSchema = baseSuccessResponseSchema.extend({
	data: z.array(connectionSchema),
	cursor: paginationSchema.shape.cursor,
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "List all connections",
	description:
		"Retrieve a list of saved connections in cursor-based pagination format",
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
