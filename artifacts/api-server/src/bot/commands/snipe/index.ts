import { Message, EmbedBuilder } from "discord.js";
import { getGuildStore, SnipedMessage } from "../../store.js";
import { errorEmbed } from "../../utils/embeds.js";
import { dbAddHideMe, dbRemoveHideMe } from "../../db.js";

export async function handleSnipe(msg: Message, args: string[]): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  const mentionedUser = msg.mentions.users.first();

  if (mentionedUser) {
    const userSnipes = store.userSnipedMessages.get(mentionedUser.id) ?? [];
    const visible = userSnipes.filter((s) => !store.hideMeList.has(s.authorId)).slice(0, 5);
    if (visible.length === 0) { await msg.reply({ embeds: [errorEmbed(`Aucun message supprimé trouvé pour <@${mentionedUser.id}>.`)] }); return; }

    const embed = new EmbedBuilder().setColor(0x9b59b6)
      .setTitle(`🔍 Derniers messages supprimés de ${mentionedUser.tag}`)
      .setThumbnail(mentionedUser.displayAvatarURL()).setTimestamp();
    for (let i = 0; i < visible.length; i++) {
      const s = visible[i]!;
      embed.addFields({ name: `Message #${i + 1} — ${s.deletedAt.toLocaleTimeString("fr-FR")}`, value: s.content || "*[Contenu vide]*" });
    }
    await msg.reply({ embeds: [embed] });
    return;
  }

  const count = Math.min(parseInt(args[0] ?? "1", 10), 3);
  if (isNaN(count) || count < 1) { await msg.reply({ embeds: [errorEmbed("Fournis un nombre valide (max 3) ou mentionne un utilisateur.")] }); return; }

  const channelSnipes = store.snipedMessages
    .filter((s) => s.channelId === msg.channel.id && !store.hideMeList.has(s.authorId))
    .slice(0, count);

  if (channelSnipes.length === 0) { await msg.reply({ embeds: [errorEmbed("Aucun message supprimé récemment dans ce salon.")] }); return; }

  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle(`🔍 ${channelSnipes.length} dernier(s) message(s) supprimé(s)`).setTimestamp();
  for (const s of channelSnipes) {
    embed.addFields({ name: `**${s.authorUsername}** — ${s.deletedAt.toLocaleTimeString("fr-FR")}`, value: s.content || "*[Contenu vide]*" });
  }
  await msg.reply({ embeds: [embed] });
}

export async function handleHideMe(msg: Message): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  if (store.hideMeList.has(msg.author.id)) {
    store.hideMeList.delete(msg.author.id);
    await dbRemoveHideMe(msg.guild.id, msg.author.id);
    await msg.reply("✅ Tu apparaîtras désormais dans les snipes.");
  } else {
    store.hideMeList.add(msg.author.id);
    await dbAddHideMe(msg.guild.id, msg.author.id);
    await msg.reply("✅ Tu n'apparaîtras plus dans les snipes.");
  }
}

export function recordDeletedMessage(guildId: string, msg: Message): void {
  if (!msg.guild || !msg.content) return;
  const store = getGuildStore(guildId);
  const entry: SnipedMessage = {
    content: msg.content,
    authorId: msg.author.id,
    authorUsername: msg.author.tag,
    authorAvatar: msg.author.displayAvatarURL(),
    channelId: msg.channel.id,
    deletedAt: new Date(),
  };
  store.snipedMessages.unshift(entry);
  if (store.snipedMessages.length > 50) store.snipedMessages.pop();
  const userList = store.userSnipedMessages.get(msg.author.id) ?? [];
  userList.unshift(entry);
  if (userList.length > 10) userList.pop();
  store.userSnipedMessages.set(msg.author.id, userList);
}
