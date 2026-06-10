import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ComponentType,
  TextChannel,
  Role,
} from "discord.js";
import { getGuildStore, MuteEntry } from "../../store.js";
import { requireOwner, requireWL, isOwner } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed } from "../../utils/embeds.js";

export async function handleSetupMute(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚙️ Configuration du système de mute")
    .setDescription(
      "Utilise les commandes suivantes pour configurer le mute:\n\n" +
        "`.setupmute channel #salon` — définir le salon de mute\n" +
        "`.setupmute role @role` — définir le rôle mute\n" +
        "`.setupmute maxtime minutes` — définir la durée max de tempmute\n" +
        "`.setupmute level niveau @role1 @role2` — définir les niveaux\n\n" +
        "**Configuration actuelle:**\n" +
        `Salon: ${store.muteConfig.muteChannelId ? `<#${store.muteConfig.muteChannelId}>` : "*non défini*"}\n` +
        `Rôle mute: ${store.muteConfig.muteRoleId ? `<@&${store.muteConfig.muteRoleId}>` : "*non défini*"}\n` +
        `Durée max: **${store.muteConfig.maxDurationMinutes} minutes**\n` +
        `Niveaux configurés: **${store.muteConfig.levels.length}**`
    )
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleSetupMuteParam(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);
  const subCmd = args[0];

  if (subCmd === "channel") {
    const channel = msg.mentions.channels.first();
    if (!channel) {
      await msg.reply({ embeds: [errorEmbed("Mentionne un salon.")] });
      return;
    }
    store.muteConfig.muteChannelId = channel.id;
    await msg.reply({ embeds: [successEmbed(`Salon de mute défini: <#${channel.id}>`)] });
    return;
  }

  if (subCmd === "role") {
    const role = msg.mentions.roles.first();
    if (!role) {
      await msg.reply({ embeds: [errorEmbed("Mentionne un rôle.")] });
      return;
    }
    store.muteConfig.muteRoleId = role.id;
    for (const channel of msg.guild.channels.cache.values()) {
      if (channel.isTextBased() && channel instanceof TextChannel) {
        await channel.permissionOverwrites.edit(role, { SendMessages: false }).catch(() => {});
      }
    }
    await msg.reply({ embeds: [successEmbed(`Rôle mute défini: <@&${role.id}>`)] });
    return;
  }

  if (subCmd === "maxtime") {
    const minutes = parseInt(args[1] ?? "60", 10);
    if (isNaN(minutes) || minutes < 1) {
      await msg.reply({ embeds: [errorEmbed("Durée invalide.")] });
      return;
    }
    store.muteConfig.maxDurationMinutes = minutes;
    await msg.reply({ embeds: [successEmbed(`Durée max de tempmute: **${minutes} minutes**`)] });
    return;
  }

  if (subCmd === "level") {
    const level = parseInt(args[1] ?? "1", 10);
    const roles = Array.from(msg.mentions.roles.values());
    if (isNaN(level) || roles.length === 0) {
      await msg.reply({ embeds: [errorEmbed("Format: `.setupmute level N @role1 @role2`")] });
      return;
    }
    const existing = store.muteConfig.levels.find((l) => l.level === level);
    if (existing) {
      existing.roleIds = roles.map((r) => r.id);
    } else {
      store.muteConfig.levels.push({
        level,
        roleIds: roles.map((r) => r.id),
        canTempmute: true,
        canUnmute: level >= 2,
      });
    }
    await msg.reply({
      embeds: [successEmbed(`Niveau ${level} configuré: ${roles.map((r) => `<@&${r.id}>`).join(", ")}`)],
    });
    return;
  }

  await handleSetupMute(msg);
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
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre à muter.")] });
    return;
  }
  if (target.id === msg.author.id) {
    await msg.reply({ embeds: [errorEmbed("Tu ne peux pas te muter toi-même.")] });
    return;
  }

  if (!canMute(msg, target)) {
    await msg.reply({ embeds: [errorEmbed("Tu n'as pas la permission de muter ce membre.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);

  if (!store.muteConfig.muteRoleId) {
    await msg.reply({ embeds: [errorEmbed("Configure d'abord un rôle mute avec `.setupmute role @role`.")] });
    return;
  }

  const durationArg = args[1];
  const duration = parseInt(durationArg ?? "10", 10);
  const reason = args.slice(2).join(" ") || "Aucune raison";

  if (isNaN(duration) || duration < 1) {
    await msg.reply({ embeds: [errorEmbed("Durée invalide (en minutes).")] });
    return;
  }

  const maxDuration = store.muteConfig.maxDurationMinutes;
  if (!isOwner(msg.member!) && duration > maxDuration) {
    await msg.reply({ embeds: [errorEmbed(`La durée max autorisée est ${maxDuration} minutes.`)] });
    return;
  }

  try {
    await target.roles.add(store.muteConfig.muteRoleId);

    const endsAt = new Date(Date.now() + duration * 60000);

    const timerRef = setTimeout(async () => {
      try {
        const member = await msg.guild!.members.fetch(target.id);
        await member.roles.remove(store.muteConfig.muteRoleId!);
        store.muteList.delete(target.id);
      } catch {}
    }, duration * 60000);

    store.muteList.set(target.id, {
      userId: target.id,
      username: target.user.tag,
      reason,
      mutedAt: new Date(),
      endsAt,
      timerRef,
    });

    await msg.reply({
      embeds: [
        successEmbed(
          `🔇 **${target.user.tag}** a été mute pour **${duration} minutes** — *${reason}*`
        ),
      ],
    });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de muter ce membre.")] });
  }
}

export async function handleUnmute(msg: Message): Promise<void> {
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre à unmuter.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);

  const canUnmute = isOwner(msg.member!) ||
    store.muteConfig.levels.some(
      (l) => l.canUnmute && l.roleIds.some((rid) => msg.member!.roles.cache.has(rid))
    );

  if (!canUnmute) {
    await msg.reply({ embeds: [errorEmbed("Tu n'as pas la permission de unmuter.")] });
    return;
  }

  if (!store.muteConfig.muteRoleId) {
    await msg.reply({ embeds: [errorEmbed("Aucun rôle mute configuré.")] });
    return;
  }

  try {
    const entry = store.muteList.get(target.id);
    if (entry?.timerRef) clearTimeout(entry.timerRef);
    store.muteList.delete(target.id);

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
    const end = m.endsAt
      ? `jusqu'à <t:${Math.floor(m.endsAt.getTime() / 1000)}:R>`
      : "permanent";
    return `**${m.username}** — *${m.reason}* (${end})`;
  });

  await msg.reply({ embeds: [listEmbed("🔇 Liste des membres mutés", entries, 0xe67e22)] });
}

export async function handleUnmuteAll(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  if (!store.muteConfig.muteRoleId) {
    await msg.reply({ embeds: [errorEmbed("Aucun rôle mute configuré.")] });
    return;
  }

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
  await msg.reply({ embeds: [successEmbed(`🔊 ${count} membre(s) ont été unmute.`)] });
}
