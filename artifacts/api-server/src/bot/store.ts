// In-memory store for all bot data (persists as long as bot runs)

export interface BanEntry {
  userId: string;
  username: string;
  reason: string;
  bannedAt: Date;
}

export interface BlacklistEntry {
  userId: string;
  username: string;
  reason: string;
  blacklistedAt: Date;
}

export interface MuteEntry {
  userId: string;
  username: string;
  reason: string;
  mutedAt: Date;
  endsAt?: Date;
  timerRef?: ReturnType<typeof setTimeout>;
}

export interface MuteLevel {
  level: number;
  roleIds: string[];
  canTempmute: boolean;
  canUnmute: boolean;
}

export interface MuteConfig {
  muteChannelId?: string;
  maxDurationMinutes: number;
  muteRoleId?: string;
  levels: MuteLevel[];
  muteReasons: string[];
}

export interface VoiceChannelConfig {
  categoryId?: string;
  createChannelId?: string;
  panelChannelId?: string;
  panelMessageId?: string;
}

export interface TempVoiceChannel {
  channelId: string;
  ownerId: string;
  isPrivate: boolean;
  allowedUsers: string[];
  maxMembers?: number;
}

export interface EditPack {
  packId: string;
  grantorRoleId: string;
  allowedRoleIds: string[];
}

export interface FollowRequest {
  followerId: string;
  targetId: string;
  accepted?: boolean;
}

export interface AutomateEntry {
  trigger: string;
  response: string;
}

export interface SnipedMessage {
  content: string;
  authorId: string;
  authorUsername: string;
  authorAvatar: string | null;
  channelId: string;
  deletedAt: Date;
}

export interface AlertRoleEntry {
  channelId: string;
  mentionRoleId: string;
}

export interface GuildStore {
  ownerList: Set<string>;
  wlList: Set<string>;
  banList: Map<string, BanEntry>;
  blacklist: Map<string, BlacklistEntry>;
  muteList: Map<string, MuteEntry>;
  muteConfig: MuteConfig;
  secureroles: Set<string>;
  wlSecure: Set<string>;
  editPacks: EditPack[];
  voiceConfig: VoiceChannelConfig;
  tempVoices: Map<string, TempVoiceChannel>;
  antiMoveList: Set<string>;
  antiDecoCount: Map<string, number>;
  antiDecoLimit?: number;
  followRequests: Map<string, FollowRequest>;
  automateList: AutomateEntry[];
  antiLinkChannels: Set<string>;
  allowLinkRoles: Map<string, Set<string>>;
  hideMeList: Set<string>;
  snipedMessages: SnipedMessage[];
  userSnipedMessages: Map<string, SnipedMessage[]>;
  customPerms: Map<string, Set<string>>;
  alertRoles: Map<string, AlertRoleEntry>;
  alertEditRole?: { channelId: string; mentionRoleId: string };
}

const stores = new Map<string, GuildStore>();

export function getGuildStore(guildId: string): GuildStore {
  if (!stores.has(guildId)) {
    stores.set(guildId, {
      ownerList: new Set(),
      wlList: new Set(),
      banList: new Map(),
      blacklist: new Map(),
      muteList: new Map(),
      muteConfig: { maxDurationMinutes: 60, levels: [], muteReasons: [] },
      secureroles: new Set(),
      wlSecure: new Set(),
      editPacks: [],
      voiceConfig: {},
      tempVoices: new Map(),
      antiMoveList: new Set(),
      antiDecoCount: new Map(),
      followRequests: new Map(),
      automateList: [],
      antiLinkChannels: new Set(),
      allowLinkRoles: new Map(),
      hideMeList: new Set(),
      snipedMessages: [],
      userSnipedMessages: new Map(),
      customPerms: new Map(),
      alertRoles: new Map(),
    });
  }
  return stores.get(guildId)!;
}

export const SYS_USER_ID = "989611084073799731";
