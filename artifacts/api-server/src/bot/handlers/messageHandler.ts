import { Message } from "discord.js";
import { getGuildStore } from "../store.js";

import { handleHideMe, handleUnhideMe } from "../commands/snipe/index.js";
import { handleJoinVoice, handleMove, handlePv, handlePvList, handleAccess, handleUnpv, handleUnpvAll, handleWakeUp } from "../commands/voice/index.js";
import { handlePing } from "../commands/messages/index.js";
import { handleSondage } from "../commands/channels/index.js";
import {
  handleOwner, handleOwnerList,
  handleWl, handleWList,
  handleWlSecure, handleWlSecureList,
  handleStats, handleAlertRoles, handleAlertRoleList,
} from "../commands/settings/index.js";
import { handleIdRoles, handleAddSecure, handleDelSecure, handleSecureList, handleDerank } from "../commands/roles/index.js";

const PREFIX = "&";

export async function handleMessage(msg: Message): Promise<void> {
  if (!msg.guild || msg.author.bot) return;

  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()!.toLowerCase();

  switch (command) {
    // SNIPE / HIDE
    case "hideme": await handleHideMe(msg); break;
    case "unhideme": await handleUnhideMe(msg); break;

    // ROLES
    case "idroles": await handleIdRoles(msg); break;
    case "addsecure": await handleAddSecure(msg); break;
    case "delsecure": await handleDelSecure(msg); break;
    case "securelist": await handleSecureList(msg); break;
    case "derank": await handleDerank(msg); break;

    // VOICE
    case "join": await handleJoinVoice(msg); break;
    case "move": await handleMove(msg); break;
    case "pv": await handlePv(msg); break;
    case "pvlist": await handlePvList(msg); break;
    case "access": await handleAccess(msg); break;
    case "unpv": await handleUnpv(msg); break;
    case "unpvall": await handleUnpvAll(msg); break;
    case "wakeup": await handleWakeUp(msg); break;

    // MESSAGES
    case "ping": await handlePing(msg); break;

    // CHANNELS
    case "sondage": await handleSondage(msg, args); break;

    // SETTINGS
    case "owner": await handleOwner(msg, args); break;
    case "ownerlist": await handleOwnerList(msg); break;
    case "wl": await handleWl(msg, args); break;
    case "wlist": await handleWList(msg); break;
    case "wlsecure": await handleWlSecure(msg, args); break;
    case "wlsecurelist": await handleWlSecureList(msg); break;
    case "stats": await handleStats(msg); break;
    case "alertroles": await handleAlertRoles(msg); break;
    case "alertrolelist": await handleAlertRoleList(msg); break;

    // HELP
    case "help": await handleHelp(msg); break;
  }
}

// handleMessageDelete kept minimal (no snipe recording)
export function handleMessageDelete(_msg: Message): void {}

async function handleHelp(msg: Message): Promise<void> {
  const { EmbedBuilder } = await import("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📖 Aide — Commandes du Bot")
    .addFields(
      { name: "👁️ Visibilité", value: "`&hideme` `&unhideme`", inline: false },
      { name: "🎭 Rôles", value: "`&idroles` `&addsecure @role` `&delsecure @role` `&securelist` `&derank @user`", inline: false },
      { name: "🎙️ Vocal", value: "`&join @user` `&move @user` `&pv` `&pvlist` `&access @user` `&unpv` `&unpvall` `&wakeup @user`", inline: false },
      { name: "💬 Messages", value: "`&ping @user` `&sondage`", inline: false },
      { name: "⚙️ Settings", value: "`&owner add/del` `&ownerlist`\n`&wl add/del` `&wlist`\n`&wlsecure add/del` `&wlsecurelist`\n`&stats @role` `&alertroles @trigger @mention` `&alertrolelist`", inline: false },
    )
    .setFooter({ text: "Préfixe: &" })
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}
