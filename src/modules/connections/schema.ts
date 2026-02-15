import { Schema as S } from "effect";
import * as SharedSchema from "~/lib/schema.js";

export const RecordId = S.NumberFromString.pipe(
	S.int(),
	S.positive(),
	S.brand("Connection.RecordId"),
).annotations({
	description: "A unique identifier for the connection.",
});
export type RecordId = typeof RecordId.Type;

export class Connection extends S.Class<Connection>("Connection")({
	recordId: RecordId,
	name: S.Trim.pipe(S.minLength(1), S.maxLength(128)).annotations({
		description: "A human-readable name for the connection. Must be unique.",
	}),
	phoneNumber: SharedSchema.PhoneNumber,
	config: S.Struct({
		shouldRejectCalls: S.Boolean.annotations({
			description: "Whether to reject any incoming calls on this WhatsApp connection.",
		}),
		proxyUrls: S.Array(S.URL).annotations({
			description:
				"A list of available proxy urls to route WhatsApp traffic through. Will be used based on the order and availability. If none work, proxy will be skipped.",
		}),
		webhooks: S.Array(
			S.Struct({
				url: S.URL.annotations({
					description: "The webhook url to send events to.",
				}),
				authToken: S.String.pipe(S.optional).annotations({
					description:
						"An optional auth token to include in the webhook request headers. Will be sent as `Authorization: Bearer <token>`.",
				}),
				events: S.Array(S.String).pipe(S.optional).annotations({
					description:
						"A list of baileys event names to send to this webhook. Leave empty to receive all events. But it's recommended to specify only the events you need.",
				}),
			}),
		).annotations({
			description: "A list of webhooks to send events to.",
		}),
		baileysConfig: S.Record({ key: S.String, value: S.Any }).pipe(S.optional).annotations({
			description:
				"Custom configuration that you want to pass to the baileys socket instance. Limited to JSON-serializable values.",
		}),
	}).pipe(
		S.optionalWith({
			default: () => ({ shouldRejectCalls: false, proxyUrls: [], webhooks: [] }),
		}),
	),

	...SharedSchema.Timestamps.fields,
}) {}
