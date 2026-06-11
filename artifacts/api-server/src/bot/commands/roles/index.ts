import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Role,
} from "discord.js";
import { getGuildStore } from "../../store.js";
import { requireOwner, requireWL, isOwner } from "../../utils/permissions.js";
import { errorEmbed } from "../../utils/embeds.js";
import {
  dbSaveEditPack, dbRemoveEditPack,
  dbAddSecureRole, dbRemoveSecureRole,
  dbSaveGuildConfig,
} from "../../db.js";

export async function handleEditRole(msg: Message): Promise<void> {
  if (!msg.guild) return;
  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] }); return; }

  const store = getGuildStore(msg.guild.id);

  let accessiblePacks = store.editPacks;
  if (!isOwner(msg.member!)) {
    accessiblePacks = store.editPacks.filter((p) =>
      msg.member!.roles.cache.has(p.grantorRoleId)
    );
    if (accessiblePacks.length === 0) {
      await msg.reply({ embeds: [errorEmbed("Tu n'as pas de pack de rôles configuré.")] });
      return;
    }
  }

  if (accessiblePacks.length === 0) {
    await msg.reply({ embeds: [errorEmbed("Aucun pack configuré. Utilise `&editpack` pour créer un pack.")] });
    return;
  }

  const packOptions = accessiblePacks.slice(0, 25).map((p) => {
    const grantorRole = msg.guild!.roles.cache.get(p.grantorRoleId);
    const roleNames = p.allowedRoleIds
      .map((id) => msg.guild!.roles.cache.get(id)?.name ?? id)
      .join(", ");
    const hasAll = p.allowedRoleIds.every((id) => target.roles.cache.has(id));
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${hasAll ? "✅" : "⬜"} Pack: ${grantorRole?.name ?? p.grantorRoleId}`)
      .setDescription(`Rôles: ${roleNames.slice(0, 50)}`)
      .setValue(`pack_${p.grantorRoleId}`);
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("editrole_pack_select")
    .setPlaceholder("Choisir un pack à appliquer / retirer...")
    .addOptions(packOptions);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🎭 Gestion des rôles — ${target.user.tag}`)
    .setDescription(
      "Sélectionne un pack à appliquer ou retirer.\n" +
      "✅ = le membre a déjà tous les rôles du pack\n⬜ = pack non appliqué"
    )
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();

  const replyMsg = await msg.reply({ embeds: [embed], components: [row] });

  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60000,
    filter: (i) => i.user.id === msg.author.id,
  });

  collector.on("collect", async (interaction) => {
    const packId = interaction.values[0]!.replace("pack_", "");
    const pack = store.editPacks.find((p) => p.grantorRoleId === packId);
    if (!pack) { await interaction.reply({ content: "Pack introuvable.", ephemeral: true }); return; }

    const roles = pack.allowedRoleIds
      .map((id) => msg.guild!.roles.cache.get(id))
      .filter(Boolean) as Role[];

    for (const role of roles) {
      if (store.secureroles.has(role.id) && !store.wlSecure.has(msg.author.id) && !isOwner(msg.member!)) {
        await interaction.reply({ content: `⛔ Le rôle **${role.name}** est sécurisé.`, ephemeral: true });
        return;
      }
    }

    const hasAll = roles.every((r) => target.roles.cache.has(r.id));

    try {
      if (hasAll) {
        await target.roles.remove(roles);
        const grantorRole = msg.guild!.roles.cache.get(packId);
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`❌ Pack **${grantorRole?.name ?? packId}** retiré de ${target.user.tag}.`)],
          components: [],
        });
      } else {
        await target.roles.add(roles);
        for (const role of roles) {
          const alert = store.alertRoles.get(role.id);
          if (alert) {
            const ch = msg.guild!.channels.cache.get(alert.channelId);
            if (ch?.isTextBased()) {
              const alertEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("ALERTE 🚨")
                .setDescription(
                  `<@&${alert.mentionRoleId}> : <@${msg.author.id}> a mis le rôle <@&${role.id}> à <@${target.id}> (\`${target.id}\`)`
                );
              const derankRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`alert_derank_${target.id}`)
                  .setLabel("🗑️ Derank")
                  .setStyle(ButtonStyle.Danger)
              );
              const alertMsg = await (ch as any).send({ content: `<@&${alert.mentionRoleId}>`, embeds: [alertEmbed], components: [derankRow] }).catch(() => null);
              if (alertMsg) {
                setupDerankCollector(alertMsg, target.id, target.user.tag, msg.guild!, alertEmbed);
              }
            }
          }
        }
        const grantorRole = msg.guild!.roles.cache.get(packId);
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`✅ Pack **${grantorRole?.name ?? packId}** appliqué à ${target.user.tag}.`)],
          components: [],
        });
      }
    } catch {
      await interaction.reply({ content: "**Impossible de modifier les rôles.**", ephemeral: true });
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) replyMsg.edit({ components: [] }).catch(() => {});
  });
}

export function setupDerankCollector(alertMsg: any, targetId: string, targetTag: string, guild: any, embed: EmbedBuilder): void {
  const collector = alertMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 3600000,
  });
  collector.on("collect", async (interaction: any) => {
    if (!interaction.customId.startsWith("alert_derank_")) return;
    try {
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (target) {
        const rolesToRemove = target.roles.cache.filter((r: any) => r.id !== guild.id);
        await target.roles.remove(rolesToRemove);
      }
      const updatedEmbed = EmbedBuilder.from(embed).setColor(0x2ecc71).setDescription(
        (embed.data.description ?? "") + `\n\n✅ Derank effectué par <@${interaction.user.id}>`
      );
      await interaction.update({ embeds: [updatedEmbed], components: [] });
      collector.stop();
    } catch {
      await interaction.reply({ content: "Impossible de derank ce membre.", ephemeral: true });
    }
  });
}

function buildPackListEmbed(msg: Message, store: ReturnType<typeof getGuildStore>): EmbedBuilder {
  const desc = store.editPacks.length > 0
    ? store.editPacks.map((p) => {
        const grantor = msg.guild!.roles.cache.get(p.grantorRoleId);
        const roles = p.allowedRoleIds.map((r) => `<@&${r}>`).join(", ");
        return `(<@&${p.grantorRoleId}>)[${roles}]`;
      }).join("\n")
    : "*Aucun pack configuré*";
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📦 Gestion des packs de rôles")
    .setDescription(desc)
    .setTimestamp();
}

function buildPackActionRow(msg: Message, store: ReturnType<typeof getGuildStore>): ActionRowBuilder<StringSelectMenuBuilder> {
  const actionOptions = [
    new StringSelectMenuOptionBuilder().setLabel("➕ Créer un pack").setValue("create").setDescription("Créer un nouveau pack de rôles"),
  ];
  store.editPacks.slice(0, 11).forEach((p) => {
    const name = msg.guild!.roles.cache.get(p.grantorRoleId)?.name ?? p.grantorRoleId;
    actionOptions.push(
      new StringSelectMenuOptionBuilder().setLabel(`✏️ Modifier: ${name}`).setValue(`edit_${p.grantorRoleId}`),
      new StringSelectMenuOptionBuilder().setLabel(`🗑️ Supprimer: ${name}`).setValue(`delete_${p.grantorRoleId}`)
    );
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId("editpack_action")
    .setPlaceholder("Choisir une action...")
    .addOptions(actionOptions.slice(0, 25));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

const backButtonRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId("editpack_back").setLabel("🔙 Menu").setStyle(ButtonStyle.Secondary)
);

export async function handleEditPack(msg: Message, _args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const replyMsg = await msg.reply({
    embeds: [buildPackListEmbed(msg, store)],
    components: [buildPackActionRow(msg, store)],
  });

  const collector = replyMsg.createMessageComponentCollector({
    time: 300000,
    filter: (i) => i.user.id === msg.author.id,
  });

  const goBack = async (interaction?: any) => {
    const embed = buildPackListEmbed(msg, store);
    const row = buildPackActionRow(msg, store);
    if (interaction) {
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    } else {
      await replyMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
    }
  };

  collector.on("collect", async (interaction) => {
    if (interaction.isButton() && interaction.customId === "editpack_back") {
      await goBack(interaction);
      return;
    }

    if (!interaction.isStringSelectMenu()) return;
    const value = interaction.values[0]!;

    if (value === "create") {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0x9b59b6).setDescription("📝 **Mentionne le rôle granteur puis les rôles autorisés dans ton prochain message.**\nEx: `@modérateur @role1 @role2`\n\nFormat d'affichage: `(@modérateur)[@role1, @role2]`")],
        components: [backButtonRow()],
      });

      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 60000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }

      const response = collected.first()!;
      const roles = Array.from(response.mentions.roles.values());
      await response.delete().catch(() => {});
      if (roles.length < 2) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Tu dois mentionner au moins 2 rôles (1 granteur + au moins 1 rôle autorisé).")], components: [backButtonRow()] });
        return;
      }

      const [grantorRole, ...allowedRoles] = roles;
      store.editPacks.push({ packId: grantorRole!.id, grantorRoleId: grantorRole!.id, allowedRoleIds: allowedRoles.map((r) => r.id) });
      await dbSaveEditPack(msg.guild!.id, grantorRole!.id, allowedRoles.map((r) => r.id));
      await replyMsg.edit({
        embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`✅ Pack créé: (<@&${grantorRole!.id}>)[${allowedRoles.map(r => `<@&${r.id}>`).join(", ")}]`)],
        components: [backButtonRow()],
      });
      return;
    }

    if (value.startsWith("edit_")) {
      const packId = value.replace("edit_", "");
      const pack = store.editPacks.find((p) => p.grantorRoleId === packId);
      if (!pack) { await interaction.reply({ content: "Pack introuvable.", ephemeral: true }); return; }

      const grantorName = msg.guild!.roles.cache.get(packId)?.name ?? packId;
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0x9b59b6).setDescription(`✏️ **Modifier le pack (<@&${packId}>)**\nMentionne les nouveaux rôles autorisés dans ton prochain message.`)],
        components: [backButtonRow()],
      });

      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 60000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }

      const response = collected.first()!;
      const newRoles = Array.from(response.mentions.roles.values());
      await response.delete().catch(() => {});
      if (newRoles.length === 0) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Mentionne au moins un rôle.")], components: [backButtonRow()] });
        return;
      }

      pack.allowedRoleIds = newRoles.map((r) => r.id);
      await dbSaveEditPack(msg.guild!.id, packId, newRoles.map((r) => r.id));
      await replyMsg.edit({
        embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`✅ Pack modifié: (<@&${packId}>)[${newRoles.map(r => `<@&${r.id}>`).join(", ")}]`)],
        components: [backButtonRow()],
      });
      return;
    }

    if (value.startsWith("delete_")) {
      const packId = value.replace("delete_", "");
      const before = store.editPacks.length;
      store.editPacks = store.editPacks.filter((p) => p.grantorRoleId !== packId);
      if (store.editPacks.length < before) {
        await dbRemoveEditPack(msg.guild!.id, packId);
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`🗑️ Pack (<@&${packId}>) supprimé.`)],
          components: [backButtonRow()],
        });
      } else {
        await interaction.reply({ content: "Pack introuvable.", ephemeral: true });
      }
      return;
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) replyMsg.edit({ components: [] }).catch(() => {});
  });
}

export async function handleIdRoles(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const roles = Array.from(msg.guild.roles.cache.values())
    .sort((a, b) => b.position - a.position)
    .map((r) => `**${r.name}** — \`${r.id}\``)
    .slice(0, 50);
  await msg.reply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle("🏷️ Identifiants des rôles").setDescription(roles.join("\n")).setTimestamp()] });
}

export async function handleAddSecure(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const role = msg.mentions.roles.first();
  if (!role) { await msg.reply("**Mentionne un rôle à sécuriser.**"); return; }
  const store = getGuildStore(msg.guild.id);
  store.secureroles.add(role.id);
  await dbAddSecureRole(msg.guild.id, role.id);
  await msg.reply(`<@&${role.id}> est sécurisé.`);
}

export async function handleDelSecure(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const role = msg.mentions.roles.first();
  if (!role) { await msg.reply("**Mentionne un rôle à retirer de la liste sécurisée.**"); return; }
  const store = getGuildStore(msg.guild.id);
  store.secureroles.delete(role.id);
  await dbRemoveSecureRole(msg.guild.id, role.id);
  await msg.reply(`<@&${role.id}> n'est plus sécurisé.`);
}

export async function handleSecureList(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const entries = Array.from(store.secureroles)
    .map((id) => {
      const role = msg.guild!.roles.cache.get(id);
      return role ? `<@&${id}> — **${role.name}**` : `\`${id}\``;
    });

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔒 Rôles sécurisés")
    .setDescription(entries.length > 0 ? entries.join("\n") : "*Aucun rôle sécurisé*")
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleDerank(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("**Mentionne un membre.**"); return; }
  try {
    const rolesToRemove = target.roles.cache.filter((r) => r.id !== msg.guild!.id);
    await target.roles.remove(rolesToRemove);
    await msg.reply(`<@${target.id}> a été derank.`);
  } catch {
    await msg.reply("**Impossible de derank ce membre.**");
  }
}
