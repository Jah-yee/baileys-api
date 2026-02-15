import { Schema as S } from "effect";

export const PhoneNumber = S.String.pipe(
	S.pattern(/^[1-9]\d{1,14}$/),
	S.brand("Shared.PhoneNumber"),
).annotations({
	description: "A phone number in E.164 format without the plus (+) sign.",
});
export type PhoneNumber = typeof PhoneNumber.Type;

export const Timestamps = S.Struct({
	recordCreatedAt: S.DateTimeUtc.annotations({
		description: "The timestamp when the record was created in UTC.",
	}),
	recordUpdatedAt: S.DateTimeUtc.annotations({
		description: "The timestamp when the record was last updated in UTC.",
	}),
});
