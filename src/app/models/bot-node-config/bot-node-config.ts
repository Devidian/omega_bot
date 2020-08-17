import { Item } from "../item/item";

export class BotNodeConfig extends Item {
    name: string;
    enabled: boolean;
    token: string;
    developerAccess: string[];
}