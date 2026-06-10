import { Message, EmbedBuilder } from "discord.js";
import { errorEmbed } from "../../utils/embeds.js";

export async function handlePic(msg: Message): Promise<void> {
  const target = msg.mentions.users.first() ?? msg.author;

  const avatarUrl = target.displayAvatarURL({ size: 4096, extension: "png" });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🖼️ Photo de profil de ${target.tag}`)
    .setImage(avatarUrl)
    .setURL(avatarUrl)
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}

export async function handleBanner(msg: Message): Promise<void> {
  const target = msg.mentions.users.first() ?? msg.author;

  try {
    const fetchedUser = await target.fetch(true);
    const bannerUrl = fetchedUser.bannerURL({ size: 4096, extension: "png" });

    if (!bannerUrl) {
      await msg.reply({ embeds: [errorEmbed(`**${target.tag}** n'a pas de bannière de profil.`)] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(fetchedUser.accentColor ?? 0x3498db)
      .setTitle(`🎨 Bannière de profil de ${target.tag}`)
      .setImage(bannerUrl)
      .setURL(bannerUrl)
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  } catch {
    await msg.reply({ embeds: [errorEmbed("Impossible de récupérer la bannière.")] });
  }
}
