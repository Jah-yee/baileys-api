import { createRoute } from "@hono/zod-openapi";
import { errorResponseSchema, successResponseSchema } from "~/lib/validation";
import { createConnectionBodySchema } from "./create";
import { findConnectionParamsSchema } from "./find";

const bodySchema = createConnectionBodySchema.partial();

export const route = createRoute({
	tags: ["Connections"],
	summary: "Update connection",
	description:
		"Update an existing connection with the provided options. This will restart the connection",
	method: "patch",
	path: "/{name}",
	request: {
		params: findConnectionParamsSchema,
		body: {
			content: {
				"application/json": {
					schema: bodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Connection updated successfully",
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
