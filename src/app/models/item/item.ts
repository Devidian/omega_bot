import { ObjectId } from "mongodb";
import { validate, validateOrReject, Contains, IsInt, Length, IsEmail, IsFQDN, IsDate, Min, Max, IsOptional } from "class-validator";
import { MongoObject, MongoCollection, Logger, Loglevel } from "@/util";

export abstract class Item implements MongoObject {
	static collectionRef: MongoCollection<any>;

	_id: string | ObjectId = '';

	@IsDate()
	createdOn: Date | null = null;

	@IsDate()
	lastModifiedOn: Date | null = null;

	@IsOptional()
	@IsDate()
	removedOn?: Date | null | undefined = null;

	public get className(): string {
		return this.constructor.name;
	}
	
	public set className(val: string) {
		// void
	}

	public plain(showPrivate: boolean = false): { [key: string]: any } {
		return {
			_id: this._id,
			createdOn: this.createdOn,
			lastModifiedOn: this.lastModifiedOn,
			removedOn: this.removedOn,
		}
	}

	public save(): Promise<Item> {
		if (Item.collectionRef) {
			return Item.collectionRef.save(this);
		} else {
			Logger(Loglevel.WARNING, this.className + '.save()', 'collection reference not found.');
			return Promise.resolve(this);
		}
	}
}