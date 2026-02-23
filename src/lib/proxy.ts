import { Data, Effect, Either } from "effect";
import { ProxyAgent } from "proxy-agent";
import { ProxyAgent as UProxyAgent, fetch as uFetch } from "undici";

const TEST_URL = "https://httpbin.org/get";
const IS_BUN = process.versions.bun !== undefined;

export const getFirstWorkingProxyAgent = Effect.fn("Utils.getFirstWorkingProxyAgent")(function* (
	proxies: string[],
	testUrl: string = TEST_URL,
) {
	if (IS_BUN && proxies.length > 0) {
		// Bun has issues with proxying requests via node http agent which `baileys` uses,
		// so we just skip it for now
		// https://github.com/oven-sh/bun/issues/15499
		yield* Effect.logWarning("Bun runtime detected, proxy will be ignored.");
		return yield* new NoWorkingProxyError();
	}

	for (const proxy of proxies) {
		const agent = new ProxyAgent({ getProxyForUrl: () => proxy });
		const uAgent = new UProxyAgent(proxy);
		const signal = AbortSignal.timeout(15_000);
		const maybeResponse = yield* Effect.either(
			Effect.tryPromise(() => uFetch(testUrl, { signal, dispatcher: uAgent })),
		);
		if (Either.isRight(maybeResponse) && maybeResponse.right.ok) {
			return agent;
		}
	}

	return yield* new NoWorkingProxyError();
});

export class NoWorkingProxyError extends Data.TaggedError("NoWorkingProxyError") {}
