import { Message } from "discord.js";
import { getGuildStore } from "../../store.js";
import { dbAddHideMe, dbRemoveHideMe } from "../../db.js";

export async function handleHideMe(msg: Message): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  if (store.hideMeList.has(msg.author.id)) {
    await msg.reply(`<@${msg.author.id}> vous êtes déjà caché des snipers.`);
    return;
  }
  store.hideMeList.add(msg.author.id);
  await dbAddHideMe(msg.guild.id, msg.author.id);
  await msg.reply(`<@${msg.author.id}> vous êtes caché des snipers.`);
}

export async function handleUnhideMe(msg: Message): Promise<void> {
  if (!msg.guild) return;
  const store = getGuildStore(msg.guild.id);
  if (!store.hideMeList.has(msg.author.id)) {
    await msg.reply(`<@${msg.author.id}> tu n'es pas dans la liste des cachés.`);
    return;
  }
  store.hideMeList.delete(msg.author.id);
  await dbRemoveHideMe(msg.guild.id, msg.author.id);
  await msg.reply(`<@${msg.author.id}> vous n'êtes plus caché des snipers.`);
}
