import { sql } from "drizzle-orm";
import { Effect, Schema as S } from "effect";
import * as Database from "~/lib/db/index.js";

export const LidJid = S.String.pipe(S.pattern(/^\d+@lid$/), S.brand("LidJid"));
export type LidJid = typeof LidJid.Type;

export const PhoneNumberJid = S.String.pipe(
	S.pattern(/^\d+@s\.whatsapp\.net$/),
	S.brand("PhoneNumberJid"),
);
export type PhoneNumberJid = typeof PhoneNumberJid.Type;

export type AnyJid = LidJid | PhoneNumberJid;

export const isLidJid = S.is(LidJid);
export const isPhoneNumberJid = S.is(PhoneNumberJid);

/**
 * Try to fetch the alternate `jid` for a given `jid` from the database.
 * If given a `LidJid`, it will return the corresponding `PhoneNumberJid`, and vice versa.
 */
export const getAlternateJidFromDb = Effect.fn("WhatsAppUtils.getAlternateJidFromDb")(function* (
	jid: string,
) {
	const db = yield* Database.Database;
	// If it's not phone number, then assume it's lid per baileys normalization
	const kind = isPhoneNumberJid(jid) ? "phone-number" : "lid";

	const maybeContact = yield* db.query.contacts.findFirst({
		where: {
			// Search for the opposite field of kind that's not empty
			idType: kind,
			RAW: (t) =>
				sql`coalesce(${t.data}->>'${sql.raw(kind === "lid" ? "phoneNumber" : "lid")}', '') <> ''`,
		},
	});
	if (!maybeContact) {
		return null;
	}

	if (kind === "lid" && maybeContact.data.phoneNumber) {
		return maybeContact.data.phoneNumber as AnyJid;
	} else if (kind === "phone-number" && maybeContact.data.lid) {
		return maybeContact.data.lid as AnyJid;
	}
	return null;

	// TODO: Do lookup from other tables (chats, messages) as well
});
