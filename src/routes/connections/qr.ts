import { createRoute, z } from "@hono/zod-openapi";
import { errorResponseSchema, successResponseSchema } from "~/lib/validation";
import { findConnectionParamsSchema } from "./find";

export const connectionQrSuccessResponseSchema = successResponseSchema.extend({
	data: z.string().nullable(),
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "QR Code for connection",
	description:
		"Retrieve the QR code for a connection to authenticate your device. Although this works, it is always recommended to use the Server-Sent Events (SSE) endpoint, especially when building a real-time UI. Streaming approaches are more efficient and reliable",
	method: "get",
	path: "/{name}/qr",
	request: {
		params: findConnectionParamsSchema,
	},
	responses: {
		200: {
			description: "QR code retrieved successfully",
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
