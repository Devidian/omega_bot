import { Item } from "../item/item";

export class CustomInfo extends Item {
    guildId: string;
    name: string;
    data: string | string[];
}