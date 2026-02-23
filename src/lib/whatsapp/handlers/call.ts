import { Cause, Effect, Either } from "effect";
import { makeFilteredEventHandler } from "./utils.js";

export const callHandler = makeFilteredEventHandler(["call"])(
	Effect.fn("WhatsAppSocket.callHandler")(function* ({ connection, socket, events }) {
		if (!events.call || !connection.config.shouldRejectCalls) {
			return;
		}

		for (const call of events.call) {
			if (call.status !== "offer") {
				continue;
			}

			const maybeRejected = yield* Effect.either(
				Effect.tryPromise({
					try: () => socket.instance.rejectCall(call.id, call.from),
					catch: (e) => new Cause.UnknownException(e),
				}),
			);
			if (Either.isRight(maybeRejected)) {
				yield* Effect.log("Rejected incoming call.", call);
			} else {
				yield* Effect.logError("Failed to reject incoming call:", maybeRejected.left);
			}
		}
	}),
);
