import {
  Client,
  GatewayIntentBits,
  Partials,
  VoiceState,
  GuildMember,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { handleMessage, handleMessageDelete } from "./handlers/messageHandler.js";
import { handleVoiceJoinCreate, handleVoiceLeave } from "./commands/voice/index.js";
import { getGuildStore } from "./store.js";
import { loadGuildFromDb } from "./db.js";

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

  client.once("clientReady", async () => {
    logger.info({ tag: client.user?.tag }, "Discord bot connected");
    client.user?.setActivity("Serveur | &help", { type: 3 });

    // Load all guilds from DB on startup
    for (const guild of client.guilds.cache.values()) {
      await loadGuildFromDb(guild.id).catch((err) =>
        logger.error({ err, guildId: guild.id }, "Failed to load guild from DB")
      );
    }
    logger.info({ guilds: client.guilds.cache.size }, "All guilds loaded from DB");
  });

  client.on("guildCreate", async (guild) => {
    await loadGuildFromDb(guild.id).catch(() => {});
    logger.info({ guildId: guild.id }, "Joined new guild, loaded from DB");
  });

  client.on("messageCreate", async (msg) => {
    try { await handleMessage(msg); } catch (err) { logger.error({ err }, "Error handling message"); }
  });

  client.on("messageDelete", (msg) => {
    if (msg.partial) return;
    try { handleMessageDelete(msg); } catch (err) { logger.error({ err }, "Error handling messageDelete"); }
  });

  client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
    try {
      // User joined
      if (!oldState.channelId && newState.channelId) {
        await handleVoiceJoinCreate(newState);
      }

      // User left
      if (oldState.channelId && !newState.channelId) {
        await handleVoiceLeave(oldState);

        // AntiDeco
        if (oldState.guild && oldState.member) {
          const store = getGuildStore(oldState.guild.id);
          if (store.antiDecoLimit) {
            const current = store.antiDecoCount.get(oldState.member.id) ?? 0;
            const next = current + 1;
            store.antiDecoCount.set(oldState.member.id, next);
            if (next >= store.antiDecoLimit) {
              const member = oldState.member;
              const rolesToRemove = member.roles.cache.filter((r) => r.id !== oldState.guild.id);
              await member.roles.remove(rolesToRemove).catch(() => {});
              store.antiDecoCount.set(oldState.member.id, 0);
            }
          }
        }
      }

      // Prevent antimove
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId && newState.member) {
        const store = getGuildStore(newState.guild.id);
        if (store.antiMoveList.has(newState.member.id)) {
          await newState.member.voice.setChannel(oldState.channelId).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling voiceStateUpdate");
    }
  });

  client.on("guildMemberUpdate", async (oldMember: GuildMember | any, newMember: GuildMember) => {
    if (!newMember.guild) return;
    try {
      const store = getGuildStore(newMember.guild.id);
      const addedRoles = newMember.roles.cache.filter((r: any) => !oldMember.roles.cache.has(r.id));
      for (const [roleId] of addedRoles) {
        const alert = store.alertRoles.get(roleId);
        if (!alert) continue;
        const channel = newMember.guild.channels.cache.get(alert.channelId);
        if (!channel?.isTextBased()) continue;
        await (channel as any).send(
          `<@&${alert.mentionRoleId}> ⚠️ <@&${roleId}> attribué à **${newMember.user.tag}** \`(${newMember.id})\``
        ).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, "Error handling guildMemberUpdate");
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login Discord bot");
  });
}
