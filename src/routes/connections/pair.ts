import { createRoute } from "@hono/zod-openapi";
import { errorResponseSchema } from "~/lib/validation";
import { findConnectionParamsSchema } from "./find";
import { connectionQrSuccessResponseSchema } from "./qr";

export const route = createRoute({
	tags: ["Connections"],
	summary: "Pair code for connection",
	description:
		"Retrieve the pair code for a connection to authenticate your device. Although this works, it is always recommended to use the Server-Sent Events (SSE) endpoint, especially when building a real-time UI. Streaming approaches are more efficient and reliable",
	method: "get",
	path: "/{name}/pair",
	request: {
		params: findConnectionParamsSchema,
	},
	responses: {
		200: {
			description: "Pair code retrieved successfully",
			content: {
				"application/json": {
					schema: connectionQrSuccessResponseSchema,
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
