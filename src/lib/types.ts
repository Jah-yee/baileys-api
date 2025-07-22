export type ShallowExtract<T, U> = T extends T
	? U extends Partial<T>
		? T
		: never
	: never;
