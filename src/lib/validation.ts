import { z } from "@hono/zod-openapi";

export const successResponseSchema = z.object({
	success: z.literal(true),
	message: z.string().optional(),
});

export const errorResponseSchema = z.object({
	success: z.literal(false),
	error: z.object({
		name: z.string().optional(),
		message: z.string(),
	}),
});

// Must be a numeric string with 3 to 32 digits, starting with a non-zero digit
export const PHONE_REGEX = /^[1-9]\d{2,31}$/;

export const phoneNumberSchema = z.string().trim().regex(PHONE_REGEX).openapi({
	description: "Phone number in E.164 format without the '+' prefix",
	example: "1234567890123",
	pattern: "^[1-9]\\d{2,31}$",
});
