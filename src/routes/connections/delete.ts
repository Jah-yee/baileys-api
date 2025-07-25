import { createRoute } from "@hono/zod-openapi";
import { errorResponseSchema, successResponseSchema } from "~/lib/validation";
import { findConnectionParamsSchema } from "./find";

export const route = createRoute({
	tags: ["Connections"],
	summary: "Delete connection",
	description: "Delete an existing connection",
	method: "delete",
	path: "/{name}",
	request: {
		params: findConnectionParamsSchema,
	},
	responses: {
		200: {
			description: "Connection deleted successfully",
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
