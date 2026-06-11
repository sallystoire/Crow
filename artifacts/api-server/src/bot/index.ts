import {
  Client,
  GatewayIntentBits,
  Partials,
  VoiceState,
  GuildMember,
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { handleMessage, handleMessageDelete } from "./handlers/messageHandler.js";
import { handleVoiceJoinCreate, handleVoiceLeave } from "./commands/voice/index.js";
import { getGuildStore } from "./store.js";
import { loadGuildFromDb } from "./db.js";
import { isOwner } from "./utils/permissions.js";
import { setupDerankCollector } from "./commands/roles/index.js";

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
      if (!oldState.channelId && newState.channelId) {
        await handleVoiceJoinCreate(newState);
      }
      if (oldState.channelId && !newState.channelId) {
        await handleVoiceLeave(oldState);
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
      if (addedRoles.size === 0) return;

      // Fetch audit log to find who made the change
      let executorId: string | null = null;
      let executorTag: string = "Inconnu";
      try {
        const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 });
        const entry = auditLogs.entries.find(
          (e) => (e.target as any)?.id === newMember.id && Date.now() - e.createdTimestamp < 8000
        );
        if (entry?.executor) {
          executorId = entry.executor.id;
          executorTag = entry.executor.tag ?? entry.executor.username ?? "Inconnu";
        }
      } catch {}

      for (const [roleId] of addedRoles) {
        // Auto-remove secure roles assigned by non-wlSecure users
        if (store.secureroles.has(roleId)) {
          const isBot = executorId === client.user?.id;
          const isAllowed = isBot ||
            (executorId && (store.wlSecure.has(executorId) || store.ownerList.has(executorId) || executorId === newMember.guild.ownerId));
          if (!isAllowed) {
            await newMember.roles.remove(roleId).catch(() => {});
            const logChannel = store.muteConfig.muteChannelId
              ? newMember.guild.channels.cache.get(store.muteConfig.muteChannelId)
              : null;
            if (logChannel?.isTextBased()) {
              await (logChannel as any).send(
                `⛔ Le rôle <@&${roleId}> a été **retiré automatiquement** de <@${newMember.id}> car <@${executorId ?? "inconnu"}> n'est pas dans la wlsecure.`
              ).catch(() => {});
            }
            continue;
          }
        }

        // Alert roles notification
        const alert = store.alertRoles.get(roleId);
        if (alert) {
          const channel = newMember.guild.channels.cache.get(alert.channelId);
          if (channel?.isTextBased()) {
            const alertEmbed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("ALERTE 🚨")
              .setDescription(
                `<@&${alert.mentionRoleId}> : <@${executorId ?? "inconnu"}> a mis le rôle <@&${roleId}> à <@${newMember.id}> (\`${newMember.id}\`)`
              )
              .setTimestamp();

            const derankRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`alert_derank_${newMember.id}`)
                .setLabel("🗑️ Derank")
                .setStyle(ButtonStyle.Danger)
            );

            const alertMsg = await (channel as any).send({ embeds: [alertEmbed], components: [derankRow] }).catch(() => null);
            if (alertMsg) {
              setupDerankCollector(alertMsg, newMember.id, newMember.user.tag, newMember.guild, alertEmbed);
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Error handling guildMemberUpdate");
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login Discord bot");
  });
}
