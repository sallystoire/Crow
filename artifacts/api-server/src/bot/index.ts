import {
  Client,
  GatewayIntentBits,
  Partials,
  VoiceState,
  GuildMember,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { handleMessage, handleMessageDelete } from "./handlers/messageHandler.js";
import {
  handleVoiceJoinCreate,
  handleVoiceLeave,
} from "./commands/voice/index.js";
import { getGuildStore } from "./store.js";

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot not started");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  });

  client.once("ready", () => {
    logger.info({ tag: client.user?.tag }, "Discord bot connected");
    client.user?.setActivity("Serveur | .help", { type: 3 });
  });

  client.on("messageCreate", async (msg) => {
    try {
      await handleMessage(msg);
    } catch (err) {
      logger.error({ err }, "Error handling message");
    }
  });

  client.on("messageDelete", (msg) => {
    if (msg.partial) return;
    try {
      handleMessageDelete(msg);
    } catch (err) {
      logger.error({ err }, "Error handling messageDelete");
    }
  });

  // Voice: create temp channels
  client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
    try {
      // User joined a channel
      if (!oldState.channelId && newState.channelId) {
        await handleVoiceJoinCreate(newState);

        // Handle follow
        if (newState.guild && newState.member) {
          const store = getGuildStore(newState.guild.id);
          for (const [key, follow] of store.followRequests) {
            if (!follow.accepted) continue;
            if (follow.targetId !== newState.member.id) continue;

            const follower = newState.guild.members.cache.get(follow.followerId);
            if (follower && follower.voice.channel?.id !== newState.channelId) {
              await follower.voice
                .setChannel(newState.channelId)
                .catch(() => {});
            }
          }
        }
      }

      // User left a channel
      if (oldState.channelId && !newState.channelId) {
        await handleVoiceLeave(oldState);

        // Handle antideco
        if (oldState.guild && oldState.member) {
          const store = getGuildStore(oldState.guild.id);
          if (store.antiDecoLimit) {
            const current = store.antiDecoCount.get(oldState.member.id) ?? 0;
            const next = current + 1;
            store.antiDecoCount.set(oldState.member.id, next);

            if (next >= store.antiDecoLimit) {
              const member = oldState.member;
              const rolesToRemove = member.roles.cache.filter(
                (r) => r.id !== oldState.guild.id
              );
              await member.roles.remove(rolesToRemove).catch(() => {});
              store.antiDecoCount.set(oldState.member.id, 0);
              logger.info(
                { userId: oldState.member.id },
                "AntiDeco: roles removed"
              );
            }
          }
        }
      }

      // Prevent antimove: if someone was moved and they're in the list
      if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId &&
        newState.member
      ) {
        const store = getGuildStore(newState.guild.id);
        if (store.antiMoveList.has(newState.member.id)) {
          // Move them back
          await newState.member.voice.setChannel(oldState.channelId).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling voiceStateUpdate");
    }
  });

  // Handle role assignments for alertRoles
  client.on("guildMemberUpdate", async (oldMember: GuildMember | any, newMember: GuildMember) => {
    if (!newMember.guild) return;
    const store = getGuildStore(newMember.guild.id);

    const addedRoles = newMember.roles.cache.filter(
      (r) => !oldMember.roles.cache.has(r.id)
    );

    for (const [roleId] of addedRoles) {
      const channelId = store.alertRoles.get(roleId);
      if (!channelId) continue;

      const channel = newMember.guild.channels.cache.get(channelId);
      if (!channel?.isTextBased()) continue;

      await (channel as any)
        .send(
          `⚠️ Le rôle <@&${roleId}> a été attribué à **${newMember.user.tag}** \`(${newMember.id})\``
        )
        .catch(() => {});
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login Discord bot");
  });
}
