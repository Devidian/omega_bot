import { Message } from "discord.js";

export interface BotMethod {
	(msg: Message, args?: string[]): void;
}
