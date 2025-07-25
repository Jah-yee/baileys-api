import { createRoute, z } from "@hono/zod-openapi";

const successResponseSchema = z.string().openapi({
	description: "Stream of connection events",
	example: `{"event":{"name":"connection:initialize","data":{"message":"Initializing connection"}},"connection":{"name":"test"}}`,
});

export const route = createRoute({
	tags: ["Connections"],
	summary: "Event streams for connections",
	description: "Subscribe to event streams for all instantiated connections",
	method: "get",
	path: "/events",
	responses: {
		200: {
			description: "Stream of connection events",
			content: {
				"text/event-stream": {
					schema: successResponseSchema,
				},
			},
		},
	},
});
