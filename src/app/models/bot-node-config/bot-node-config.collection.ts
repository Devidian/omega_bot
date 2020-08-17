import { BotNodeConfig } from "./bot-node-config";
import { MongoCollection, Logger, Loglevel } from "@/util";
import { basename } from "path";
import { plainToClass } from "class-transformer";

const collection = (() => new MongoCollection<BotNodeConfig>({ BotNodeConfig }, 'botnode'))();

const logName = basename(__filename, '.js');

async function collectionIndices() {
    try {
        await collection.Collection.createIndex({ name: 1 }, { name: 'botUniqueNameIndex', background: true, unique: true });
        // await collection.Collection.createIndex({ email: 1 }, { name: 'userUniqueEmailIndex', background: true, unique: true, partialFilterExpression: { email: { $gt: "" } } });
    } catch (error) {
        if (error.code == 85) {
            Logger(Loglevel.ERROR, logName, error.codeName);
        } else {
            Logger(Loglevel.ERROR, logName, error);
        }
    }
}

async function insertDefaults() {
    const numItems = await collection.countAll();
    if (numItems < 1 && process.env.DEFAULT_BOTNODE) {
        const plainNode = JSON.parse(process.env.DEFAULT_BOTNODE);
        const botNode = plainToClass(BotNodeConfig, plainNode);
        try {
            const bn = await collection.save(botNode);
            Logger(Loglevel.VERBOSE, logName, `added`, bn);
        } catch (error) {
            Logger(Loglevel.ERROR, logName, error);
        }
    }
}

if (!collection.Collection) {
    throw new Error("NO COLLECTION");
}

collectionIndices();
insertDefaults();

export const botNodeCollection = collection;