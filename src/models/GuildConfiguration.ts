export interface GuildConfiguration {
	allowAll: boolean,
	streamerList: string[],
	streamerMessages: {
		[id: string]: string
	},
	streamerChannelId: string,
	announcementDelayHours: number,
	announcerMessage: string,
	welcomeMessage: string,
	botname: string,
	selfPromotionRoles: string[],
	commandPermissions: {
		[command: string]: string[]	// list of member.id
	}
};