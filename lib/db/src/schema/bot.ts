import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  varchar,
  primaryKey,
} from "drizzle-orm/pg-core";

// Ban list
export const botBanEntries = pgTable(
  "bot_ban_entries",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    username: text("username").notNull(),
    reason: text("reason").notNull().default("Aucune raison"),
    bannedAt: timestamp("banned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Blacklist
export const botBlacklistEntries = pgTable(
  "bot_blacklist_entries",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    username: text("username").notNull(),
    reason: text("reason").notNull().default("Aucune raison"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Mute list
export const botMuteEntries = pgTable(
  "bot_mute_entries",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    username: text("username").notNull(),
    reason: text("reason").notNull().default("Aucune raison"),
    mutedAt: timestamp("muted_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Owner list
export const botOwnerList = pgTable(
  "bot_owner_list",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Whitelist
export const botWlList = pgTable(
  "bot_wl_list",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// HideMe list
export const botHideMeList = pgTable(
  "bot_hide_me_list",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// AntiMove list
export const botAntiMoveList = pgTable(
  "bot_anti_move_list",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Automate entries
export const botAutomateEntries = pgTable("bot_automate_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  guildId: varchar("guild_id", { length: 20 }).notNull(),
  trigger: text("trigger").notNull(),
  response: text("response").notNull(),
});

// Custom perms per role
export const botCustomPerms = pgTable(
  "bot_custom_perms",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    roleId: varchar("role_id", { length: 20 }).notNull(),
    perms: jsonb("perms").notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.roleId] })]
);

// Edit packs
export const botEditPacks = pgTable(
  "bot_edit_packs",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    grantorRoleId: varchar("grantor_role_id", { length: 20 }).notNull(),
    allowedRoleIds: jsonb("allowed_role_ids").notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.grantorRoleId] })]
);

// Secure roles
export const botSecureRoles = pgTable(
  "bot_secure_roles",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    roleId: varchar("role_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.roleId] })]
);

// WL Secure (users who can assign secure roles)
export const botWlSecure = pgTable(
  "bot_wl_secure",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

// Alert roles: watchRoleId -> channelId + mentionRoleId
export const botAlertRoles = pgTable(
  "bot_alert_roles",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    watchRoleId: varchar("watch_role_id", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 20 }).notNull(),
    mentionRoleId: varchar("mention_role_id", { length: 20 }).notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.watchRoleId] })]
);

// AntiLink channels
export const botAntiLinkChannels = pgTable(
  "bot_anti_link_channels",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.channelId] })]
);

// AllowLink roles per channel
export const botAllowLinkRoles = pgTable(
  "bot_allow_link_roles",
  {
    guildId: varchar("guild_id", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 20 }).notNull(),
    roleId: varchar("role_id", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.channelId, t.roleId] })]
);

// Guild config (mute config, voice config, antideco, etc.)
export const botGuildConfigs = pgTable("bot_guild_configs", {
  guildId: varchar("guild_id", { length: 20 }).primaryKey(),
  muteRoleId: varchar("mute_role_id", { length: 20 }),
  muteChannelId: varchar("mute_channel_id", { length: 20 }),
  muteMaxMinutes: text("mute_max_minutes").notNull().default("60"),
  muteLevels: jsonb("mute_levels").notNull().default([]),
  voiceCreateChannelId: varchar("voice_create_channel_id", { length: 20 }),
  voicePanelChannelId: varchar("voice_panel_channel_id", { length: 20 }),
  voicePanelMessageId: varchar("voice_panel_message_id", { length: 20 }),
  antiDecoLimit: text("anti_deco_limit"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
