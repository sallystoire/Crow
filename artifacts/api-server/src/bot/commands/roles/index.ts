import {
  Message,
  GuildMember,
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
import { requireOwner, requireWL, isWL, isOwner } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed, infoEmbed } from "../../utils/embeds.js";

export async function handleEditRole(msg: Message): Promise<void> {
  if (!msg.guild) return;
  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);

  let availableRoles: Role[];

  if (isOwner(msg.member!)) {
    availableRoles = msg.guild.roles.cache
      .filter((r) => r.id !== msg.guild!.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .first(25) as unknown as Role[];
  } else {
    const memberRole = msg.member!.roles.cache.find((r) =>
      store.editPacks.some((p) => p.grantorRoleId === r.id)
    );

    if (!memberRole) {
      await msg.reply({ embeds: [errorEmbed("Tu n'as pas de pack de rôles configuré.")] });
      return;
    }

    const pack = store.editPacks.find((p) => p.grantorRoleId === memberRole.id);
    if (!pack) return;

    availableRoles = pack.allowedRoleIds
      .map((id) => msg.guild!.roles.cache.get(id))
      .filter(Boolean) as Role[];
  }

  if (availableRoles.length === 0) {
    await msg.reply({ embeds: [errorEmbed("Aucun rôle disponible.")] });
    return;
  }

  const targetHasRole = (r: Role) => target.roles.cache.has(r.id);

  const addOptions = availableRoles
    .filter((r) => !targetHasRole(r))
    .slice(0, 12)
    .map((r) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`Ajouter: ${r.name}`)
        .setValue(`add_${r.id}`)
    );

  const removeOptions = availableRoles
    .filter((r) => targetHasRole(r))
    .slice(0, 12)
    .map((r) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`Retirer: ${r.name}`)
        .setValue(`remove_${r.id}`)
    );

  const options = [...addOptions, ...removeOptions];
  if (options.length === 0) {
    await msg.reply({ embeds: [errorEmbed("Aucune action disponible pour ce membre.")] });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("editrole_select")
    .setPlaceholder("Choisir une action...")
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🎭 Gestion des rôles — ${target.user.tag}`)
    .setDescription("Sélectionne le rôle à ajouter ou retirer.")
    .setThumbnail(target.user.displayAvatarURL())
    .setTimestamp();

  const replyMsg = await msg.reply({ embeds: [embed], components: [row] });

  const collector = replyMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30000,
    filter: (i) => i.user.id === msg.author.id,
  });

  collector.on("collect", async (interaction) => {
    const [action, roleId] = interaction.values[0]!.split("_") as [string, string];
    const role = msg.guild!.roles.cache.get(roleId);
    if (!role) return;

    const isSecure = store.secureroles.has(roleId);
    if (isSecure && !store.wlSecure.has(msg.author.id) && !isOwner(msg.member!)) {
      await interaction.reply({
        embeds: [errorEmbed(`Le rôle **${role.name}** est sécurisé.`)],
        ephemeral: true,
      });
      return;
    }

    try {
      if (action === "add") {
        await target.roles.add(role);
        const alertChannel = store.alertRoles.get(roleId);
        if (alertChannel) {
          const ch = msg.guild!.channels.cache.get(alertChannel);
          if (ch?.isTextBased()) {
            await ch.send(
              `⚠️ **Alerte rôle**: <@&${roleId}> a été attribué à **${target.user.tag}** \`(${target.id})\` par **${msg.author.tag}** \`(${msg.author.id})\``
            );
          }
        }
        await interaction.update({
          embeds: [successEmbed(`Le rôle **${role.name}** a été ajouté à ${target.user.tag}.`)],
          components: [],
        });
      } else {
        await target.roles.remove(role);
        await interaction.update({
          embeds: [successEmbed(`Le rôle **${role.name}** a été retiré de ${target.user.tag}.`)],
          components: [],
        });
      }
    } catch {
      await interaction.reply({
        embeds: [errorEmbed("Impossible de modifier ce rôle.")],
        ephemeral: true,
      });
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      replyMsg.edit({ components: [] }).catch(() => {});
    }
  });
}

export async function handleEditPack(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📦 Gestion des packs de rôles")
    .setDescription(
      store.editPacks.length > 0
        ? store.editPacks
            .map(
              (p) =>
                `**Pack**: <@&${p.grantorRoleId}> → ${p.allowedRoleIds.map((r) => `<@&${r}>`).join(", ")}`
            )
            .join("\n")
        : "*Aucun pack configuré*"
    )
    .addFields({
      name: "Ajouter un pack",
      value: "`.editpack add @grantorRole @role1 @role2 ...`",
    })
    .addFields({
      name: "Supprimer un pack",
      value: "`.editpack del @grantorRole`",
    })
    .setTimestamp();

  if (args[0] === "add") {
    const roles = msg.mentions.roles;
    if (roles.size < 2) {
      await msg.reply({ embeds: [errorEmbed("Mentionne le rôle granteur puis les rôles autorisés.")] });
      return;
    }
    const [grantorRole, ...allowedRoles] = roles.values();
    store.editPacks.push({
      packId: grantorRole!.id,
      grantorRoleId: grantorRole!.id,
      allowedRoleIds: allowedRoles.map((r) => r.id),
    });
    await msg.reply({ embeds: [successEmbed(`Pack créé: <@&${grantorRole!.id}> peut attribuer ${allowedRoles.map((r) => `<@&${r.id}>`).join(", ")}`)] });
    return;
  }

  if (args[0] === "del") {
    const role = msg.mentions.roles.first();
    if (!role) {
      await msg.reply({ embeds: [errorEmbed("Mentionne le rôle granteur à supprimer.")] });
      return;
    }
    const before = store.editPacks.length;
    store.editPacks = store.editPacks.filter((p) => p.grantorRoleId !== role.id);
    if (store.editPacks.length < before) {
      await msg.reply({ embeds: [successEmbed(`Pack du rôle <@&${role.id}> supprimé.`)] });
    } else {
      await msg.reply({ embeds: [errorEmbed("Pack introuvable.")] });
    }
    return;
  }

  await msg.reply({ embeds: [embed] });
}

export async function handleIdRoles(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const roles = msg.guild.roles.cache
    .sort((a, b) => b.position - a.position)
    .map((r) => `**${r.name}** — \`${r.id}\``)
    .slice(0, 50);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🏷️ Identifiants des rôles")
    .setDescription(roles.join("\n"))
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleAddSecure(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const role = msg.mentions.roles.first();
  if (!role) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un rôle à sécuriser.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);
  store.secureroles.add(role.id);
  await msg.reply({ embeds: [successEmbed(`Le rôle <@&${role.id}> est maintenant sécurisé.`)] });
}

export async function handleDelSecure(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const role = msg.mentions.roles.first();
  if (!role) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un rôle à retirer de la liste sécurisée.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);
  store.secureroles.delete(role.id);
  await msg.reply({ embeds: [successEmbed(`Le rôle <@&${role.id}> a été retiré de la liste sécurisée.`)] });
}

export async function handleDerank(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] });
    return;
  }

  try {
    const rolesToRemove = target.roles.cache.filter((r) => r.id !== msg.guild!.id);
    await target.roles.remove(rolesToRemove);
    await msg.reply({ embeds: [successEmbed(`**${target.user.tag}** a été derank (tous ses rôles ont été retirés).`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de derank ce membre.")] });
  }
}
