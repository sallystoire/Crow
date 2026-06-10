import { Message, TextChannel } from "discord.js";
import { getGuildStore } from "../../store.js";
import { requireOwner } from "../../utils/permissions.js";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

const URL_REGEX = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/gi;

export async function handleAntiLink(msg: Message, args: string[]): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const channel = msg.mentions.channels.first() ?? msg.channel;
  const store = getGuildStore(msg.guild.id);

  store.antiLinkChannels.add(channel.id);
  await msg.reply({ embeds: [successEmbed(`🔗 Les liens sont maintenant bloqués dans <#${channel.id}>.`)] });
}

export async function handleAllowLink(msg: Message): Promise<void> {
  if (!(await requireOwner(msg))) return;
  if (!msg.guild) return;

  const role = msg.mentions.roles.first();
  const channel = msg.mentions.channels.first() ?? msg.channel;

  if (!role) {
    await msg.reply({ embeds: [errorEmbed("Mentionne un rôle à autoriser.")] });
    return;
  }

  const store = getGuildStore(msg.guild.id);

  if (!store.allowLinkRoles.has(channel.id)) {
    store.allowLinkRoles.set(channel.id, new Set());
  }
  store.allowLinkRoles.get(channel.id)!.add(role.id);

  await msg.reply({
    embeds: [successEmbed(`✅ Le rôle <@&${role.id}> peut envoyer des liens dans <#${channel.id}>.`)],
  });
}

export function checkAntiLink(msg: Message): boolean {
  if (!msg.guild) return false;
  const store = getGuildStore(msg.guild.id);

  if (!store.antiLinkChannels.has(msg.channel.id)) return false;
  if (!URL_REGEX.test(msg.content)) return false;

  const allowed = store.allowLinkRoles.get(msg.channel.id);
  if (allowed && msg.member) {
    for (const roleId of allowed) {
      if (msg.member.roles.cache.has(roleId)) return false;
    }
  }

  return true;
}
