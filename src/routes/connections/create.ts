import { createRoute, z } from "@hono/zod-openapi";
import {
	errorResponseSchema,
	phoneNumberSchema,
	successResponseSchema,
} from "../../lib/validation";

export const bodySchema = z.object({
	name: z.string().trim().min(1).max(255).openapi({
		description: "Unique identifier for the connection name",
		example: "connection-123",
	}),
	phone: phoneNumberSchema,
	authMethod: z.enum(["qr", "pair"]).default("qr").openapi({
		description: "Authentication method to use for the connection",
	}),
	shouldRejectCall: z.boolean().default(false).openapi({
		description: "Whether to reject a call whenever it comes in",
	}),
	baileysOptions: z.record(z.string(), z.any()).optional().openapi({
		description:
			"Additional options for the baileys connection. You can only pass JSON parse-able values",
	}),
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "Create new connection",
	description: "Create a new WhatsApp connection with the provided options",
	method: "post",
	path: "/create",
	request: {
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
			description: "Connection created successfully",
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
