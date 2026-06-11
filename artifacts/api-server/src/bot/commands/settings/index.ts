import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getGuildStore, SYS_USER_ID } from "../../store.js";
import { requireOwner, isSysUser } from "../../utils/permissions.js";
import { errorEmbed } from "../../utils/embeds.js";
import {
  dbAddOwner, dbRemoveOwner,
  dbAddWl, dbRemoveWl,
  dbSaveAlertRole,
  dbAddWlSecure, dbRemoveWlSecure,
} from "../../db.js";

// ─── OWNER ────────────────────────────────────────────────────────────────────

export async function handleOwner(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) {
    await msg.reply("**Format: `&owner add @user` ou `&owner del @user`**");
    return;
  }

  if (action === "add") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply("**Seul l'utilisateur système peut ajouter à la owner list.**");
      return;
    }
    store.ownerList.add(targetUser.id);
    await dbAddOwner(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été ajouté à la ownerlist.`);
    return;
  }

  if (action === "del") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply("**Seul l'utilisateur système peut retirer de la owner list.**");
      return;
    }
    store.ownerList.delete(targetUser.id);
    await dbRemoveOwner(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été supprimé de la ownerlist.`);
    return;
  }

  await msg.reply("**Action inconnue. Utilise `add` ou `del`.**");
}

export async function handleOwnerList(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const entries = Array.from(store.ownerList).map((id) => `<@${id}>`);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("👑 Owner List")
    .setDescription(entries.length > 0 ? entries.join("\n") : "*Aucun owner*")
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

// ─── WL ───────────────────────────────────────────────────────────────────────

export async function handleWl(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) {
    await msg.reply("**Format: `&wl add @user` ou `&wl del @user`**");
    return;
  }

  if (action === "add") {
    store.wlList.add(targetUser.id);
    await dbAddWl(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été ajouté à la whitelist.`);
    return;
  }
  if (action === "del") {
    store.wlList.delete(targetUser.id);
    await dbRemoveWl(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été supprimé de la whitelist.`);
    return;
  }

  await msg.reply("**Action inconnue. Utilise `add` ou `del`.**");
}

export async function handleWList(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const entries = Array.from(store.wlList).map((id) => `<@${id}>`);
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📋 Whitelist")
    .setDescription(entries.length > 0 ? entries.join("\n") : "*Aucun membre en whitelist*")
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

// ─── WL SECURE ────────────────────────────────────────────────────────────────

export async function handleWlSecure(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) {
    await msg.reply("**Format: `&wlsecure add @user` ou `&wlsecure del @user`**");
    return;
  }

  if (action === "add") {
    store.wlSecure.add(targetUser.id);
    await dbAddWlSecure(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été ajouté à la wlsecure.`);
    return;
  }
  if (action === "del") {
    store.wlSecure.delete(targetUser.id);
    await dbRemoveWlSecure(msg.guild.id, targetUser.id);
    await msg.reply(`<@${targetUser.id}> a été supprimé de la wlsecure.`);
    return;
  }

  await msg.reply("**Action inconnue. Utilise `add` ou `del`.**");
}

export async function handleWlSecureList(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const entries = Array.from(store.wlSecure).map((id) => `<@${id}>`);
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔐 WL Secure")
    .setDescription(entries.length > 0 ? entries.join("\n") : "*Aucun membre dans la wlsecure*")
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

// ─── STATS ────────────────────────────────────────────────────────────────────

export async function handleStats(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const role = msg.mentions.roles.first();
  if (!role) { await msg.reply({ embeds: [errorEmbed("Mentionne un rôle.")] }); return; }

  const members = await msg.guild.members.fetch();
  const withRole = members.filter((m) => m.roles.cache.has(role.id));
  const inVoice = withRole.filter((m) => !!m.voice.channel);
  const notInVoice = withRole.filter((m) => !m.voice.channel);

  const lines = [
    `🎙️ **En vocal (${inVoice.size})**`,
    ...inVoice.map((m) => `• ${m.user.tag} — ${m.voice.channel!.name}`),
    ``,
    `💤 **Hors vocal (${notInVoice.size})**`,
    ...notInVoice.map((m) => `• ${m.user.tag}`),
  ].slice(0, 30);

  const embed = new EmbedBuilder()
    .setColor(role.color || 0x9b59b6)
    .setTitle(`📊 Stats — ${role.name}`)
    .setDescription(lines.join("\n"))
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`stats_alert_${role.id}`).setLabel("🔔 Alerte").setStyle(ButtonStyle.Secondary)
  );

  const replyMsg = await msg.reply({ embeds: [embed], components: [row] });
  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: (i) => i.user.id === msg.author.id,
  });

  collector.on("collect", async (interaction) => {
    for (const [, member] of notInVoice) {
      await msg.channel.send(`<@${member.id}> Il faut aller en vocal ou tu perdras tes rôles.`).catch(() => {});
    }
    await interaction.reply({ content: "✅ Alertes envoyées.", ephemeral: true });
  });

  collector.on("end", () => { replyMsg.edit({ components: [] }).catch(() => {}); });
}

// ─── ALERT ROLES ─────────────────────────────────────────────────────────────

export async function handleAlertRoles(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const roles = Array.from(msg.mentions.roles.values());
  if (roles.length < 2) {
    await msg.reply("**Format: `&alertroles @roleDéclencheur @roleMentionné`**");
    return;
  }

  const [triggerRole, mentionRole] = roles as [typeof roles[0], typeof roles[0]];
  const store = getGuildStore(msg.guild.id);
  store.alertRoles.set(triggerRole.id, { channelId: msg.channel.id, mentionRoleId: mentionRole.id });
  await dbSaveAlertRole(msg.guild.id, triggerRole.id, msg.channel.id, mentionRole.id);

  await msg.reply(`<@&${triggerRole.id}> a été ajouté à l'alerte.`);
}

export async function handleAlertRoleList(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  if (store.alertRoles.size === 0) {
    await msg.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("🔔 Alertes de rôles").setDescription("*Aucune alerte configurée*").setTimestamp()],
    });
    return;
  }

  const lines = Array.from(store.alertRoles.entries()).map(([watchRoleId, alert]) => {
    const channel = msg.guild!.channels.cache.get(alert.channelId);
    return `<@&${watchRoleId}> → notifie <@&${alert.mentionRoleId}> dans ${channel ? `<#${alert.channelId}>` : `\`${alert.channelId}\``}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🔔 Alertes de rôles configurées")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}
