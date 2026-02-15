import { Buffer } from "node:buffer";
import Long from "long";

export interface Uint8ArrayEncoded {
	type: "Uint8Array";
	data: number[];
}

export interface BufferEncoded {
	type: "Buffer";
	data: number[];
}

/**
 * Recursively transforms types into their encoded forms
 */
export type Encode<T> = T extends Buffer
	? BufferEncoded
	: T extends Uint8Array
		? Uint8ArrayEncoded
		: T extends Long
			? number
			: T extends Array<infer U>
				? Array<Encode<U>>
				: T extends object
					? { [K in keyof T]: Encode<T[K]> }
					: T;

/**
 * Recursively transforms encoded types back to their original forms
 */
export type Decode<T> = T extends BufferEncoded
	? Buffer
	: T extends Uint8ArrayEncoded
		? Uint8Array
		: T extends Array<infer U>
			? Array<Decode<U>>
			: T extends object
				? { [K in keyof T]: Decode<T[K]> }
				: T;

export function encode<T>(value: T) {
	const jsonString = encodeToJson(value);
	return JSON.parse(jsonString) as Encode<T>;
}

export function decode<T>(value: T) {
	const jsonString = JSON.stringify(value);
	return decodeFromJson<T>(jsonString);
}

export function encodeToJson<T>(value: T, space?: string | number) {
	return JSON.stringify(value, jsonReplacer, space);
}

export function decodeFromJson<T>(jsonString: string) {
	return JSON.parse(jsonString, jsonReviver) as Decode<T>;
}

function jsonReplacer(this: any, _: string, value: any): any {
	// This won't likely to be happen since `Buffer` implements `toJSON`,
	// but just in case
	if (Buffer.isBuffer(value)) {
		return value.toJSON();
	}

	if (value instanceof Uint8Array) {
		return {
			type: "Uint8Array",
			data: Array.from(value),
		};
	}

	if (Long.isLong(value)) {
		return value.toNumber();
	}

	return value;
}

function jsonReviver(_: string, value: any): any {
	if (value && typeof value === "object" && value.type) {
		switch (value.type) {
			case "Buffer":
				return Buffer.from(value);
			case "Uint8Array":
				if (Array.isArray(value.data)) {
					return new Uint8Array(value.data);
				}
		}
	}

	return value;
}
