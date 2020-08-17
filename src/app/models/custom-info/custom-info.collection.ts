import { MongoCollection, Logger, Loglevel } from "@/util";
import { basename } from "path";
import { CustomInfo } from "./custom-info";

const collection = (() => new MongoCollection<CustomInfo>({ CustomInfo }, 'customInfo'))();


async function collectionIndices() {
    try {
        await collection.Collection.createIndex({ name: 1, guildId: 1 }, { name: 'guid-name', background: true, unique: true });
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

export const customInfoCollection = collection;