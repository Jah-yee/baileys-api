import { Layer, Logger, ManagedRuntime } from "effect";
import * as Database from "./lib/db/index.js";
import { env } from "./lib/env.js";
import * as WhatsAppSocketManager from "./lib/whatsapp/socket-manager.js";
import { TracerLive } from "./tracer.js";

export const AppLive = Layer.mergeAll(
	Logger.pretty,
	Logger.minimumLogLevel(env.LOG_LEVEL),
	TracerLive,
	Database.Database.Default,
	WhatsAppSocketManager.WhatsAppSocketManager.Default,
);

export const runtime = ManagedRuntime.make(AppLive);
