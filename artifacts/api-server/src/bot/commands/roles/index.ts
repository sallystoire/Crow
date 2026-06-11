import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

  // Build list of packs accessible to the user
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

    // Check security
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
        // Fire alert for each role added
        for (const role of roles) {
          const alert = store.alertRoles.get(role.id);
          if (alert) {
            const ch = msg.guild!.channels.cache.get(alert.channelId);
            if (ch?.isTextBased()) {
              await (ch as any).send(
                `<@&${alert.mentionRoleId}> ⚠️ <@&${role.id}> attribué à **${target.user.tag}** \`(${target.id})\` par **${msg.author.tag}**`
              ).catch(() => {});
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

export async function handleEditPack(msg: Message, _args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const buildPackEmbed = () => new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📦 Gestion des packs de rôles")
    .setDescription(
      store.editPacks.length > 0
        ? store.editPacks.map((p) => {
            const grantor = msg.guild!.roles.cache.get(p.grantorRoleId)?.name ?? p.grantorRoleId;
            const allowed = p.allowedRoleIds.map((r) => `<@&${r}>`).join(", ");
            return `**${grantor}** → ${allowed}`;
          }).join("\n")
        : "*Aucun pack configuré*"
    )
    .setTimestamp();

  const actionOptions = [
    new StringSelectMenuOptionBuilder().setLabel("➕ Créer un pack").setValue("create").setDescription("Créer un nouveau pack de rôles"),
  ];

  if (store.editPacks.length > 0) {
    store.editPacks.slice(0, 11).forEach((p) => {
      const name = msg.guild!.roles.cache.get(p.grantorRoleId)?.name ?? p.grantorRoleId;
      actionOptions.push(
        new StringSelectMenuOptionBuilder().setLabel(`✏️ Modifier: ${name}`).setValue(`edit_${p.grantorRoleId}`),
        new StringSelectMenuOptionBuilder().setLabel(`🗑️ Supprimer: ${name}`).setValue(`delete_${p.grantorRoleId}`)
      );
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("editpack_action")
    .setPlaceholder("Choisir une action...")
    .addOptions(actionOptions.slice(0, 25));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  const replyMsg = await msg.reply({ embeds: [buildPackEmbed()], components: [row] });

  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 120000,
    filter: (i) => i.user.id === msg.author.id,
  });

  collector.on("collect", async (interaction) => {
    const value = interaction.values[0]!;

    if (value === "create") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setDescription("📝 **Mentionne le rôle granteur puis les rôles autorisés dans ton prochain message.**\nEx: `@modérateur @role1 @role2`")], components: [] });

      const filter = (m: Message) => m.author.id === msg.author.id;
      const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
      if (!collected || collected.size === 0) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("⏱️ Temps écoulé.")], components: [] });
        return;
      }

      const response = collected.first()!;
      const roles = Array.from(response.mentions.roles.values());
      if (roles.length < 2) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Tu dois mentionner au moins 2 rôles (1 granteur + au moins 1 rôle autorisé).")], components: [] });
        return;
      }

      const [grantorRole, ...allowedRoles] = roles;
      store.editPacks.push({ packId: grantorRole!.id, grantorRoleId: grantorRole!.id, allowedRoleIds: allowedRoles.map((r) => r.id) });
      await dbSaveEditPack(msg.guild!.id, grantorRole!.id, allowedRoles.map((r) => r.id));
      await replyMsg.edit({ embeds: [buildPackEmbed().setDescription(`✅ Pack **${grantorRole!.name}** créé avec ${allowedRoles.length} rôle(s).\n\n` + (buildPackEmbed().data.description ?? ""))], components: [] });
      await response.delete().catch(() => {});
      return;
    }

    if (value.startsWith("edit_")) {
      const packId = value.replace("edit_", "");
      const pack = store.editPacks.find((p) => p.grantorRoleId === packId);
      if (!pack) { await interaction.reply({ content: "Pack introuvable.", ephemeral: true }); return; }

      const grantorName = msg.guild!.roles.cache.get(packId)?.name ?? packId;
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setDescription(`✏️ **Modifier le pack "${grantorName}"**\nMentionne les nouveaux rôles autorisés dans ton prochain message.`)], components: [] });

      const filter = (m: Message) => m.author.id === msg.author.id;
      const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
      if (!collected || collected.size === 0) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("⏱️ Temps écoulé.")], components: [] });
        return;
      }

      const response = collected.first()!;
      const newRoles = Array.from(response.mentions.roles.values());
      if (newRoles.length === 0) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Mentionne au moins un rôle.")], components: [] });
        return;
      }

      pack.allowedRoleIds = newRoles.map((r) => r.id);
      await dbSaveEditPack(msg.guild!.id, packId, newRoles.map((r) => r.id));
      await replyMsg.edit({ embeds: [buildPackEmbed().setTitle(`✅ Pack "${grantorName}" modifié`)], components: [] });
      await response.delete().catch(() => {});
      return;
    }

    if (value.startsWith("delete_")) {
      const packId = value.replace("delete_", "");
      const grantorName = msg.guild!.roles.cache.get(packId)?.name ?? packId;
      const before = store.editPacks.length;
      store.editPacks = store.editPacks.filter((p) => p.grantorRoleId !== packId);
      if (store.editPacks.length < before) {
        await dbRemoveEditPack(msg.guild!.id, packId);
        await interaction.update({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`🗑️ Pack **${grantorName}** supprimé.`)], components: [] });
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
  await msg.reply(`Vous avez sécurisé le rôle: <@&${role.id}>`);
}

export async function handleDelSecure(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const role = msg.mentions.roles.first();
  if (!role) { await msg.reply("**Mentionne un rôle à retirer de la liste sécurisée.**"); return; }
  const store = getGuildStore(msg.guild.id);
  store.secureroles.delete(role.id);
  await dbRemoveSecureRole(msg.guild.id, role.id);
  await msg.reply(`Vous avez supprimé la sécurité du rôle: <@&${role.id}>`);
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
