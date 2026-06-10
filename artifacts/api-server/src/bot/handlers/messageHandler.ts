import { Client, Message, VoiceState } from "discord.js";
import { getGuildStore } from "../store.js";
import { checkAntiLink } from "../commands/link/index.js";
import { recordDeletedMessage } from "../commands/snipe/index.js";
import { isOwner } from "../utils/permissions.js";

import {
  handleBan,
  handleUnban,
  handleKick,
  handleBlacklist,
  handleUnbl,
  handleBanList,
  handleBlList,
  handleClearBan,
  handleClearBl,
} from "../commands/ban/index.js";

import { handleSnipe, handleHideMe } from "../commands/snipe/index.js";
import { handlePic, handleBanner } from "../commands/profile/index.js";

import {
  handleLock,
  handleUnlock,
  handleSlowmode,
  handleSondage,
  handleRenew,
} from "../commands/channels/index.js";

import {
  handleEditRole,
  handleEditPack,
  handleIdRoles,
  handleAddSecure,
  handleDelSecure,
  handleDerank,
} from "../commands/roles/index.js";

import {
  handleSetupMuteParam,
  handleTempMute,
  handleUnmute,
  handleMuteList,
  handleUnmuteAll,
} from "../commands/mute/index.js";

import {
  handleSetVoice,
  handleVc,
  handleJoinVoice,
  handleMove,
  handleAntiMove,
  handleFollowUser,
  handleAntiDeco,
  handlePv,
  handleAccess,
  handleUnpv,
  handleUnpvAll,
} from "../commands/voice/index.js";

import { handleAntiLink, handleAllowLink } from "../commands/link/index.js";
import { handleClear, handleEmoji } from "../commands/messages/index.js";

import {
  handleSet,
  handlePerms,
  handleOwner,
  handleWl,
  handleStats,
  handleAlertRoles,
  handleAutomate,
} from "../commands/settings/index.js";

const PREFIX = ".";

export async function handleMessage(msg: Message): Promise<void> {
  if (!msg.guild || msg.author.bot) return;

  const store = getGuildStore(msg.guild.id);

  // Check automates
  const content = msg.content.toLowerCase().trim();
  for (const automate of store.automateList) {
    if (content === automate.trigger || content.includes(automate.trigger)) {
      await msg.reply(automate.response).catch(() => {});
      break;
    }
  }

  // Check anti-link
  if (checkAntiLink(msg)) {
    await msg.delete().catch(() => {});
    await msg.channel
      .send(`<@${msg.author.id}> Les liens sont interdits dans ce salon.`)
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
    return;
  }

  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()!.toLowerCase();

  switch (command) {
    // BAN
    case "ban":
      await handleBan(msg, args);
      break;
    case "unban":
      await handleUnban(msg, args);
      break;
    case "kick":
      await handleKick(msg, args);
      break;
    case "bl":
      await handleBlacklist(msg, args);
      break;
    case "unbl":
      await handleUnbl(msg, args);
      break;
    case "banlist":
      await handleBanList(msg);
      break;
    case "bllist":
      await handleBlList(msg);
      break;
    case "clearban":
      await handleClearBan(msg);
      break;
    case "clearbl":
      await handleClearBl(msg);
      break;

    // SNIPE
    case "snipe":
      await handleSnipe(msg, args);
      break;
    case "hideme":
      await handleHideMe(msg);
      break;

    // PROFILE
    case "pic":
      await handlePic(msg);
      break;
    case "banner":
      await handleBanner(msg);
      break;

    // CHANNELS
    case "lock":
      await handleLock(msg, args);
      break;
    case "unlock":
      await handleUnlock(msg, args);
      break;
    case "slowmode":
      await handleSlowmode(msg, args);
      break;
    case "sondage":
      await handleSondage(msg, args);
      break;
    case "renew":
      await handleRenew(msg);
      break;

    // ROLES
    case "editrole":
      await handleEditRole(msg);
      break;
    case "editpack":
      await handleEditPack(msg, args);
      break;
    case "idroles":
      await handleIdRoles(msg);
      break;
    case "addsecure":
      await handleAddSecure(msg);
      break;
    case "delsecure":
      await handleDelSecure(msg);
      break;
    case "derank":
      await handleDerank(msg);
      break;

    // MUTE
    case "setupmute":
      await handleSetupMuteParam(msg, args);
      break;
    case "tempmute":
      await handleTempMute(msg, args);
      break;
    case "unmute":
      await handleUnmute(msg);
      break;
    case "mutelist":
      await handleMuteList(msg);
      break;
    case "unmuteall":
      await handleUnmuteAll(msg);
      break;

    // VOICE
    case "setvoice":
      await handleSetVoice(msg, args);
      break;
    case "vc":
      await handleVc(msg);
      break;
    case "join":
      await handleJoinVoice(msg);
      break;
    case "move":
      await handleMove(msg);
      break;
    case "antimove":
      await handleAntiMove(msg, args);
      break;
    case "followuser":
      await handleFollowUser(msg, args);
      break;
    case "antideco":
      await handleAntiDeco(msg, args);
      break;
    case "pv":
      await handlePv(msg);
      break;
    case "access":
      await handleAccess(msg);
      break;
    case "unpv":
      await handleUnpv(msg);
      break;
    case "unpvall":
      await handleUnpvAll(msg);
      break;

    // LINK
    case "antilink":
      await handleAntiLink(msg, args);
      break;
    case "allowlink":
      await handleAllowLink(msg);
      break;

    // MESSAGES
    case "clear":
      await handleClear(msg, args);
      break;
    case "emoji":
      await handleEmoji(msg, args);
      break;

    // SETTINGS
    case "set":
      await handleSet(msg, args);
      break;
    case "perms":
      await handlePerms(msg);
      break;
    case "owner":
      await handleOwner(msg, args);
      break;
    case "wl":
      await handleWl(msg, args);
      break;
    case "stats":
      await handleStats(msg);
      break;
    case "alertroles":
      await handleAlertRoles(msg);
      break;
    case "automate":
      await handleAutomate(msg, args);
      break;

    // HELP
    case "help":
      await handleHelp(msg);
      break;
  }
}

export function handleMessageDelete(msg: Message): void {
  if (!msg.guild || msg.author.bot) return;
  recordDeletedMessage(msg.guild.id, msg);
}

async function handleHelp(msg: Message): Promise<void> {
  const { EmbedBuilder } = await import("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📖 Aide — Commandes du Bot")
    .addFields(
      {
        name: "🔨 Ban",
        value: "`.ban` `.unban` `.kick` `.bl` `.unbl` `.banlist` `.bllist` `.clearban` `.clearbl`",
        inline: false,
      },
      {
        name: "🔍 Snipe",
        value: "`.snipe [n]` `.snipe @user` `.hideme`",
        inline: false,
      },
      {
        name: "🖼️ Profil",
        value: "`.pic [@user]` `.banner [@user]`",
        inline: false,
      },
      {
        name: "🏠 Salons",
        value: "`.lock` `.unlock` `.slowmode` `.sondage` `.renew`",
        inline: false,
      },
      {
        name: "🎭 Rôles",
        value: "`.editrole` `.editpack` `.idroles` `.addsecure` `.delsecure` `.derank`",
        inline: false,
      },
      {
        name: "🔇 Mute",
        value: "`.setupmute` `.tempmute` `.unmute` `.mutelist` `.unmuteall`",
        inline: false,
      },
      {
        name: "🎙️ Vocal",
        value: "`.setvoice` `.vc` `.join` `.move` `.antimove` `.followuser` `.antideco` `.pv` `.access` `.unpv` `.unpvall`",
        inline: false,
      },
      {
        name: "🔗 Liens",
        value: "`.antilink` `.allowlink`",
        inline: false,
      },
      {
        name: "🗑️ Messages",
        value: "`.clear` `.emoji`",
        inline: false,
      },
      {
        name: "⚙️ Settings",
        value: "`.set` `.perms` `.owner` `.wl` `.stats` `.alertroles` `.automate`",
        inline: false,
      }
    )
    .setFooter({ text: "Préfixe: ." })
    .setTimestamp();

  await msg.reply({ embeds: [embed] });
}
