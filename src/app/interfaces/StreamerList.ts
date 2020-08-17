export interface StreamerList {
    [streamerId: string]: {
        id: string,					// the streamer id
        channelId?: string,			// dedicated streamer channel for live announcements
        message?: string,			// announcer message dedicated to this streamer
    }
}
