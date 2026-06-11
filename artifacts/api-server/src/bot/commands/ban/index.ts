import { Message } from "discord.js";
import { getGuildStore } from "../../store.js";
import { requireOwner, requireWL } from "../../utils/permissions.js";
import { listEmbed } from "../../utils/embeds.js";
import {
  dbAddBan, dbRemoveBan, dbClearBans,
  dbAddBlacklist, dbRemoveBlacklist, dbClearBlacklist,
} from "../../db.js";

export async function handleBan(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("**Mentionne un membre à bannir.**"); return; }
  if (target.id === msg.author.id) { await msg.reply("**Tu ne peux pas te bannir toi-même.**"); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const store = getGuildStore(msg.guild.id);

  let success = false;
  try {
    await target.ban({ reason });
    success = true;
  } catch {}

  if (success) {
    const entry = { userId: target.id, username: target.user.tag, reason, bannedAt: new Date() };
    store.banList.set(target.id, entry);
    await dbAddBan(msg.guild.id, entry);
    await msg.reply(`**${target.user.tag} a été banni du serveur pour : ${reason}**`).catch(() => {});
  } else {
    await msg.reply("**Impossible de bannir ce membre.**").catch(() => {});
  }
}

export async function handleUnban(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const userId = args[0]?.replace(/[<@>]/g, "");
  if (!userId) { await msg.reply("**Fournis l'ID ou la mention de l'utilisateur.**"); return; }

  let success = false;
  try {
    await msg.guild.members.unban(userId);
    success = true;
  } catch {}

  if (success) {
    const store = getGuildStore(msg.guild.id);
    store.banList.delete(userId);
    await dbRemoveBan(msg.guild.id, userId);
    await msg.reply(`**<@${userId}> a été débanni.**`).catch(() => {});
  } else {
    await msg.reply("**Impossible de débannir cet utilisateur.**").catch(() => {});
  }
}

export async function handleKick(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild || !msg.member) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("**Mentionne un membre à kick.**"); return; }
  if (target.id === msg.author.id) { await msg.reply("**Tu ne peux pas te kick toi-même.**"); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";

  let success = false;
  try {
    await target.kick(reason);
    success = true;
  } catch {}

  if (success) {
    await msg.reply(`**${target.user.tag} a été kick du serveur pour : ${reason}**`).catch(() => {});
  } else {
    await msg.reply("**Impossible de kick ce membre.**").catch(() => {});
  }
}

export async function handleBlacklist(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("**Mentionne un membre à blacklister.**"); return; }
  if (target.id === msg.author.id) { await msg.reply("**Tu ne peux pas te blacklister toi-même.**"); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const store = getGuildStore(msg.guild.id);

  let success = false;
  try {
    await target.ban({ reason: `[BLACKLIST] ${reason}` });
    success = true;
  } catch {}

  if (success) {
    const entry = { userId: target.id, username: target.user.tag, reason, blacklistedAt: new Date() };
    store.blacklist.set(target.id, entry);
    await dbAddBlacklist(msg.guild.id, entry);
    await msg.reply(`**${target.user.tag} a été blacklisté du serveur pour : ${reason}**`).catch(() => {});
  } else {
    await msg.reply("**Impossible de blacklister ce membre.**").catch(() => {});
  }
}

export async function handleUnbl(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const userId = args[0]?.replace(/[<@>]/g, "");
  if (!userId) { await msg.reply("**Fournis l'ID ou la mention de l'utilisateur.**"); return; }

  let success = false;
  try {
    await msg.guild.members.unban(userId);
    success = true;
  } catch {}

  if (success) {
    const store = getGuildStore(msg.guild.id);
    store.blacklist.delete(userId);
    await dbRemoveBlacklist(msg.guild.id, userId);
    await msg.reply(`**Le blacklist de <@${userId}> a été révoqué.**`).catch(() => {});
  } else {
    await msg.reply("**Impossible de révoquer ce blacklist.**").catch(() => {});
  }
}

export async function handleBanList(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const entries = Array.from(store.banList.values()).map(
    (b) => `**${b.username}** \`${b.userId}\` — ${b.reason}`
  );
  await msg.reply({ embeds: [listEmbed("📋 Liste des Bans", entries, 0xe74c3c)] });
}

export async function handleBlList(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const entries = Array.from(store.blacklist.values()).map(
    (b) => `**${b.username}** \`${b.userId}\` — ${b.reason}`
  );
  await msg.reply({ embeds: [listEmbed("⛔ Liste des Blacklists", entries, 0x2c3e50)] });
}

export async function handleClearBan(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  const bans = await msg.guild.bans.fetch();
  let count = 0;
  for (const [userId] of bans) {
    try { await msg.guild.members.unban(userId); count++; } catch {}
  }
  store.banList.clear();
  await dbClearBans(msg.guild.id);
  await msg.reply(`**${count} ban(s) ont été supprimés.**`);
}

export async function handleClearBl(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  let count = 0;
  for (const [userId] of store.blacklist) {
    try { await msg.guild.members.unban(userId); count++; } catch {}
  }
  store.blacklist.clear();
  await dbClearBlacklist(msg.guild.id);
  await msg.reply(`**${count} blacklist(s) ont été supprimés.**`);
}
