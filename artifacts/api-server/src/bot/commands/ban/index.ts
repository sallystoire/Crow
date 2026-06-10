import { Message } from "discord.js";
import { getGuildStore } from "../../store.js";
import { requireOwner, requireWL } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed } from "../../utils/embeds.js";
import {
  dbAddBan, dbRemoveBan, dbClearBans,
  dbAddBlacklist, dbRemoveBlacklist, dbClearBlacklist,
} from "../../db.js";

export async function handleBan(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à bannir.")] }); return; }
  if (target.id === msg.author.id) { await msg.reply({ embeds: [errorEmbed("Tu ne peux pas te bannir toi-même.")] }); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const store = getGuildStore(msg.guild.id);

  try {
    await target.ban({ reason });
    const entry = { userId: target.id, username: target.user.tag, reason, bannedAt: new Date() };
    store.banList.set(target.id, entry);
    await dbAddBan(msg.guild.id, entry);
    await msg.reply({ embeds: [successEmbed(`Vous avez banni **${target.user.tag}** du serveur pour **${reason}**`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de bannir ce membre.")] });
  }
}

export async function handleUnban(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const userId = args[0]?.replace(/[<@>]/g, "");
  if (!userId) { await msg.reply({ embeds: [errorEmbed("Fournis l'ID ou la mention de l'utilisateur.")] }); return; }

  try {
    await msg.guild.members.unban(userId);
    const store = getGuildStore(msg.guild.id);
    store.banList.delete(userId);
    await dbRemoveBan(msg.guild.id, userId);
    await msg.reply({ embeds: [successEmbed(`L'utilisateur <@${userId}> a été débanni.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de débannir cet utilisateur.")] });
  }
}

export async function handleKick(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild || !msg.member) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à kick.")] }); return; }
  if (target.id === msg.author.id) { await msg.reply({ embeds: [errorEmbed("Tu ne peux pas te kick toi-même.")] }); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  try {
    await target.kick(reason);
    await msg.reply({ embeds: [successEmbed(`Vous avez kick **${target.user.tag}** du serveur pour **${reason}**`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de kick ce membre.")] });
  }
}

export async function handleBlacklist(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à blacklister.")] }); return; }
  if (target.id === msg.author.id) { await msg.reply({ embeds: [errorEmbed("Tu ne peux pas te blacklister toi-même.")] }); return; }

  const reason = args.slice(1).join(" ") || "Aucune raison fournie";
  const store = getGuildStore(msg.guild.id);

  try {
    await target.ban({ reason: `[BLACKLIST] ${reason}` });
    const entry = { userId: target.id, username: target.user.tag, reason, blacklistedAt: new Date() };
    store.blacklist.set(target.id, entry);
    await dbAddBlacklist(msg.guild.id, entry);
    await msg.reply({ embeds: [successEmbed(`Vous avez blacklist **${target.user.tag}** du serveur pour **${reason}**`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de blacklister ce membre.")] });
  }
}

export async function handleUnbl(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const userId = args[0]?.replace(/[<@>]/g, "");
  if (!userId) { await msg.reply({ embeds: [errorEmbed("Fournis l'ID ou la mention de l'utilisateur.")] }); return; }

  try {
    await msg.guild.members.unban(userId);
    const store = getGuildStore(msg.guild.id);
    store.blacklist.delete(userId);
    await dbRemoveBlacklist(msg.guild.id, userId);
    await msg.reply({ embeds: [successEmbed(`Le blacklist de <@${userId}> a été révoqué.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de révoquer ce blacklist.")] });
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
  await msg.reply({ embeds: [successEmbed(`${count} bans ont été supprimés.`)] });
}

export async function handleClearBl(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  for (const [userId] of store.blacklist) {
    try { await msg.guild.members.unban(userId); } catch {}
  }
  store.blacklist.clear();
  await dbClearBlacklist(msg.guild.id);
  await msg.reply({ embeds: [successEmbed("Tous les blacklists ont été supprimés.")] });
}
