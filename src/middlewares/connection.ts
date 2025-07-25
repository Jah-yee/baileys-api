import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getConnectionByName, type WhatsAppConnection } from "../lib/whatsapp";

interface ContextVariables {
	instance: WhatsAppConnection;
}

export const connectionMiddleware = createMiddleware<{
	Variables: ContextVariables;
}>(async (c, next) => {
	const name = c.req.path.split("/connections/")?.[1]?.split("/")?.[0];
	if (!name) {
		throw new HTTPException(500, {
			message: "Could not determine connection name from request path",
		});
	}

	const instance = getConnectionByName(name);
	if (!instance) {
		throw new HTTPException(404, { message: `Connection "${name}" not found` });
	}

	c.set("instance", instance);
	await next();
});

declare module "hono" {
	interface ContextVariableMap extends ContextVariables {}
}
