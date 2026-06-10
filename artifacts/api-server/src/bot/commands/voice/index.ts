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
  GuildMember,
  VoiceState,
  Collection,
} from "discord.js";
import { getGuildStore, TempVoiceChannel } from "../../store.js";
import { requireOwner, requireWL, isOwner, isWL } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, listEmbed, infoEmbed } from "../../utils/embeds.js";

export async function handleSetVoice(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  if (args[0] === "channel") {
    const channel = msg.mentions.channels.first();
    if (!channel || !channel.isVoiceBased()) {
      await msg.reply({ embeds: [errorEmbed("Mentionne un salon vocal.")] });
      return;
    }
    store.voiceConfig.createChannelId = channel.id;
    await msg.reply({ embeds: [successEmbed(`Salon de création de vocal: <#${channel.id}>`)] });
    return;
  }

  if (args[0] === "panel") {
    const channel = msg.mentions.channels.first();
    if (!channel || !channel.isTextBased()) {
      await msg.reply({ embeds: [errorEmbed("Mentionne un salon texte pour le panel.")] });
      return;
    }
    store.voiceConfig.panelChannelId = channel.id;

    const panelEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🎙️ Gestion de ta Vocal")
      .setDescription("Utilise les sélecteurs ci-dessous pour gérer ta vocal temporaire.");

    const menuTransfer = new StringSelectMenuBuilder()
      .setCustomId("voice_transfer")
      .setPlaceholder("👑 Transférer la propriété...")
      .addOptions(new StringSelectMenuOptionBuilder().setLabel("Transférer à...").setValue("transfer_placeholder"));

    const menuAction = new StringSelectMenuBuilder()
      .setCustomId("voice_action")
      .setPlaceholder("⚙️ Actions...")
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("🔒 Rendre privée").setValue("make_private"),
        new StringSelectMenuOptionBuilder().setLabel("🔓 Rendre publique").setValue("make_public"),
        new StringSelectMenuOptionBuilder().setLabel("✏️ Renommer").setValue("rename"),
        new StringSelectMenuOptionBuilder().setLabel("👥 Modifier la capacité").setValue("set_limit")
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuTransfer);
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuAction);

    const panelMsg = await (channel as any).send({ embeds: [panelEmbed], components: [row1, row2] });
    store.voiceConfig.panelMessageId = panelMsg.id;

    await msg.reply({ embeds: [successEmbed(`Panel vocal envoyé dans <#${channel.id}>`)] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🎙️ Configuration des vocaux temporaires")
    .setDescription(
      "`.setvoice channel #vocal` — salon pour créer une vocal\n" +
        "`.setvoice panel #salon-texte` — envoyer le panel de gestion\n\n" +
        `**Salon de création:** ${store.voiceConfig.createChannelId ? `<#${store.voiceConfig.createChannelId}>` : "*non défini*"}\n` +
        `**Panel:** ${store.voiceConfig.panelChannelId ? `<#${store.voiceConfig.panelChannelId}>` : "*non défini*"}`
    )
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

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
        {
          id: member.id,
          allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers],
        },
      ],
    });

    await member.voice.setChannel(newChannel);

    store.tempVoices.set(newChannel.id, {
      channelId: newChannel.id,
      ownerId: member.id,
      isPrivate: false,
      allowedUsers: [],
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

  let total = 0;
  let muted = 0;
  let deafened = 0;
  let streaming = 0;
  let video = 0;

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

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("🎙️ Statistiques vocales")
    .addFields(
      { name: "👥 Total en vocal", value: `${total}`, inline: true },
      { name: "🔇 Micro coupé", value: `${muted}`, inline: true },
      { name: "🎧 Casque coupé", value: `${deafened}`, inline: true },
      { name: "📡 En stream", value: `${streaming}`, inline: true },
      { name: "📷 En cam", value: `${video}`, inline: true }
    )
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleJoinVoice(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] });
    return;
  }

  const targetVoice = target.voice.channel;
  if (!targetVoice) {
    await msg.reply({ embeds: [errorEmbed(`**${target.user.tag}** n'est pas en vocal.`)] });
    return;
  }

  if (!msg.member?.voice.channel) {
    await msg.reply({ embeds: [errorEmbed("Tu dois être en vocal pour utiliser cette commande.")] });
    return;
  }

  try {
    await msg.member.voice.setChannel(targetVoice);
    await msg.reply({
      embeds: [successEmbed(`Vous avez rejoint la vocal **${targetVoice.name}** avec **${target.user.tag}**`)],
    });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de rejoindre ce salon vocal.")] });
  }
}

export async function handleMove(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre à déplacer.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);

  if (store.antiMoveList.has(target.id)) {
    await msg.reply({ embeds: [errorEmbed(`**${target.user.tag}** est dans la liste antimove.`)] });
    return;
  }

  const myVoice = msg.member?.voice.channel;
  if (!myVoice) {
    await msg.reply({ embeds: [errorEmbed("Tu dois être en vocal pour déplacer quelqu'un.")] });
    return;
  }

  try {
    await target.voice.setChannel(myVoice);
    await msg.reply({ embeds: [successEmbed(`**${target.user.tag}** a été déplacé dans **${myVoice.name}**.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de déplacer ce membre.")] });
  }
}

export async function handleAntiMove(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  if (args[0] === "list") {
    if (!(await requireWL(msg))) return;
    const entries = Array.from(store.antiMoveList).map((id) => `<@${id}>`);
    await msg.reply({ embeds: [listEmbed("🛡️ Liste Antimove", entries)] });
    return;
  }

  if (!(await requireOwner(msg))) return;

  if (args[0] === "del") {
    const target = msg.mentions.members?.first();
    if (!target) {
      await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] });
      return;
    }
    store.antiMoveList.delete(target.id);
    await msg.reply({ embeds: [successEmbed(`**${target.user.tag}** a été retiré de la liste antimove.`)] });
    return;
  }

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre. `.antimove @user` | `.antimove del @user` | `.antimove list`")] });
    return;
  }

  store.antiMoveList.add(target.id);
  await msg.reply({ embeds: [successEmbed(`**${target.user.tag}** a été ajouté à la liste antimove.`)] });
}

export async function handleFollowUser(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const store = getGuildStore(msg.guild.id);

  if (args[0] === "list") {
    if (!(await requireWL(msg))) return;
    const entries = Array.from(store.followRequests.values())
      .filter((r) => r.accepted)
      .map((r) => `<@${r.followerId}> suit <@${r.targetId}>`);
    await msg.reply({ embeds: [listEmbed("👣 Liste des follows", entries)] });
    return;
  }

  if (!(await requireWL(msg))) return;

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre à suivre.")] });
    return;
  }

  const existing = store.followRequests.get(`${msg.author.id}_${target.id}`);

  if (existing) {
    store.followRequests.delete(`${msg.author.id}_${target.id}`);
    await msg.reply({ embeds: [successEmbed(`Tu ne suis plus **${target.user.tag}**.`)] });
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("follow_accept").setLabel("✅ Accepter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("follow_decline").setLabel("❌ Refuser").setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("👣 Demande de suivi vocal")
    .setDescription(`**${msg.author.tag}** souhaite te suivre dans les salons vocaux.\nTu as **1 minute** pour accepter ou refuser.`)
    .setTimestamp();

  try {
    const dm = await target.user.send({ embeds: [embed], components: [row] });
    store.followRequests.set(`${msg.author.id}_${target.id}`, {
      followerId: msg.author.id,
      targetId: target.id,
      accepted: undefined,
    });

    await msg.reply({ embeds: [infoEmbed(`Demande envoyée à **${target.user.tag}**. En attente de réponse...`)] });

    const collector = dm.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.user.id === target.id,
    });

    collector.on("collect", async (interaction) => {
      const entry = store.followRequests.get(`${msg.author.id}_${target.id}`);
      if (!entry) return;

      if (interaction.customId === "follow_accept") {
        entry.accepted = true;
        await interaction.update({
          embeds: [successEmbed(`Tu as accepté d'être suivi par **${msg.author.tag}**.`)],
          components: [],
        });
        await msg.channel.send({ embeds: [successEmbed(`**${target.user.tag}** a accepté. Tu le suivras dans les vocaux.`)] });
      } else {
        entry.accepted = false;
        store.followRequests.delete(`${msg.author.id}_${target.id}`);
        await interaction.update({
          embeds: [infoEmbed(`Tu as refusé la demande de suivi de **${msg.author.tag}**.`)],
          components: [],
        });
        await msg.channel.send({ embeds: [infoEmbed(`**${target.user.tag}** a refusé ta demande de suivi.`)] });
      }
    });

    collector.on("end", (collected) => {
      if (collected.size === 0) {
        store.followRequests.delete(`${msg.author.id}_${target.id}`);
        dm.edit({ components: [] }).catch(() => {});
        msg.channel.send({ embeds: [infoEmbed(`La demande de suivi vers **${target.user.tag}** a expiré.`)] }).catch(() => {});
      }
    });
  } catch {
    await msg.reply({ embeds: [errorEmbed(`Impossible d'envoyer un MP à **${target.user.tag}**. Ses DMs sont peut-être fermés.`)] });
  }
}

export async function handleAntiDeco(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const count = parseInt(args[0] ?? "3", 10);
  if (isNaN(count) || count < 1) {
    await msg.reply({ embeds: [errorEmbed("Fournis un nombre valide.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);
  store.antiDecoLimit = count;
  await msg.reply({ embeds: [successEmbed(`AntDeco activé: après **${count}** déconnexions, les rôles seront retirés.`)] });
}

export async function handlePv(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const member = msg.member!;
  const voiceChannel = member.voice.channel as VoiceChannel | null;
  if (!voiceChannel) {
    await msg.reply({ embeds: [errorEmbed("Tu n'es pas en vocal.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);
  const tempVoice = store.tempVoices.get(voiceChannel.id);
  if (tempVoice && tempVoice.ownerId !== member.id) {
    await msg.reply({ embeds: [errorEmbed("Tu n'es pas propriétaire de cette vocal.")] });
    return;
  }

  try {
    await voiceChannel.permissionOverwrites.edit(msg.guild.roles.everyone, {
      Connect: false,
    });
    if (tempVoice) tempVoice.isPrivate = true;
    await msg.reply({ embeds: [successEmbed(`🔒 La vocal **${voiceChannel.name}** est maintenant privée.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de privatiser ce salon.")] });
  }
}

export async function handleAccess(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const member = msg.member!;
  const voiceChannel = member.voice.channel as VoiceChannel | null;
  if (!voiceChannel) {
    await msg.reply({ embeds: [errorEmbed("Tu n'es pas en vocal.")] });
    return;
  }

  const target = msg.mentions.members?.first();
  if (!target) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un membre.")] });
    return;
  }

  try {
    await voiceChannel.permissionOverwrites.edit(target, { Connect: true });
    await msg.reply({ embeds: [successEmbed(`✅ **${target.user.tag}** peut rejoindre la vocal.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible d'accorder l'accès.")] });
  }
}

export async function handleUnpv(msg: Message): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const voiceChannel = msg.member?.voice.channel as VoiceChannel | null;
  if (!voiceChannel) {
    await msg.reply({ embeds: [errorEmbed("Tu n'es pas en vocal.")] });
    return;
  }

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

  await msg.reply({ embeds: [successEmbed(`🔓 ${count} vocal(s) privée(s) rendue(s) publique(s).`)] });
}
