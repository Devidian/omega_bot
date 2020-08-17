import { MongoCollection, Logger, Loglevel } from "@/util";
import { basename } from "path";
import { GuildConfiguration } from "./guild-configuration";

const collection = (() => new MongoCollection<GuildConfiguration>({ GuildConfiguration }, 'guildConfig'))();


async function collectionIndices() {
    try {
        await collection.Collection.createIndex({ guildId: 1 }, { name: 'guildIndex', background: true, unique: true });
        // await collection.Collection.createIndex({ email: 1 }, { name: 'userUniqueEmailIndex', background: true, unique: true, partialFilterExpression: { email: { $gt: "" } } });
    } catch (error) {
        if (error.code == 85) {
            Logger(Loglevel.ERROR, basename(__filename, '.js'), error.codeName);
        } else {
            Logger(Loglevel.ERROR, basename(__filename, '.js'), error);
        }
    }
}

if(!collection.Collection){
    throw new Error("NO COLLECTION");
}

collectionIndices();

export const guildConfigurationCollection = collection;