import type { GroupParticipant, proto } from "baileys";
import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	varchar,
} from "drizzle-orm/pg-core";
import type { WhatsAppConnectionOptions } from "../whatsapp/connection";
import { bytea } from "./types/bytea";
import { long } from "./types/long";

export const connections = pgTable("connections", {
	id: bigint({ mode: "number" })
		.notNull()
		.primaryKey()
		.generatedAlwaysAsIdentity(),
	name: varchar({ length: 255 }).notNull().unique(),
	data: jsonb().$type<WhatsAppConnectionOptions>(),
	createdAt: timestamp({ mode: "date", withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp({ mode: "date", withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
});

export const connectionRelations = relations(connections, ({ many }) => ({
	authStates: many(authStates),
	chats: many(chats),
	contacts: many(contacts),
	groups: many(groups),
}));

export const authStates = pgTable(
	"auth_states",
	{
		id: bigint({ mode: "number" })
			.notNull()
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		connectionId: bigint({ mode: "number" })
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),
		name: varchar({ length: 255 }).notNull(),
		data: text().notNull(),
	},
	(table) => [unique().on(table.connectionId, table.name)],
);

export const authStateRelations = relations(authStates, ({ one }) => ({
	connection: one(connections, {
		fields: [authStates.connectionId],
		references: [connections.id],
	}),
}));

export const chats = pgTable(
	"chats",
	{
		internalId: bigint({ mode: "number" })
			.notNull()
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		connectionId: bigint({ mode: "number" })
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),

		id: varchar({ length: 36 }).notNull(),
		messages: jsonb().$type<proto.IHistorySyncMsg[]>(),
		newJid: varchar({ length: 128 }),
		oldJid: varchar({ length: 128 }),
		lastMsgTimestamp: long(),
		unreadCount: integer(),
		readOnly: boolean(),
		endOfHistoryTransfer: boolean(),
		ephemeralExpiration: integer(),
		ephemeralSettingTimestamp: long(),
		endOfHistoryTransferType: smallint(),
		conversationTimestamp: long(),
		name: varchar({ length: 255 }),
		pHash: varchar({ length: 64 }),
		notSpam: boolean(),
		archived: boolean(),
		disappearingMode: jsonb().$type<proto.IDisappearingMode>(),
		unreadMentionCount: integer(),
		markedAsUnread: boolean(),
		participant: jsonb().$type<proto.IGroupParticipant[]>(),
		tcToken: bytea(),
		tcTokenTimestamp: long(),
		contactPrimaryIdentityKey: bytea(),
		pinned: integer(),
		muteEndTime: long(),
		wallpaper: jsonb().$type<proto.IWallpaperSettings>(),
		mediaVisibility: smallint(),
		tcTokenSenderTimestamp: long(),
		suspended: boolean(),
		terminated: boolean(),
		createdAt: long(),
		createdBy: varchar({ length: 128 }),
		description: text(),
		support: boolean(),
		isParentGroup: boolean(),
		parentGroupId: varchar({ length: 128 }),
		isDefaultSubgroup: boolean(),
		displayName: varchar({ length: 255 }),
		pnJid: varchar({ length: 128 }),
		shareOwnPn: boolean(),
		pnhDuplicateLidThread: boolean(),
		lidJid: varchar({ length: 128 }),
		username: varchar({ length: 64 }),
		lidOriginType: varchar({ length: 32 }),
		commentsCount: integer(),
		locked: boolean(),
		systemMessageToInsert: jsonb().$type<proto.PrivacySystemMessage>(),
		capiCreatedGroup: boolean(),
		accountLid: varchar({ length: 128 }),
		limitSharing: boolean(),
		limitSharingSettingTimestamp: long(),
		limitSharingTrigger: smallint(),
		limitSharingInitiatedByMe: boolean(),
		lastMessageRecvTimestamp: bigint({ mode: "number" }),
	},
	(table) => [unique().on(table.connectionId, table.id)],
);

export const chatRelations = relations(chats, ({ one }) => ({
	connection: one(connections, {
		fields: [chats.connectionId],
		references: [connections.id],
	}),
}));

export const contacts = pgTable(
	"contacts",
	{
		internalId: bigint({ mode: "number" })
			.notNull()
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		connectionId: bigint({ mode: "number" })
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),

		id: varchar({ length: 128 }).notNull(),
		lid: varchar({ length: 128 }),
		name: varchar({ length: 255 }),
		notify: varchar({ length: 255 }),
		verifiedName: varchar({ length: 255 }),
		imgUrl: varchar({ length: 2048 }),
		status: varchar({ length: 255 }),
	},
	(table) => [unique().on(table.connectionId, table.id)],
);

export const contactRelations = relations(contacts, ({ one }) => ({
	connection: one(connections, {
		fields: [contacts.connectionId],
		references: [connections.id],
	}),
}));

export const messages = pgTable(
	"messages",
	{
		internalId: bigint({ mode: "number" })
			.notNull()
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		connectionId: bigint({ mode: "number" })
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),

		key: jsonb().$type<proto.IMessageKey>().notNull(),
		message: jsonb().$type<proto.IMessage>(),
		messageTimestamp: long(),
		status: smallint(),
		participant: varchar({ length: 128 }),
		messageC2STimestamp: long(),
		ignore: boolean(),
		starred: boolean(),
		broadcast: boolean(),
		pushName: varchar({ length: 255 }),
		mediaCiphertextSha256: bytea(),
		futureproofData: bytea(),
		messageSecret: bytea(),
		multicast: boolean(),
		urlText: boolean(),
		urlNumber: boolean(),
		messageStubType: smallint(),
		clearMedia: boolean(),
		messageStubParameters: jsonb().$type<string[]>(),
		duration: integer(),
		labels: jsonb().$type<string[]>(),
		paymentInfo: jsonb().$type<proto.IPaymentInfo>(),
		quotedPaymentInfo: jsonb().$type<proto.IPaymentInfo>(),
		finalLiveLocation: jsonb().$type<proto.Message.ILiveLocationMessage>(),
		ephemeralStartTimestamp: long(),
		ephemeralDuration: integer(),
		ephemeralOffToOn: boolean(),
		ephemeralOutOfSync: boolean(),
		bizPrivacyStatus: smallint(),
		verifiedBizName: varchar({ length: 255 }),
		mediaData: jsonb().$type<proto.IMediaData>(),
		quotedStickerData: jsonb().$type<proto.IMediaData>(),
		photoChange: jsonb().$type<proto.IPhotoChange>(),
		userReceipt: jsonb().$type<proto.IUserReceipt[]>(),
		reactions: jsonb().$type<proto.IReaction[]>(),
		statusPsa: jsonb().$type<proto.IStatusPSA>(),
		pollUpdates: jsonb().$type<proto.IPollUpdate[]>(),
		pollAdditionalMetadata: jsonb().$type<proto.IPollAdditionalMetadata>(),
		newsletterServerId: long(),
		eventAdditionalMetadata: jsonb().$type<proto.IEventAdditionalMetadata>(),
		agentId: varchar({ length: 128 }),
		botMessageInvokerJid: varchar({ length: 128 }),
		botTargetId: varchar({ length: 128 }),
		messageAddOns: jsonb().$type<proto.IMessageAddOn[]>(),
		keepInChat: jsonb().$type<proto.IKeepInChat>(),
		pinInChat: jsonb().$type<proto.IPinInChat>(),
		premiumMessageInfo: jsonb().$type<proto.IPremiumMessageInfo>(),
		is1PBizBotMessage: boolean(),
		isGroupHistoryMessage: boolean(),
		commentMetadata: jsonb().$type<proto.ICommentMetadata>(),
		eventResponses: jsonb().$type<proto.IEventResponse[]>(),
		reportingTokenInfo: jsonb().$type<proto.IReportingTokenInfo>(),
		isMentionedInStatus: boolean(),
		statusMentions: jsonb().$type<string[]>(),
		statusMentionMessageInfo: jsonb().$type<proto.IStatusMentionMessage>(),
		statusMentionSources: jsonb().$type<string[]>(),
		isSupportAiMessage: boolean(),
		supportAiCitations: jsonb().$type<proto.ICitation[]>(),
		revokeMessageTimestamp: long(),
	},
	(table) => [unique().on(table.connectionId, table.key)],
);

export const messageRelations = relations(messages, ({ one }) => ({
	connection: one(connections, {
		fields: [messages.connectionId],
		references: [connections.id],
	}),
}));

export const groups = pgTable(
	"groups",
	{
		internalId: bigint({ mode: "number" })
			.notNull()
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		connectionId: bigint({ mode: "number" })
			.notNull()
			.references(() => connections.id, { onDelete: "cascade" }),

		id: varchar({ length: 128 }).notNull(),
		addressingMode: varchar({ length: 3 }).notNull(),
		owner: varchar({ length: 128 }),
		subject: varchar({ length: 255 }).notNull(),
		subjectOwner: varchar({ length: 128 }),
		subjectTime: bigint({ mode: "number" }),
		creation: bigint({ mode: "number" }),
		desc: text(),
		descOwner: varchar({ length: 128 }),
		descId: varchar({ length: 128 }),
		linkedParent: varchar({ length: 128 }),
		restrict: boolean(),
		announce: boolean(),
		memberAddMode: boolean(),
		joinApprovalMode: boolean(),
		isCommunity: boolean(),
		isCommunityAnnounce: boolean(),
		size: integer(),
		participants: jsonb().$type<GroupParticipant[]>().notNull(),
		ephemeralDuration: integer(),
		inviteCode: varchar({ length: 64 }),
		author: varchar({ length: 128 }),
	},
	(table) => [unique().on(table.connectionId, table.id)],
);

export const groupRelations = relations(groups, ({ one }) => ({
	connection: one(connections, {
		fields: [groups.connectionId],
		references: [connections.id],
	}),
}));
