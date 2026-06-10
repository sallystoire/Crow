import {
  Message,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  ChannelType,
} from "discord.js";
import { requireOwner, requireWL } from "../../utils/permissions.js";
import { successEmbed, errorEmbed, infoEmbed } from "../../utils/embeds.js";

export async function handleLock(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const channel = (msg.mentions.channels.first() ?? msg.channel) as TextChannel;

  try {
    await channel.permissionOverwrites.edit(msg.guild.roles.everyone, {
      SendMessages: false,
    });
    await msg.reply({ embeds: [successEmbed(`🔒 Le salon ${channel} a été verrouillé.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de verrouiller ce salon.")] });
  }
}

export async function handleUnlock(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const channel = (msg.mentions.channels.first() ?? msg.channel) as TextChannel;

  try {
    await channel.permissionOverwrites.edit(msg.guild.roles.everyone, {
      SendMessages: null,
    });
    await msg.reply({ embeds: [successEmbed(`🔓 Le salon ${channel} a été déverrouillé.`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de déverrouiller ce salon.")] });
  }
}

export async function handleSlowmode(msg: Message, args: string[]): Promise<void> {
  if (!(msg.channel instanceof TextChannel)) return;

  const seconds = parseInt(args[0] ?? "0", 10);
  if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
    await msg.reply({ embeds: [errorEmbed("Durée invalide (0–21600 secondes).")] });
    return;
  }

  try {
    await msg.channel.setRateLimitPerUser(seconds);
    if (seconds === 0) {
      await msg.reply({ embeds: [successEmbed("⏱️ Le slowmode a été désactivé.")] });
    } else {
      await msg.reply({ embeds: [successEmbed(`⏱️ Slowmode réglé à **${seconds} secondes** dans ce salon.`)] });
    }
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de régler le slowmode.")] });
  }
}

export async function handleSondage(msg: Message, args: string[]): Promise<void> {
  const fullText = args.join(" ");
  const titleMatch = fullText.match(/\((.+?)\)/);
  const propsMatch = fullText.match(/\[(.+?)\]/);

  if (!titleMatch || !propsMatch) {
    await msg.reply({
      embeds: [errorEmbed("Format: `.sondage (question) [option1, option2, ...]`")],
    });
    return;
  }

  const title = titleMatch[1]!;
  const props = propsMatch[1]!
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (props.length < 2) {
    await msg.reply({ embeds: [errorEmbed("Il faut au moins 2 propositions.")] });
    return;
  }

  const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  const description = props
    .map((p, i) => `${numberEmojis[i]} ${p}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`📊 ${title}`)
    .setDescription(description)
    .setFooter({ text: `Sondage créé par ${msg.author.tag}` })
    .setTimestamp();

  const pollMsg = await msg.channel.send({ embeds: [embed] });

  for (let i = 0; i < props.length; i++) {
    await pollMsg.react(numberEmojis[i]!);
  }

  try { await msg.delete(); } catch {}
}

export async function handleRenew(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!(msg.channel instanceof TextChannel)) return;

  const channel = msg.channel;
  const position = channel.position;
  const name = channel.name;
  const topic = channel.topic;
  const parentId = channel.parentId;
  const permOverwrites = channel.permissionOverwrites.cache;
  const nsfw = channel.nsfw;
  const rateLimitPerUser = channel.rateLimitPerUser;

  try {
    const newChannel = await channel.clone({
      name,
      topic: topic ?? undefined,
      parent: parentId ?? undefined,
      nsfw,
      rateLimitPerUser,
      permissionOverwrites: permOverwrites.map((o) => ({
        id: o.id,
        allow: o.allow,
        deny: o.deny,
        type: o.type,
      })),
      reason: `Renew par ${msg.author.tag}`,
    });

    await newChannel.setPosition(position);
    await channel.delete();
    await newChannel.send({
      embeds: [successEmbed(`🔄 Le salon a été renouvelé par **${msg.author.tag}**.`)],
    });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de renouveler ce salon.")] });
  }
}
