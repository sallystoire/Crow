import {
  Message,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { getGuildStore, SYS_USER_ID } from "../../store.js";
import { requireOwner, requireWL, isOwner, isSysUser } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed, infoEmbed } from "../../utils/embeds.js";

export async function handleSet(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  if (args[0] === "off") {
    const role = msg.mentions.roles.first();
    const perm = args[2] ?? args[args.length - 1];
    if (!role || !perm) {
      await msg.reply({ embeds: [errorEmbed("Format: `.set off @role perm`")] });
      return;
    }
    const rolePerms = store.customPerms.get(role.id);
    if (rolePerms) {
      rolePerms.delete(perm);
    }
    await msg.reply({ embeds: [successEmbed(`La permission \`${perm}\` a été retirée du rôle <@&${role.id}>.`)] });
    return;
  }

  const role = msg.mentions.roles.first();
  const perm = args[1] ?? args[args.length - 1];
  if (!role || !perm) {
    await msg.reply({ embeds: [errorEmbed("Format: `.set @role perm`")] });
    return;
  }

  if (!store.customPerms.has(role.id)) {
    store.customPerms.set(role.id, new Set());
  }
  store.customPerms.get(role.id)!.add(perm);

  await msg.reply({ embeds: [successEmbed(`La permission \`${perm}\` a été accordée au rôle <@&${role.id}>.`)] });
}

export async function handlePerms(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  const lines: string[] = [];

  for (const [roleId, perms] of store.customPerms) {
    if (perms.size > 0) {
      lines.push(`<@&${roleId}>: ${Array.from(perms).map((p) => `\`${p}\``).join(", ")}`);
    }
  }

  await msg.reply({ embeds: [listEmbed("⚙️ Permissions personnalisées", lines, 0x34495e)] });
}

export async function handleOwner(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  const isAuthorized = isSysUser(msg.author.id) || msg.author.id === msg.guild.ownerId || isOwner(msg.member!);

  const action = args[0];
  const targetUser = msg.mentions.users.first();

  if (!action || !targetUser) {
    await msg.reply({ embeds: [errorEmbed("Format: `.owner add @user` ou `.owner del @user`")] });
    return;
  }

  if (action === "add") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply({ embeds: [errorEmbed("Seul l'utilisateur système peut ajouter à la owner list.")] });
      return;
    }
    store.ownerList.add(targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** a été ajouté à la owner list.`)] });
    return;
  }

  if (action === "del") {
    if (!isSysUser(msg.author.id) && msg.author.id !== msg.guild.ownerId) {
      await msg.reply({ embeds: [errorEmbed("Seul l'utilisateur système peut retirer de la owner list.")] });
      return;
    }
    store.ownerList.delete(targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** a été retiré de la owner list.`)] });
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

  if (!action || !targetUser) {
    await msg.reply({ embeds: [errorEmbed("Format: `.wl add @user` ou `.wl del @user`")] });
    return;
  }

  if (action === "add") {
    store.wlList.add(targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** a été ajouté à la wl list.`)] });
    return;
  }

  if (action === "del") {
    store.wlList.delete(targetUser.id);
    await msg.reply({ embeds: [successEmbed(`**${targetUser.tag}** a été retiré de la wl list.`)] });
    return;
  }

  await msg.reply({ embeds: [errorEmbed("Action inconnue. Utilise `add` ou `del`.")] });
}

export async function handleStats(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const role = msg.mentions.roles.first();
  if (!role) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un rôle.")] });
    return;
  }

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

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`stats_alert_${role.id}`)
      .setLabel("🔔 Alerte")
      .setStyle(ButtonStyle.Secondary)
  );

  const replyMsg = await msg.reply({ embeds: [embed], components: [row] });

  const { ComponentType } = await import("discord.js");
  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: (i) => i.user.id === msg.author.id,
  });

  collector.on("collect", async (interaction) => {
    for (const [, member] of notInVoice) {
      await msg.channel
        .send(`<@${member.id}> Il faut aller en vocal ou tu perdras tes rôles.`)
        .catch(() => {});
    }
    await interaction.reply({ content: "✅ Alertes envoyées.", ephemeral: true });
  });

  collector.on("end", () => {
    replyMsg.edit({ components: [] }).catch(() => {});
  });
}

export async function handleAlertRoles(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const roles = Array.from(msg.mentions.roles.values());
  if (roles.length < 2) {
    await msg.reply({ embeds: [errorEmbed("Mentionne 2 rôles: `.alertroles @role1 @role2`")] });
    return;
  }

  const [alertRole, watchRole] = roles as [typeof roles[0], typeof roles[0]];
  const store = getGuildStore(msg.guild.id);
  store.alertRoles.set(watchRole.id, msg.channel.id);

  await msg.reply({
    embeds: [
      successEmbed(
        `Quand <@&${watchRole.id}> est attribué, une alerte sera envoyée dans ${msg.channel} mentionnant <@&${alertRole.id}>.`
      ),
    ],
  });
}

export async function handleAutomate(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  const fullText = args.join(" ");

  const addMatch = fullText.match(/^add\s+"(.+?)"\s+"(.+)"$/i);
  if (addMatch) {
    store.automateList.push({
      trigger: addMatch[1]!.toLowerCase(),
      response: addMatch[2]!,
    });
    await msg.reply({ embeds: [successEmbed(`Automate ajouté: \`${addMatch[1]}\` → \`${addMatch[2]}\``)] });
    return;
  }

  const delMatch = fullText.match(/^del\s+"(.+?)"$/i);
  if (delMatch) {
    const before = store.automateList.length;
    store.automateList = store.automateList.filter(
      (a) => a.trigger !== delMatch[1]!.toLowerCase()
    );
    if (store.automateList.length < before) {
      await msg.reply({ embeds: [successEmbed(`Automate \`${delMatch[1]}\` supprimé.`)] });
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
