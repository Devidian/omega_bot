import { BotMethod } from "./BotMethod";
export interface BotCommand {
	restricted?: boolean; // restricted or free for all
	devOnly?: boolean; // execute only from developer
	method: BotMethod;
	helpId: string; // help index
	help: string; // help default text
}
