import { EmbedBuilder, ColorResolvable } from "discord.js";

export function successEmbed(description: string, title?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(title ?? "✅ Succès")
    .setDescription(description)
    .setTimestamp();
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("❌ Erreur")
    .setDescription(description)
    .setTimestamp();
}

export function infoEmbed(description: string, title?: string, color: ColorResolvable = 0x3498db): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title ?? "ℹ️ Info")
    .setDescription(description)
    .setTimestamp();
}

export function listEmbed(title: string, items: string[], color: ColorResolvable = 0x9b59b6): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(items.length > 0 ? items.join("\n") : "*Aucun élément*")
    .setTimestamp();
}
