import { Data } from "effect";
import type * as ConnectionSchema from "./schema.js";

export class ConnectionAlreadyExists extends Data.TaggedError(
	"Connection.ConnectionAlreadyExists",
)<ConnectionSchema.RecordId> {}

export class ConnectionNotFound extends Data.TaggedError(
	"Connection.ConnectionNotFound",
)<ConnectionSchema.RecordId> {}

export class MaxQrGenerationAttemptsReached extends Data.TaggedError(
	"Connection.MaxQrGenerationAttemptsReached",
)<ConnectionSchema.Connection> {}

export class MaxReconnectAttemptsReached extends Data.TaggedError(
	"Connection.MaxReconnectAttemptsReached",
)<ConnectionSchema.Connection> {}

export class PairCodeTimeout extends Data.TaggedError(
	"Connection.PairCodeTimeout",
)<ConnectionSchema.Connection> {}

export class LoggedOut extends Data.TaggedError(
	"Connection.LoggedOut",
)<ConnectionSchema.Connection> {}

export type ConnectionError =
	| ConnectionAlreadyExists
	| ConnectionNotFound
	| MaxQrGenerationAttemptsReached
	| MaxReconnectAttemptsReached
	| PairCodeTimeout
	| LoggedOut;
