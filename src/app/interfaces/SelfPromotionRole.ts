export interface SelfPromotionRole {
	id: string; // the role-id
	alias: string; // command alias
	emojiName: string; // join group by reaction with this emoji
	channelId: string[]; // only accept join from these channels
}
