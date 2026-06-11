import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ComponentType,
} from "discord.js";
import { getGuildStore, MuteEntry } from "../../store.js";
import { requireOwner, requireWL, isOwner } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed } from "../../utils/embeds.js";
import { dbAddMute, dbRemoveMute, dbClearMutes, dbSaveGuildConfig } from "../../db.js";

function buildSetupEmbed(store: ReturnType<typeof getGuildStore>): EmbedBuilder {
  const cfg = store.muteConfig;
  const levelsText = cfg.levels.length > 0
    ? cfg.levels.map((l) => `**Niveau ${l.level}:** ${l.roleIds.map((r) => `<@&${r}>`).join(", ")} — ${l.canTempmute ? "&tempmute ✓" : ""}${l.canUnmute ? " &unmute ✓" : ""}`).join("\n")
    : "*Aucun niveau*";
  const reasonsText = cfg.muteReasons.length > 0
    ? cfg.muteReasons.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "*Aucune raison définie*";

  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚙️ Configuration du système de mute")
    .addFields(
      { name: "🔇 Rôle mute", value: cfg.muteRoleId ? `<@&${cfg.muteRoleId}>` : "*non défini*", inline: true },
      { name: "📢 Salon sanction", value: cfg.muteChannelId ? `<#${cfg.muteChannelId}>` : "*non défini*", inline: true },
      { name: "⏱️ Temps max", value: `**${cfg.maxDurationMinutes} minutes**`, inline: true },
      { name: "🏅 Niveaux", value: levelsText, inline: false },
      { name: "📋 Raisons de mute", value: reasonsText, inline: false },
    )
    .setTimestamp();
}

function buildMainMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("setupmute_select")
    .setPlaceholder("Que voulez-vous configurer ?")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("⏱️ Temps max").setValue("maxtime"),
      new StringSelectMenuOptionBuilder().setLabel("📢 Salon sanction").setValue("channel"),
      new StringSelectMenuOptionBuilder().setLabel("🔇 Rôle mute").setValue("role"),
      new StringSelectMenuOptionBuilder().setLabel("🏅 Ajouter un niveau").setValue("level"),
      new StringSelectMenuOptionBuilder().setLabel("📋 Ajouter une raison").setValue("reason"),
      new StringSelectMenuOptionBuilder().setLabel("🗑️ Supprimer une raison").setValue("delreason"),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

const backBtn = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId("setupmute_back").setLabel("🔙 Menu").setStyle(ButtonStyle.Secondary)
);

export async function handleSetupMuteParam(msg: Message, _args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const replyMsg = await msg.reply({ embeds: [buildSetupEmbed(store)], components: [buildMainMenu()] });

  const collector = replyMsg.createMessageComponentCollector({
    time: 300000,
    filter: (i) => i.user.id === msg.author.id,
  });

  const goBack = async (interaction?: any) => {
    if (interaction) {
      await interaction.update({ embeds: [buildSetupEmbed(store)], components: [buildMainMenu()] }).catch(() => {});
    } else {
      await replyMsg.edit({ embeds: [buildSetupEmbed(store)], components: [buildMainMenu()] }).catch(() => {});
    }
  };

  collector.on("collect", async (interaction) => {
    if (interaction.isButton() && interaction.customId === "setupmute_back") {
      await goBack(interaction);
      return;
    }
    if (!interaction.isStringSelectMenu()) return;

    const choice = interaction.values[0]!;

    if (choice === "maxtime") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("⏱️ **Quelle est la durée max en minutes ?** (Réponds dans ce salon)")], components: [backBtn()] });
      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 30000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }
      const minutes = parseInt(collected.first()!.content, 10);
      await collected.first()!.delete().catch(() => {});
      if (isNaN(minutes) || minutes < 1) { await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Durée invalide.")], components: [backBtn()] }); return; }
      store.muteConfig.maxDurationMinutes = minutes;
      await dbSaveGuildConfig(msg.guild!.id, store);
      await goBack();
      return;
    }

    if (choice === "channel") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("📢 **Mentionne le salon de sanction.**")], components: [backBtn()] });
      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 30000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }
      const channel = collected.first()!.mentions.channels.first();
      await collected.first()!.delete().catch(() => {});
      if (!channel) { await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Salon introuvable.")], components: [backBtn()] }); return; }
      store.muteConfig.muteChannelId = channel.id;
      await dbSaveGuildConfig(msg.guild!.id, store);
      await goBack();
      return;
    }

    if (choice === "role") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("🔇 **Mentionne le rôle mute.** (ou tape `auto` pour le créer automatiquement)")], components: [backBtn()] });
      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 30000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }
      const resp = collected.first()!;
      const role = resp.mentions.roles.first();
      await resp.delete().catch(() => {});

      if (!role) {
        try {
          const newRole = await msg.guild!.roles.create({ name: "Muet", color: 0x808080, reason: "Rôle mute auto-créé" });
          for (const ch of msg.guild!.channels.cache.values()) {
            if (ch.isTextBased() && ch instanceof TextChannel) {
              await ch.permissionOverwrites.edit(newRole, { SendMessages: false }).catch(() => {});
            }
          }
          store.muteConfig.muteRoleId = newRole.id;
          await dbSaveGuildConfig(msg.guild!.id, store);
        } catch {}
      } else {
        store.muteConfig.muteRoleId = role.id;
        for (const ch of msg.guild!.channels.cache.values()) {
          if (ch.isTextBased() && ch instanceof TextChannel) {
            await ch.permissionOverwrites.edit(role, { SendMessages: false }).catch(() => {});
          }
        }
        await dbSaveGuildConfig(msg.guild!.id, store);
      }
      await goBack();
      return;
    }

    if (choice === "level") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("🏅 **Format: `<niveau> @role1 @role2 [tempmute] [unmute]`**\nEx: `1 @modérateur tempmute`")], components: [backBtn()] });
      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 60000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }
      const response = collected.first()!;
      const levelNum = parseInt(response.content, 10);
      const roles = Array.from(response.mentions.roles.values());
      const canTempmute = /tempmute/i.test(response.content);
      const canUnmute = /unmute/i.test(response.content);
      await response.delete().catch(() => {});

      if (isNaN(levelNum) || roles.length === 0) {
        await replyMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Format invalide.")], components: [backBtn()] });
        return;
      }

      const existing = store.muteConfig.levels.find((l) => l.level === levelNum);
      if (existing) {
        existing.roleIds = roles.map((r) => r.id);
        existing.canTempmute = canTempmute;
        existing.canUnmute = canUnmute;
      } else {
        store.muteConfig.levels.push({ level: levelNum, roleIds: roles.map((r) => r.id), canTempmute, canUnmute });
        store.muteConfig.levels.sort((a, b) => a.level - b.level);
      }
      await dbSaveGuildConfig(msg.guild!.id, store);
      await goBack();
      return;
    }

    if (choice === "reason") {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("📋 **Quelle raison veux-tu ajouter ?**")], components: [backBtn()] });
      const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 30000 }).catch(() => null);
      if (!collected || collected.size === 0) { await goBack(); return; }
      const reason = collected.first()!.content.trim();
      await collected.first()!.delete().catch(() => {});
      if (!reason) { await goBack(); return; }
      store.muteConfig.muteReasons.push(reason);
      await dbSaveGuildConfig(msg.guild!.id, store);
      await goBack();
      return;
    }

    if (choice === "delreason") {
      if (store.muteConfig.muteReasons.length === 0) {
        await interaction.reply({ content: "Aucune raison à supprimer.", ephemeral: true });
        return;
      }
      const reasonMenu = new StringSelectMenuBuilder()
        .setCustomId("setupmute_delreason_select")
        .setPlaceholder("Choisir la raison à supprimer...")
        .addOptions(
          store.muteConfig.muteReasons.slice(0, 25).map((r, i) =>
            new StringSelectMenuOptionBuilder().setLabel(r.slice(0, 80)).setValue(String(i))
          )
        );
      const reasonRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(reasonMenu);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("🗑️ **Quelle raison supprimer ?**")], components: [reasonRow, backBtn()] });
      return;
    }

    // Handle delreason selection
    if (interaction.isStringSelectMenu() && interaction.customId === "setupmute_delreason_select") {
      const idx = parseInt(interaction.values[0]!);
      store.muteConfig.muteReasons.splice(idx, 1);
      await dbSaveGuildConfig(msg.guild!.id, store);
      await goBack(interaction);
      return;
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) replyMsg.edit({ components: [] }).catch(() => {});
  });
}

function canMute(msg: Message, target: any): boolean {
  const store = getGuildStore(msg.guild!.id);
  if (isOwner(msg.member!)) return true;
  const memberLevel = store.muteConfig.levels.find((l) =>
    l.roleIds.some((rid) => msg.member!.roles.cache.has(rid))
  );
  if (!memberLevel || !memberLevel.canTempmute) return false;
  const targetLevel = store.muteConfig.levels.find((l) =>
    l.roleIds.some((rid) => target.roles?.cache.has(rid))
  );
  if (!targetLevel) return true;
  return memberLevel.level > targetLevel.level;
}

export async function handleTempMute(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à muter.")] }); return; }
  if (target.id === msg.author.id) { await msg.reply({ embeds: [errorEmbed("Tu ne peux pas te muter toi-même.")] }); return; }
  if (!canMute(msg, target)) { await msg.reply({ embeds: [errorEmbed("Tu n'as pas la permission de muter ce membre.")] }); return; }

  const store = getGuildStore(msg.guild.id);
  if (!store.muteConfig.muteRoleId) {
    await msg.reply({ embeds: [errorEmbed("Configure d'abord un rôle mute avec `&setupmute`.")] });
    return;
  }

  const durationArg = parseInt(args[1] ?? "0", 10);
  const defaultDuration = 10;

  if (store.muteConfig.muteReasons.length > 0) {
    const reasonOptions = store.muteConfig.muteReasons.slice(0, 24).map((r, i) =>
      new StringSelectMenuOptionBuilder().setLabel(r.slice(0, 80)).setValue(`reason_${i}`)
    );
    reasonOptions.push(
      new StringSelectMenuOptionBuilder().setLabel("✏️ Autre raison").setValue("reason_custom")
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId("tempmute_reason")
      .setPlaceholder("Choisir une raison de mute...")
      .addOptions(reasonOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    const duration = durationArg > 0 ? durationArg : defaultDuration;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🔇 Mute temporaire — ${target.user.tag}`)
      .setDescription(`Durée: **${duration} min**\nChoisissez la raison du mute:`)
      .setTimestamp();

    const replyMsg = await msg.reply({ embeds: [embed], components: [row] });

    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 30000,
      filter: (i) => i.user.id === msg.author.id,
    });

    collector.on("collect", async (interaction) => {
      const choice = interaction.values[0]!;
      let reason = "Aucune raison";

      if (choice === "reason_custom") {
        await interaction.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription("✏️ **Quelle est la raison ?** (Réponds dans ce salon)")], components: [] });
        const collected = await msg.channel.awaitMessages({ filter: (m) => m.author.id === msg.author.id, max: 1, time: 30000 }).catch(() => null);
        if (collected && collected.size > 0) {
          reason = collected.first()!.content.trim();
          await collected.first()!.delete().catch(() => {});
        }
      } else {
        const idx = parseInt(choice.replace("reason_", ""));
        reason = store.muteConfig.muteReasons[idx] ?? "Aucune raison";
        await interaction.deferUpdate().catch(() => {});
      }

      await applyMute(msg, target, store, duration, reason, replyMsg);
    });

    collector.on("end", (collected) => {
      if (collected.size === 0) replyMsg.edit({ components: [] }).catch(() => {});
    });
  } else {
    const duration = durationArg > 0 ? durationArg : defaultDuration;
    const reason = args.slice(2).join(" ") || "Aucune raison";
    await applyMute(msg, target, store, duration, reason, null);
  }
}

async function applyMute(
  msg: Message,
  target: any,
  store: ReturnType<typeof getGuildStore>,
  duration: number,
  reason: string,
  replyMsg: Message | null
): Promise<void> {
  const maxDuration = store.muteConfig.maxDurationMinutes;
  if (!isOwner(msg.member!) && duration > maxDuration) {
    const text = `**La durée max autorisée est ${maxDuration} minutes.**`;
    if (replyMsg) await replyMsg.edit({ content: text, embeds: [], components: [] }).catch(() => {});
    else await msg.reply(text);
    return;
  }

  try {
    await target.roles.add(store.muteConfig.muteRoleId!);
    const endsAt = new Date(Date.now() + duration * 60000);

    const timerRef = setTimeout(async () => {
      try {
        const member = await msg.guild!.members.fetch(target.id);
        await member.roles.remove(store.muteConfig.muteRoleId!);
        store.muteList.delete(target.id);
        await dbRemoveMute(msg.guild!.id, target.id);
      } catch {}
    }, duration * 60000);

    const entry: MuteEntry = { userId: target.id, username: target.user.tag, reason, mutedAt: new Date(), endsAt, timerRef };
    store.muteList.set(target.id, entry);
    await dbAddMute(msg.guild!.id, entry);

    const successText = `🔇 **${target.user.tag}** muté pour **${duration} minutes** — *${reason}*`;

    if (replyMsg) {
      await replyMsg.edit({ content: successText, embeds: [], components: [] }).catch(() => {});
    } else {
      await msg.reply(successText);
    }

    if (store.muteConfig.muteChannelId) {
      const ch = msg.guild!.channels.cache.get(store.muteConfig.muteChannelId);
      if (ch?.isTextBased()) {
        await (ch as any).send(`🔇 <@${target.id}> a été muté pour **${duration} min** — *${reason}*`).catch(() => {});
      }
    }
  } catch {
    const text = "**Impossible de muter ce membre.**";
    if (replyMsg) await replyMsg.edit({ content: text, embeds: [], components: [] }).catch(() => {});
    else await msg.reply(text);
  }
}

export async function handleUnmute(msg: Message): Promise<void> {
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à unmuter.")] }); return; }

  const store = getGuildStore(msg.guild.id);
  const canUnmute = isOwner(msg.member!) ||
    store.muteConfig.levels.some((l) => l.canUnmute && l.roleIds.some((rid) => msg.member!.roles.cache.has(rid)));
  if (!canUnmute) { await msg.reply({ embeds: [errorEmbed("Tu n'as pas la permission de unmuter.")] }); return; }
  if (!store.muteConfig.muteRoleId) { await msg.reply({ embeds: [errorEmbed("Aucun rôle mute configuré.")] }); return; }

  try {
    const entry = store.muteList.get(target.id);
    if (entry?.timerRef) clearTimeout(entry.timerRef);
    store.muteList.delete(target.id);
    await dbRemoveMute(msg.guild.id, target.id);
    await target.roles.remove(store.muteConfig.muteRoleId);
    await msg.reply({ embeds: [successEmbed(`🔊 **${target.user.tag}** a été unmute.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de unmuter ce membre.")] });
  }
}

export async function handleMuteList(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const entries = Array.from(store.muteList.values()).map((m) => {
    const end = m.endsAt ? `jusqu'à <t:${Math.floor(m.endsAt.getTime() / 1000)}:R>` : "permanent";
    return `**${m.username}** — *${m.reason}* (${end})`;
  });
  await msg.reply({ embeds: [listEmbed("🔇 Liste des membres mutés", entries, 0xe67e22)] });
}

export async function handleUnmuteAll(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  if (!store.muteConfig.muteRoleId) { await msg.reply({ embeds: [errorEmbed("Aucun rôle mute configuré.")] }); return; }

  let count = 0;
  for (const [userId, entry] of store.muteList) {
    try {
      const member = await msg.guild.members.fetch(userId);
      await member.roles.remove(store.muteConfig.muteRoleId);
      if (entry.timerRef) clearTimeout(entry.timerRef);
      count++;
    } catch {}
  }
  store.muteList.clear();
  await dbClearMutes(msg.guild.id);
  await msg.reply({ embeds: [successEmbed(`🔊 ${count} membre(s) ont été unmute.`)] });
}
