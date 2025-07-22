import type { BaileysEventMap } from "baileys";

export type BaileysEvents = keyof BaileysEventMap;
export type EventHandler<T extends BaileysEvents> = (
	data: BaileysEventMap[T],
) => Promise<void> | void;
export type EventHandlers = {
	[K in BaileysEvents]?: EventHandler<K>;
};
