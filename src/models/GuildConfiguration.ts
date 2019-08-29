export interface GuildConfiguration {
	allowAll: boolean,
	streamerList: string[],
	streamerMessages: {
		[id: string]: string
	},
	streamerChannelId: string,
	announcementDelayHours: number,
	announcerMessage: string,
	botname: string,
	commandPermissions: {
		[command: string]: string[]	// list of member.id
	}
};