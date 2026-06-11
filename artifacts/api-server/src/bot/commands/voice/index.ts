import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  VoiceChannel,
  ChannelType,
  PermissionFlagsBits,
  VoiceState,
} from "discord.js";
import { getGuildStore, TempVoiceChannel } from "../../store.js";
import { requireOwner, requireWL, isOwner } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed, infoEmbed } from "../../utils/embeds.js";
import { dbSaveGuildConfig, dbAddAntiMove, dbRemoveAntiMove } from "../../db.js";

export async function handleVoiceJoinCreate(voiceState: VoiceState): Promise<void> {
  if (!voiceState.guild || !voiceState.channelId) return;
  const store = getGuildStore(voiceState.guild.id);
  if (voiceState.channelId !== store.voiceConfig.createChannelId) return;

  try {
    const member = voiceState.member!;
    const category = voiceState.channel?.parentId;
    const newChannel = await voiceState.guild.channels.create({
      name: `🎙️ ${member.displayName}`,
      type: ChannelType.GuildVoice,
      parent: category ?? undefined,
      permissionOverwrites: [
        { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
      ],
    });
    await member.voice.setChannel(newChannel);
    store.tempVoices.set(newChannel.id, {
      channelId: newChannel.id, ownerId: member.id, isPrivate: false, allowedUsers: [],
    });
  } catch {}
}

export async function handleVoiceLeave(voiceState: VoiceState): Promise<void> {
  if (!voiceState.guild || !voiceState.channelId) return;
  const store = getGuildStore(voiceState.guild.id);
  const tempVoice = store.tempVoices.get(voiceState.channelId);
  if (!tempVoice) return;
  const channel = voiceState.guild.channels.cache.get(voiceState.channelId) as VoiceChannel | undefined;
  if (channel && channel.members.size === 0) {
    await channel.delete().catch(() => {});
    store.tempVoices.delete(voiceState.channelId);
  }
}

export async function handleVc(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  let total = 0, muted = 0, deafened = 0, streaming = 0, video = 0;
  for (const channel of msg.guild.channels.cache.values()) {
    if (!channel.isVoiceBased()) continue;
    for (const member of (channel as VoiceChannel).members.values()) {
      total++;
      if (member.voice.mute) muted++;
      if (member.voice.deaf) deafened++;
      if (member.voice.streaming) streaming++;
      if (member.voice.selfVideo) video++;
    }
  }
  await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x1abc9c).setTitle("🎙️ Statistiques vocales")
      .addFields(
        { name: "👥 Total en vocal", value: `${total}`, inline: true },
        { name: "🔇 Micro coupé", value: `${muted}`, inline: true },
        { name: "🎧 Casque coupé", value: `${deafened}`, inline: true },
        { name: "📡 En stream", value: `${streaming}`, inline: true },
        { name: "📷 En cam", value: `${video}`, inline: true }
      ).setTimestamp()],
  });
}

export async function handleJoinVoice(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] }); return; }
  const targetVoice = target.voice.channel;
  if (!targetVoice) { await msg.reply({ embeds: [errorEmbed(`**${target.user.tag}** n'est pas en vocal.`)] }); return; }
  if (!msg.member?.voice.channel) { await msg.reply({ embeds: [errorEmbed("Tu dois être en vocal pour utiliser cette commande.")] }); return; }
  try {
    await msg.member.voice.setChannel(targetVoice);
    await msg.reply({ embeds: [successEmbed(`Vous avez rejoint la vocal **${targetVoice.name}** avec **${target.user.tag}**`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de rejoindre ce salon vocal.")] });
  }
}

export async function handleMove(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply({ embeds: [errorEmbed("Mentionne un membre à déplacer.")] }); return; }
  const store = getGuildStore(msg.guild.id);
  if (store.antiMoveList.has(target.id)) { await msg.reply({ embeds: [errorEmbed(`**${target.user.tag}** est dans la liste antimove.`)] }); return; }
  const myVoice = msg.member?.voice.channel;
  if (!myVoice) { await msg.reply({ embeds: [errorEmbed("Tu dois être en vocal pour déplacer quelqu'un.")] }); return; }
  try {
    await target.voice.setChannel(myVoice);
    await msg.reply({ embeds: [successEmbed(`**${target.user.tag}** a été déplacé dans **${myVoice.name}**.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de déplacer ce membre.")] });
  }
}

export async function handleAntiDeco(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const count = parseInt(args[0] ?? "3", 10);
  if (isNaN(count) || count < 1) { await msg.reply({ embeds: [errorEmbed("Fournis un nombre valide.")] }); return; }
  const store = getGuildStore(msg.guild.id);
  store.antiDecoLimit = count;
  await dbSaveGuildConfig(msg.guild.id, store);
  await msg.reply({ embeds: [successEmbed(`AntiDeco activé: après **${count}** déconnexions, les rôles seront retirés.`)] });
}

export async function handlePv(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const voiceChannel = msg.member?.voice.channel as VoiceChannel | null;
  if (!voiceChannel) { await msg.reply({ embeds: [errorEmbed("Tu n'es pas en vocal.")] }); return; }
  const store = getGuildStore(msg.guild.id);
  const tempVoice = store.tempVoices.get(voiceChannel.id);
  if (tempVoice && tempVoice.ownerId !== msg.member!.id) { await msg.reply({ embeds: [errorEmbed("Tu n'es pas propriétaire de cette vocal.")] }); return; }
  try {
    await voiceChannel.permissionOverwrites.edit(msg.guild.roles.everyone, { Connect: false });
    if (tempVoice) tempVoice.isPrivate = true;
    await msg.reply({ embeds: [successEmbed(`🔒 La vocal **${voiceChannel.name}** est maintenant privée.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de privatiser ce salon.")] });
  }
}

export async function handlePvList(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);

  const privateVoices = Array.from(store.tempVoices.values())
    .filter((tv) => tv.isPrivate)
    .map((tv) => {
      const ch = msg.guild!.channels.cache.get(tv.channelId) as VoiceChannel | undefined;
      const owner = msg.guild!.members.cache.get(tv.ownerId);
      const members = ch ? ch.members.size : 0;
      return ch
        ? `🔒 **${ch.name}** — Proprio: <@${tv.ownerId}> — ${members} membre(s)`
        : `🔒 \`${tv.channelId}\` *(introuvable)*`;
    });

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🔒 Salons vocaux privés")
    .setDescription(privateVoices.length > 0 ? privateVoices.join("\n") : "*Aucun salon vocal privé*")
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleAccess(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const voiceChannel = msg.member?.voice.channel as VoiceChannel | null;
  if (!voiceChannel) { await msg.reply("Tu n'es pas en vocal."); return; }
  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("Mentionne un membre."); return; }
  try {
    await voiceChannel.permissionOverwrites.edit(target, { Connect: true });
    await msg.reply(`✅ <@${target.id}> peut rejoindre la vocal **${voiceChannel.name}**.`);
  } catch {
    await msg.reply("Impossible d'accorder l'accès.");
  }
}

export async function handleUnpv(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;
  const voiceChannel = msg.member?.voice.channel as VoiceChannel | null;
  if (!voiceChannel) { await msg.reply({ embeds: [errorEmbed("Tu n'es pas en vocal.")] }); return; }
  try {
    await voiceChannel.permissionOverwrites.edit(msg.guild.roles.everyone, { Connect: null });
    const store = getGuildStore(msg.guild.id);
    const tv = store.tempVoices.get(voiceChannel.id);
    if (tv) tv.isPrivate = false;
    await msg.reply({ embeds: [successEmbed(`🔓 La vocal **${voiceChannel.name}** est maintenant publique.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de rendre publique cette vocal.")] });
  }
}

export async function handleUnpvAll(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  let count = 0;
  for (const [channelId, tv] of store.tempVoices) {
    if (!tv.isPrivate) continue;
    const channel = msg.guild.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel) {
      await channel.permissionOverwrites.edit(msg.guild.roles.everyone, { Connect: null }).catch(() => {});
      tv.isPrivate = false;
      count++;
    }
  }
  await msg.reply({ embeds: [successEmbed(`🔓 ${count} vocal(s) rendue(s) publique(s).`)] });
}

export async function handleWakeUp(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) { await msg.reply("**Mentionne un membre.**"); return; }
  if (!target.voice.channel) { await msg.reply(`**${target.user.tag} n'est pas en vocal.**`); return; }

  const originalChannel = target.voice.channel;

  const publicVoiceChannels = Array.from(msg.guild.channels.cache.values()).filter(
    (ch) =>
      ch.type === ChannelType.GuildVoice &&
      ch.permissionsFor(msg.guild!.roles.everyone)?.has(PermissionFlagsBits.Connect) &&
      ch.id !== originalChannel.id
  ) as VoiceChannel[];

  if (publicVoiceChannels.length === 0) {
    await msg.reply("**Aucun salon vocal public trouvé.**");
    return;
  }

  await msg.reply(`🔔 **${target.user.tag}** va être déplacé dans ${publicVoiceChannels.length} salon(s) vocal(aux).`);

  for (const ch of publicVoiceChannels.slice(0, 10)) {
    try {
      await target.voice.setChannel(ch);
      await new Promise((r) => setTimeout(r, 1000));
    } catch {}
  }

  // Return to original channel
  try {
    await target.voice.setChannel(originalChannel);
  } catch {}
}
