import { Message, TextChannel, ChannelType } from "discord.js";
import { requireOwner, requireWL } from "../../utils/permissions.js";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

export async function handleClear(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;

  const mentionedUser = msg.mentions.users.first();
  const channel = msg.channel as TextChannel;

  if (mentionedUser) {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter((m) => m.author.id === mentionedUser.id);
      await channel.bulkDelete(userMessages, true);
      const reply = await msg.reply({
        embeds: [successEmbed(`🗑️ Messages de **${mentionedUser.tag}** supprimés dans ce salon.`)],
      });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch {
      await msg.reply({ embeds: [errorEmbed("Impossible de supprimer les messages.")] });
    }
    return;
  }

  if (!(await requireOwner(msg))) return;

  const count = parseInt(args[0] ?? "10", 10);
  if (isNaN(count) || count < 1 || count > 100) {
    await msg.reply({ embeds: [errorEmbed("Nombre invalide (1–100).")] });
    return;
  }

  try {
    const messages = await channel.messages.fetch({ limit: count + 1 });
    await channel.bulkDelete(messages, true);
    const reply = await channel.send({
      embeds: [successEmbed(`🗑️ **${count}** message(s) supprimé(s).`)],
    });
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de supprimer les messages (peut-être trop anciens > 14 jours).")] });
  }
}

export async function handleEmoji(msg: Message, args: string[]): Promise<void> {
  if (!(await requireWL(msg))) return;
  if (!msg.guild) return;

  const emojiArg = args[0];
  const emojiName = args[1];

  if (!emojiArg || !emojiName) {
    await msg.reply({ embeds: [errorEmbed("Format: `&emoji <emoji ou URL> <nom>`")] });
    return;
  }

  const emojiIdMatch = emojiArg.match(/<a?:\w+:(\d+)>/);
  let image: string;

  if (emojiIdMatch) {
    const id = emojiIdMatch[1]!;
    const animated = emojiArg.startsWith("<a:");
    image = `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`;
  } else if (emojiArg.startsWith("http")) {
    image = emojiArg;
  } else {
    await msg.reply({ embeds: [errorEmbed("Fournis un emoji Discord ou une URL d'image.")] });
    return;
  }

  try {
    const newEmoji = await msg.guild.emojis.create({ attachment: image, name: emojiName });
    await msg.reply({ embeds: [successEmbed(`L'emoji **${newEmoji.toString()}** \`:${emojiName}:\` a été créé !`)] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de créer l'emoji (limite atteinte ou permissions insuffisantes).")] });
  }
}

export async function handlePing(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const target = msg.mentions.users.first();
  if (!target) { await msg.reply("**Mentionne un utilisateur.**"); return; }

  const textChannels = msg.guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.permissionsFor(msg.guild!.roles.everyone)?.has("ViewChannel") &&
      ch.permissionsFor(msg.guild!.roles.everyone)?.has("SendMessages")
  );

  let sent = 0;
  for (const [, ch] of textChannels) {
    try {
      await (ch as TextChannel).send(`<@${target.id}>`);
      sent++;
    } catch {}
  }

  await msg.reply(`**<@${target.id}> a été mentionné dans ${sent} salon(s).**`);
}
