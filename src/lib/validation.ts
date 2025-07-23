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

export const paginationSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1).openapi({
			description: "Page number for pagination",
			example: 1,
		}),
		size: z.coerce.number().int().min(1).max(100).default(20).openapi({
			description: "Number of items per page",
			example: 20,
		}),
	})
	.openapi({
		description: "Pagination parameters",
		example: {
			page: 1,
			size: 20,
		},
	});
