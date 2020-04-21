import { StreamerList } from "./StreamerList";
import { SelfPromotionRole } from "./SelfPromotionRole";

export interface GuildConfiguration {
	allowAll?: boolean,					// deprecated
	streamerList: StreamerList,
	streamerMessages?: {				// deprecated
		[id: string]: string
	},
	streamerChannelId: string,			// the general channel for streamer announcements
	announcementDelayHours: number,		// minimum delay between announcements per streamer
	announcerMessage: string,			// the general announcement message for live events
	welcomeMessage: string,				// welcome message for new guild members
	botname: string,					// the botname in this guild
	selfPromotionRoles: {
		[roleId: string]: SelfPromotionRole
	},
	commandPermissions: {
		[command: string]: string[]		// list of member.id
	},
	flags: {
		allowAll: boolean,				// announce everybody who is streaming
		sayHello: boolean,				// welcome new guild members
		removeJoinCommand: boolean,		// remove !join commands
		removeLeaveCommand: boolean		// remove !leave commands
	}
};

export function getDefaultGuildConfiguration(): GuildConfiguration {
	return {
		// allowAll: false,
		announcementDelayHours: 5,
		announcerMessage: null,
		welcomeMessage: null,
		botname: "OmegaBot",
		streamerChannelId: null,
		streamerList: {},
		// streamerMessages: {},
		selfPromotionRoles: {},
		commandPermissions: {},
		flags: {
			allowAll: false,
			sayHello: false,
			removeJoinCommand: true,
			removeLeaveCommand: true
		}
	}
}
