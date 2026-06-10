import { GuildMember, Message } from "discord.js";
import { getGuildStore, SYS_USER_ID } from "../store.js";

export function isSysUser(userId: string): boolean {
  return userId === SYS_USER_ID;
}

export function isOwner(member: GuildMember): boolean {
  const store = getGuildStore(member.guild.id);
  return (
    isSysUser(member.id) ||
    store.ownerList.has(member.id) ||
    member.id === member.guild.ownerId
  );
}

export function isWL(member: GuildMember): boolean {
  const store = getGuildStore(member.guild.id);
  return isOwner(member) || store.wlList.has(member.id);
}

export function hasCustomPerm(member: GuildMember, perm: string): boolean {
  if (isOwner(member)) return true;
  const store = getGuildStore(member.guild.id);
  for (const role of member.roles.cache.values()) {
    const perms = store.customPerms.get(role.id);
    if (perms && perms.has(perm)) return true;
  }
  return false;
}

export async function requireOwner(msg: Message): Promise<boolean> {
  if (!msg.member) return false;
  if (isOwner(msg.member)) return true;
  await msg.reply("❌ Réservé aux membres de la **owner list**.");
  return false;
}

export async function requireWL(msg: Message): Promise<boolean> {
  if (!msg.member) return false;
  if (isWL(msg.member)) return true;
  await msg.reply("❌ Réservé aux membres de la **wl list**.");
  return false;
}

export async function requirePerm(
  msg: Message,
  perm: string
): Promise<boolean> {
  if (!msg.member) return false;
  if (hasCustomPerm(msg.member, perm)) return true;
  await msg.reply(`❌ Tu n'as pas la permission d'utiliser \`.${perm}\`.`);
  return false;
}
