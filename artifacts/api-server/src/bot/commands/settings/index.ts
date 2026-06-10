import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getGuildStore, SYS_USER_ID } from "../../store.js";
import { requireOwner, requireWL, isOwner, isSysUser } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed, infoEmbed } from "../../utils/embeds.js";
import {
  dbAddOwner, dbRemoveOwner,
  dbAddWl, dbRemoveWl,
  dbSaveCustomPerms,
  dbAddAutomate, dbRemoveAutomate,
  dbSaveAlertRole,
  dbSaveEditPack, dbRemoveEditPack,
  dbAddSecureRole, dbRemoveSecureRole,
} from "../../db.js";

export async function handleSet(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  if (args[0] === "off") {
    const role = msg.mentions.roles.first();
    const perm = args[2] ?? args[args.length - 1];
    if (!role || !perm) { await msg.reply({ embeds: [errorEmbed("Format: `.set off @role perm`")] }); return; }
    const rolePerms = store.customPerms.get(role.id);
    if (rolePerms) rolePerms.delete(perm);
    await dbSaveCustomPerms(msg.guild.id, role.id, rolePerms ?? new Set());
    await msg.reply({ embeds: [successEmbed(`Permission \`${perm}\` retirée de <@&${role.id}>.`)] });
    return;
  }

  const role = msg.mentions.roles.first();
  const perm = args[1] ?? args[args.length - 1];
  if (!role || !perm) { await msg.reply({ embeds: [errorEmbed("Format: `.set @role perm`")] }); return; }

  if (!store.customPerms.has(role.id)) store.customPerms.set(role.id, new Set());
  store.customPerms.get(role.id)!.add(perm);
  await dbSaveCustomPerms(msg.guild.id, role.id, store.customPerms.get(role.id)!);
  await msg.reply({ embeds: [successEmbed(`Permission \`${perm}\` accordée à <@&${role.id}>.`)] });
}

export async function handlePerms(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const lines: string[] = [];
  for (const [roleId, perms] of store.customPerms) {
    if (perms.size > 0) lines.push(`<@&${roleId}>: ${Array.from(perms).map((p) => `\`${p}\``).join(", ")}`);
  }
  await msg.reply({ embeds: [listEmbed("⚙️ Permissions personnalisées", lines, 0x34495e)] });
}

export async function handleOwner(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) { await msg.reply({ embeds: [errorEmbed("Format: `.owner add @user` ou `.owner del @user`")] }); return; }

  if (action === "add") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply({ embeds: [errorEmbed("Seul l'utilisateur système peut ajouter à la owner list.")] }); return;
    }
    store.ownerList.add(targetUser.id);
    await dbAddOwner(msg.guild.id, targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** ajouté à la owner list.`)] });
    return;
  }

  if (action === "del") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply({ embeds: [errorEmbed("Seul l'utilisateur système peut retirer de la owner list.")] }); return;
    }
    store.ownerList.delete(targetUser.id);
    await dbRemoveOwner(msg.guild.id, targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** retiré de la owner list.`)] });
    return;
  }

  await msg.reply({ embeds: [errorEmbed("Action inconnue. Utilise `add` ou `del`.")] });
}

export async function handleWl(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) { await msg.reply({ embeds: [errorEmbed("Format: `.wl add @user` ou `.wl del @user`")] }); return; }

  if (action === "add") {
    store.wlList.add(targetUser.id);
    await dbAddWl(msg.guild.id, targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** ajouté à la wl list.`)] });
    return;
  }
  if (action === "del") {
    store.wlList.delete(targetUser.id);
    await dbRemoveWl(msg.guild.id, targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** retiré de la wl list.`)] });
    return;
  }

  await msg.reply({ embeds: [errorEmbed("Action inconnue. Utilise `add` ou `del`.")] });
}

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

export async function handleAlertRoles(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const roles = Array.from(msg.mentions.roles.values());
  if (roles.length < 2) { await msg.reply({ embeds: [errorEmbed("Mentionne 2 rôles: `.alertroles @role1 @role2`")] }); return; }

  const [, watchRole] = roles as [typeof roles[0], typeof roles[0]];
  const store = getGuildStore(msg.guild.id);
  store.alertRoles.set(watchRole.id, msg.channel.id);
  await dbSaveAlertRole(msg.guild.id, watchRole.id, msg.channel.id);

  await msg.reply({ embeds: [successEmbed(`Alerte configurée pour <@&${watchRole.id}> dans ${msg.channel}.`)] });
}

export async function handleAutomate(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  const fullText = args.join(" ");

  const addMatch = fullText.match(/^add\s+"(.+?)"\s+"(.+)"$/i);
  if (addMatch) {
    const trigger = addMatch[1]!.toLowerCase();
    const response = addMatch[2]!;
    store.automateList.push({ trigger, response });
    await dbAddAutomate(msg.guild.id, trigger, response);
    await msg.reply({ embeds: [successEmbed(`Automate ajouté: \`${trigger}\` → \`${response}\``)] });
    return;
  }

  const delMatch = fullText.match(/^del\s+"(.+?)"$/i);
  if (delMatch) {
    const trigger = delMatch[1]!.toLowerCase();
    const before = store.automateList.length;
    store.automateList = store.automateList.filter((a) => a.trigger !== trigger);
    if (store.automateList.length < before) {
      await dbRemoveAutomate(msg.guild.id, trigger);
      await msg.reply({ embeds: [successEmbed(`Automate \`${trigger}\` supprimé.`)] });
    } else {
      await msg.reply({ embeds: [errorEmbed("Automate introuvable.")] });
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("🤖 Automates configurés")
    .setDescription(
      store.automateList.length > 0
        ? store.automateList.map((a) => `**"${a.trigger}"** → "${a.response}"`).join("\n")
        : "*Aucun automate*"
    )
    .addFields(
      { name: "Ajouter", value: '`.automate add "trigger" "réponse"`' },
      { name: "Supprimer", value: '`.automate del "trigger"`' }
    )
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}
