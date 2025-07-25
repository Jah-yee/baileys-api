import * as baileys from "baileys";
import { and, eq, inArray, sql } from "drizzle-orm";
import type pino from "pino";
import { db, type TransactionDbClient, tables } from "../db";
import type { WhatsAppConnection } from "./connection";

export class WhatsAppAuthState {
	#connection: WhatsAppConnection;
	#logger: pino.Logger;

	// Mutable, since baileys will mutate the state
	state: baileys.AuthenticationState;

	constructor(connection: WhatsAppConnection) {
		this.#connection = connection;
		this.#logger = connection.logger.child({ name: "WhatsAppAuthState" });

		this.state = {
			creds: baileys.initAuthCreds(),
			keys: {
				get: this.#handleKeysGet,
				set: this.#handleKeysSet,
			},
		};
	}

	async initialize() {
		const credentials = await this.#read("credentials");
		if (credentials) {
			this.state.creds = credentials;
		}
	}

	async saveCredentials() {
		await this.#write("credentials", this.state.creds);
	}

	#handleKeysGet: baileys.SignalKeyStore["get"] = async (type, names) => {
		const data: Record<string, baileys.SignalDataTypeMap[typeof type]> = {};
		const authStates = await this.#readMany(names);

		for (const authState of authStates) {
			let value = authState.state;
			if (type === "app-state-sync-key" && value) {
				value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
			}
			data[authState.name] = value;
		}

		return data;
	};

	#handleKeysSet: baileys.SignalKeyStore["set"] = async (data) => {
		await db.transaction(async (tx) => {
			const promises: Promise<void>[] = [];

			type Category = keyof baileys.SignalDataTypeMap;
			for (const category in data) {
				for (const name in data[category as Category]) {
					const value = data[category as Category]?.[name];
					const stateName = `${category}-${name}`;
					promises.push(
						value
							? this.#write(stateName, value, tx)
							: this.#delete(stateName, tx),
					);
				}
			}

			await Promise.all(promises);
		});
	};

	async #read(name: string) {
		try {
			const data = await db.query.authStates.findFirst({
				where: and(
					eq(tables.authStates.connectionId, this.#connection.id),
					eq(tables.authStates.name, name),
				),
			});
			if (!data) {
				return null;
			}

			return JSON.parse(data.data ?? "{}", baileys.BufferJSON.reviver);
		} catch (err) {
			this.#logger.error({ err }, `Failed to read auth state for "${name}"`);
			return null;
		}
	}

	async #readMany(names: string[]) {
		try {
			const data = await db.query.authStates.findMany({
				where: and(
					eq(tables.authStates.connectionId, this.#connection.id),
					inArray(tables.authStates.name, names),
				),
			});

			const deserialized = data.map((d) => {
				try {
					return {
						...d,
						state: JSON.parse(d.data ?? "{}", baileys.BufferJSON.reviver),
					};
				} catch {
					return { ...d, state: null };
				}
			});

			return deserialized;
		} catch (err) {
			this.#logger.error(
				{ err },
				`Failed to read auth states for "${names.join(", ")}"`,
			);
			return [];
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: This is a dynamic write
	async #write(name: string, value: any, tx?: TransactionDbClient) {
		try {
			await (tx ?? db)
				.insert(tables.authStates)
				.values({
					connectionId: this.#connection.id,
					name,
					data: JSON.stringify(value, baileys.BufferJSON.replacer),
				})
				.onConflictDoUpdate({
					target: [tables.authStates.connectionId, tables.authStates.name],
					set: { data: sql`excluded.data` },
				});
		} catch (err) {
			this.#logger.error({ err }, `Failed to write auth state for "${name}"`);
		}
	}

	async #delete(name: string, tx?: TransactionDbClient) {
		try {
			await (tx ?? db)
				.delete(tables.authStates)
				.where(
					and(
						eq(tables.authStates.connectionId, this.#connection.id),
						eq(tables.authStates.name, name),
					),
				);
		} catch (err) {
			this.#logger.error({ err }, `Failed to delete auth state for "${name}"`);
		}
	}
}
