import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import type { BaileysEventMap } from "baileys";
import { DateTime, Effect, Either, identity, Schedule } from "effect";
import type { EventHandlerOptions } from "./utils.js";

export const webhookHandler = Effect.fn("WhatsAppSocket.webhookHandler")(function* ({
	connection,
	events,
}: EventHandlerOptions) {
	if (connection.config.webhooks.length <= 0) {
		return;
	}

	const receivedAt = yield* DateTime.now;
	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.filterStatusOk,
		HttpClient.retryTransient({
			times: 5,
			schedule: Schedule.jittered(Schedule.exponential("5 seconds")),
		}),
	);

	const requests = connection.config.webhooks
		.map((webhook) => {
			let eventsToSend: Partial<BaileysEventMap> = {};
			if (!webhook.events) {
				eventsToSend = events;
			} else {
				for (const event of webhook.events as (keyof BaileysEventMap)[]) {
					if (events[event]) {
						eventsToSend[event] = events[event] as any;
					}
				}
			}

			if (Object.keys(eventsToSend).length <= 0) {
				return null;
			}

			return Effect.gen(function* () {
				yield* Effect.log(`Sending events to webhook ${webhook.url}...`);
				const maybeResponse = yield* Effect.either(
					HttpClientRequest.post(webhook.url).pipe(
						webhook.authToken ? HttpClientRequest.bearerToken(webhook.authToken) : identity,
						HttpClientRequest.bodyJson({ connection, events: eventsToSend, receivedAt }),
						Effect.flatMap(client.execute),
						Effect.timeout("30 seconds"),
					),
				);

				if (Either.isRight(maybeResponse)) {
					yield* Effect.log(`Successfully sent events to webhook ${webhook.url}.`);
				} else {
					yield* Effect.logError(
						`Failed to send events to webhook ${webhook.url}:`,
						maybeResponse.left,
					);
				}
			});
		})
		.filter((r): r is NonNullable<typeof r> => r !== null);

	if (requests.length <= 0) {
		return;
	}

	yield* Effect.all(requests, { concurrency: "unbounded", mode: "either" });
}, Effect.provide(FetchHttpClient.layer));
