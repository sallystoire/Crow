/**
 * Database persistence layer for the Discord bot.
 * Falls back to in-memory store when DATABASE_URL is not set.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  botBanEntries,
  botBlacklistEntries,
  botMuteEntries,
  botOwnerList,
  botWlList,
  botHideMeList,
  botAntiMoveList,
  botAutomateEntries,
  botCustomPerms,
  botEditPacks,
  botSecureRoles,
  botWlSecure,
  botAlertRoles,
  botAntiLinkChannels,
  botAllowLinkRoles,
  botGuildConfigs,
} from "@workspace/db/schema";
import {
  getGuildStore,
  BanEntry,
  BlacklistEntry,
  MuteEntry,
  GuildStore,
} from "./store.js";
import { logger } from "../lib/logger.js";

const hasDb = !!db;

// ─── INIT: load all persisted data for a guild into memory ──────────────────

export async function loadGuildFromDb(guildId: string): Promise<void> {
  if (!db) return;
  const store = getGuildStore(guildId);

  try {
    const [
      bans,
      bls,
      mutes,
      owners,
      wls,
      hideMes,
      antiMoves,
      automates,
      customPermsRows,
      editPacksRows,
      secureRolesRows,
      wlSecureRows,
      alertRolesRows,
      antiLinkRows,
      allowLinkRows,
      guildConfig,
    ] = await Promise.all([
      db.select().from(botBanEntries).where(eq(botBanEntries.guildId, guildId)),
      db.select().from(botBlacklistEntries).where(eq(botBlacklistEntries.guildId, guildId)),
      db.select().from(botMuteEntries).where(eq(botMuteEntries.guildId, guildId)),
      db.select().from(botOwnerList).where(eq(botOwnerList.guildId, guildId)),
      db.select().from(botWlList).where(eq(botWlList.guildId, guildId)),
      db.select().from(botHideMeList).where(eq(botHideMeList.guildId, guildId)),
      db.select().from(botAntiMoveList).where(eq(botAntiMoveList.guildId, guildId)),
      db.select().from(botAutomateEntries).where(eq(botAutomateEntries.guildId, guildId)),
      db.select().from(botCustomPerms).where(eq(botCustomPerms.guildId, guildId)),
      db.select().from(botEditPacks).where(eq(botEditPacks.guildId, guildId)),
      db.select().from(botSecureRoles).where(eq(botSecureRoles.guildId, guildId)),
      db.select().from(botWlSecure).where(eq(botWlSecure.guildId, guildId)),
      db.select().from(botAlertRoles).where(eq(botAlertRoles.guildId, guildId)),
      db.select().from(botAntiLinkChannels).where(eq(botAntiLinkChannels.guildId, guildId)),
      db.select().from(botAllowLinkRoles).where(eq(botAllowLinkRoles.guildId, guildId)),
      db.select().from(botGuildConfigs).where(eq(botGuildConfigs.guildId, guildId)),
    ]);

    for (const b of bans) {
      store.banList.set(b.userId, { userId: b.userId, username: b.username, reason: b.reason, bannedAt: b.bannedAt });
    }
    for (const b of bls) {
      store.blacklist.set(b.userId, { userId: b.userId, username: b.username, reason: b.reason, blacklistedAt: b.createdAt });
    }
    for (const m of mutes) {
      store.muteList.set(m.userId, { userId: m.userId, username: m.username, reason: m.reason, mutedAt: m.mutedAt, endsAt: m.endsAt ?? undefined });
    }

    for (const o of owners) store.ownerList.add(o.userId);
    for (const w of wls) store.wlList.add(w.userId);
    for (const h of hideMes) store.hideMeList.add(h.userId);
    for (const a of antiMoves) store.antiMoveList.add(a.userId);
    for (const ws of wlSecureRows) store.wlSecure.add(ws.userId);

    for (const a of automates) {
      store.automateList.push({ trigger: a.trigger, response: a.response });
    }
    for (const cp of customPermsRows) {
      store.customPerms.set(cp.roleId, new Set(cp.perms as string[]));
    }
    for (const ep of editPacksRows) {
      store.editPacks.push({ packId: ep.grantorRoleId, grantorRoleId: ep.grantorRoleId, allowedRoleIds: ep.allowedRoleIds as string[] });
    }
    for (const sr of secureRolesRows) store.secureroles.add(sr.roleId);

    // alertRoles: uses direct mentionRoleId column
    for (const ar of alertRolesRows) {
      store.alertRoles.set(ar.watchRoleId, { channelId: ar.channelId, mentionRoleId: ar.mentionRoleId ?? "" });
    }

    for (const al of antiLinkRows) store.antiLinkChannels.add(al.channelId);
    for (const alr of allowLinkRows) {
      if (!store.allowLinkRoles.has(alr.channelId)) store.allowLinkRoles.set(alr.channelId, new Set());
      store.allowLinkRoles.get(alr.channelId)!.add(alr.roleId);
    }

    if (guildConfig[0]) {
      const cfg = guildConfig[0]!;
      // muteLevels may be { levels: [...], reasons: [...] } or just an array (legacy)
      const muteLevelsRaw = cfg.muteLevels as any;
      const levels = Array.isArray(muteLevelsRaw) ? muteLevelsRaw : (muteLevelsRaw?.levels ?? []);
      const muteReasons: string[] = Array.isArray(muteLevelsRaw) ? [] : (muteLevelsRaw?.reasons ?? []);

      store.muteConfig = {
        muteRoleId: cfg.muteRoleId ?? undefined,
        muteChannelId: cfg.muteChannelId ?? undefined,
        maxDurationMinutes: parseInt(cfg.muteMaxMinutes),
        levels,
        muteReasons,
      };
      store.voiceConfig = {
        createChannelId: cfg.voiceCreateChannelId ?? undefined,
        panelChannelId: cfg.voicePanelChannelId ?? undefined,
        panelMessageId: cfg.voicePanelMessageId ?? undefined,
      };
      if (cfg.antiDecoLimit) store.antiDecoLimit = parseInt(cfg.antiDecoLimit);
    }

    logger.info({ guildId }, "Guild data loaded from DB");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to load guild data from DB");
  }
}

// ─── BAN ────────────────────────────────────────────────────────────────────

export async function dbAddBan(guildId: string, entry: BanEntry): Promise<void> {
  if (!db) return;
  await db.insert(botBanEntries).values({ guildId, userId: entry.userId, username: entry.username, reason: entry.reason, bannedAt: entry.bannedAt })
    .onConflictDoUpdate({ target: [botBanEntries.guildId, botBanEntries.userId], set: { username: entry.username, reason: entry.reason, bannedAt: entry.bannedAt } });
}
export async function dbRemoveBan(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botBanEntries).where(and(eq(botBanEntries.guildId, guildId), eq(botBanEntries.userId, userId)));
}
export async function dbClearBans(guildId: string): Promise<void> {
  if (!db) return;
  await db.delete(botBanEntries).where(eq(botBanEntries.guildId, guildId));
}

// ─── BLACKLIST ──────────────────────────────────────────────────────────────

export async function dbAddBlacklist(guildId: string, entry: BlacklistEntry): Promise<void> {
  if (!db) return;
  await db.insert(botBlacklistEntries).values({ guildId, userId: entry.userId, username: entry.username, reason: entry.reason, createdAt: entry.blacklistedAt })
    .onConflictDoUpdate({ target: [botBlacklistEntries.guildId, botBlacklistEntries.userId], set: { username: entry.username, reason: entry.reason } });
}
export async function dbRemoveBlacklist(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botBlacklistEntries).where(and(eq(botBlacklistEntries.guildId, guildId), eq(botBlacklistEntries.userId, userId)));
}
export async function dbClearBlacklist(guildId: string): Promise<void> {
  if (!db) return;
  await db.delete(botBlacklistEntries).where(eq(botBlacklistEntries.guildId, guildId));
}

// ─── MUTE ───────────────────────────────────────────────────────────────────

export async function dbAddMute(guildId: string, entry: MuteEntry): Promise<void> {
  if (!db) return;
  await db.insert(botMuteEntries).values({ guildId, userId: entry.userId, username: entry.username, reason: entry.reason, mutedAt: entry.mutedAt, endsAt: entry.endsAt ?? null })
    .onConflictDoUpdate({ target: [botMuteEntries.guildId, botMuteEntries.userId], set: { reason: entry.reason, endsAt: entry.endsAt ?? null } });
}
export async function dbRemoveMute(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botMuteEntries).where(and(eq(botMuteEntries.guildId, guildId), eq(botMuteEntries.userId, userId)));
}
export async function dbClearMutes(guildId: string): Promise<void> {
  if (!db) return;
  await db.delete(botMuteEntries).where(eq(botMuteEntries.guildId, guildId));
}

// ─── OWNER LIST ──────────────────────────────────────────────────────────────

export async function dbAddOwner(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.insert(botOwnerList).values({ guildId, userId }).onConflictDoNothing();
}
export async function dbRemoveOwner(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botOwnerList).where(and(eq(botOwnerList.guildId, guildId), eq(botOwnerList.userId, userId)));
}

// ─── WL LIST ────────────────────────────────────────────────────────────────

export async function dbAddWl(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.insert(botWlList).values({ guildId, userId }).onConflictDoNothing();
}
export async function dbRemoveWl(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botWlList).where(and(eq(botWlList.guildId, guildId), eq(botWlList.userId, userId)));
}

// ─── WL SECURE ───────────────────────────────────────────────────────────────

export async function dbAddWlSecure(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.insert(botWlSecure).values({ guildId, userId }).onConflictDoNothing();
}
export async function dbRemoveWlSecure(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botWlSecure).where(and(eq(botWlSecure.guildId, guildId), eq(botWlSecure.userId, userId)));
}

// ─── HIDE ME ─────────────────────────────────────────────────────────────────

export async function dbAddHideMe(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.insert(botHideMeList).values({ guildId, userId }).onConflictDoNothing();
}
export async function dbRemoveHideMe(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botHideMeList).where(and(eq(botHideMeList.guildId, guildId), eq(botHideMeList.userId, userId)));
}

// ─── ANTI MOVE ───────────────────────────────────────────────────────────────

export async function dbAddAntiMove(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.insert(botAntiMoveList).values({ guildId, userId }).onConflictDoNothing();
}
export async function dbRemoveAntiMove(guildId: string, userId: string): Promise<void> {
  if (!db) return;
  await db.delete(botAntiMoveList).where(and(eq(botAntiMoveList.guildId, guildId), eq(botAntiMoveList.userId, userId)));
}

// ─── AUTOMATIONS ──────────────────────────────────────────────────────────────

export async function dbAddAutomate(guildId: string, trigger: string, response: string): Promise<void> {
  if (!db) return;
  await db.insert(botAutomateEntries).values({ guildId, trigger, response });
}
export async function dbRemoveAutomate(guildId: string, trigger: string): Promise<void> {
  if (!db) return;
  await db.delete(botAutomateEntries).where(and(eq(botAutomateEntries.guildId, guildId), eq(botAutomateEntries.trigger, trigger)));
}

// ─── CUSTOM PERMS ─────────────────────────────────────────────────────────────

export async function dbSaveCustomPerms(guildId: string, roleId: string, perms: Set<string>): Promise<void> {
  if (!db) return;
  await db.insert(botCustomPerms).values({ guildId, roleId, perms: Array.from(perms) })
    .onConflictDoUpdate({ target: [botCustomPerms.guildId, botCustomPerms.roleId], set: { perms: Array.from(perms) } });
}

// ─── EDIT PACKS ───────────────────────────────────────────────────────────────

export async function dbSaveEditPack(guildId: string, grantorRoleId: string, allowedRoleIds: string[]): Promise<void> {
  if (!db) return;
  await db.insert(botEditPacks).values({ guildId, grantorRoleId, allowedRoleIds })
    .onConflictDoUpdate({ target: [botEditPacks.guildId, botEditPacks.grantorRoleId], set: { allowedRoleIds } });
}
export async function dbRemoveEditPack(guildId: string, grantorRoleId: string): Promise<void> {
  if (!db) return;
  await db.delete(botEditPacks).where(and(eq(botEditPacks.guildId, guildId), eq(botEditPacks.grantorRoleId, grantorRoleId)));
}

// ─── SECURE ROLES ────────────────────────────────────────────────────────────

export async function dbAddSecureRole(guildId: string, roleId: string): Promise<void> {
  if (!db) return;
  await db.insert(botSecureRoles).values({ guildId, roleId }).onConflictDoNothing();
}
export async function dbRemoveSecureRole(guildId: string, roleId: string): Promise<void> {
  if (!db) return;
  await db.delete(botSecureRoles).where(and(eq(botSecureRoles.guildId, guildId), eq(botSecureRoles.roleId, roleId)));
}

// ─── ALERT ROLES ─────────────────────────────────────────────────────────────

export async function dbSaveAlertRole(guildId: string, watchRoleId: string, channelId: string, mentionRoleId: string): Promise<void> {
  if (!db) return;
  await db.insert(botAlertRoles).values({ guildId, watchRoleId, channelId, mentionRoleId })
    .onConflictDoUpdate({ target: [botAlertRoles.guildId, botAlertRoles.watchRoleId], set: { channelId, mentionRoleId } });
}

// ─── ANTI LINK ───────────────────────────────────────────────────────────────

export async function dbAddAntiLinkChannel(guildId: string, channelId: string): Promise<void> {
  if (!db) return;
  await db.insert(botAntiLinkChannels).values({ guildId, channelId }).onConflictDoNothing();
}
export async function dbAddAllowLinkRole(guildId: string, channelId: string, roleId: string): Promise<void> {
  if (!db) return;
  await db.insert(botAllowLinkRoles).values({ guildId, channelId, roleId }).onConflictDoNothing();
}

// ─── GUILD CONFIG ─────────────────────────────────────────────────────────────
// muteReasons is stored inside muteLevels as { levels: [...], reasons: [...] }

export async function dbSaveGuildConfig(guildId: string, store: GuildStore): Promise<void> {
  if (!db) return;
  const muteLevelsEncoded = { levels: store.muteConfig.levels, reasons: store.muteConfig.muteReasons };
  const values = {
    guildId,
    muteRoleId: store.muteConfig.muteRoleId ?? null,
    muteChannelId: store.muteConfig.muteChannelId ?? null,
    muteMaxMinutes: String(store.muteConfig.maxDurationMinutes),
    muteLevels: muteLevelsEncoded,
    voiceCreateChannelId: store.voiceConfig.createChannelId ?? null,
    voicePanelChannelId: store.voiceConfig.panelChannelId ?? null,
    voicePanelMessageId: store.voiceConfig.panelMessageId ?? null,
    antiDecoLimit: store.antiDecoLimit != null ? String(store.antiDecoLimit) : null,
    updatedAt: new Date(),
  };
  await db.insert(botGuildConfigs).values(values)
    .onConflictDoUpdate({ target: [botGuildConfigs.guildId], set: { ...values } });
}

export { hasDb };
