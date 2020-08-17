import { StreamerList } from "../../interfaces/StreamerList";
import { SelfPromotionRole } from "../../interfaces/SelfPromotionRole";
import { Item } from "../item/item";
import { plainToClass } from "class-transformer";

export class GuildConfiguration extends Item {
	guildId: string;
	streamerList: StreamerList;
	streamerChannelId: string;			// the general channel for streamer announcements
	announcementDelayHours: number;		// minimum delay between announcements per streamer
	announcerMessage: string;			// the general announcement message for live events
	welcomeMessage: string;				// welcome message for new guild members
	botname: string;					// the botname in this guild
	selfPromotionRoles: {
		[roleId: string]: SelfPromotionRole
	};
	commandPermissions: {
		[command: string]: string[]		// list of member.id
	};
	flags: {
		allowAll: boolean,				// announce everybody who is streaming
		sayHello: boolean,				// welcome new guild members
		removeJoinCommand: boolean,		// remove !join commands
		removeLeaveCommand: boolean		// remove !leave commands
	}

	get default() {
		return plainToClass(GuildConfiguration, {
			guildId: null,
			streamerList: {},
			streamerChannelId: null,
			announcementDelayHours: 5,
			announcerMessage: null,
			welcomeMessage: null,
			botname: "OmegaBot",
			selfPromotionRoles: {},
			commandPermissions: {},
			flags: {
				allowAll: false,
				sayHello: false,
				removeJoinCommand: true,
				removeLeaveCommand: true
			}
		});
	}
};
