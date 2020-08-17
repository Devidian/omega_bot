'use strict';
import { Logger, Loglevel, shuffle } from "@/util";
import { plainToClass, plainToClassFromExist } from "class-transformer";
import { Activity, Client, Guild, GuildMember, Message, MessageAttachment, Permissions, TextChannel } from "discord.js";
import { EOL } from "os";
import { isArray } from "util";
import { WorkerProcess } from "../util/WorkerProcess";
import { BotCommand } from "./interfaces/BotCommand";
import { botNodeCollection, BotNodeConfig } from "./models/bot-node-config";
import { CustomInfo, customInfoCollection } from "./models/custom-info";
import { guildConfigurationCollection } from "./models/guild-configuration";
import { GuildConfiguration } from "./models/guild-configuration/guild-configuration";
import { ObjectId } from "mongodb";
import { resolve, basename } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";

export class OmegaBot extends WorkerProcess {
	// Object stuff
	protected DiscordBot: Client = null;
	protected timer: NodeJS.Timer = null;
	protected streamerChecks: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>();
	protected guildConfigList: Map<string, GuildConfiguration> = new Map<string, GuildConfiguration>();
	botConfig: BotNodeConfig;

	public get title(): string {
		return "OmegaBot";
	}

	public get className(): string {
		return this.constructor.name;
	}

	protected availableBotCommands: Map<string, BotCommand> = new Map<string, BotCommand>();
	protected announcementCache: Map<string, Map<string, Activity>> = new Map<string, Map<string, Activity>>();
	protected announcementDateCache: Map<string, Map<string, Date>> = new Map<string, Map<string, Date>>();
	protected settingsLoaded: Map<string, boolean> = new Map<string, boolean>();

	/**
	 *Creates an instance of OmegaBot.
	 * @memberof OmegaBot
	 */
	constructor(private botNodeId: ObjectId | string) {
		super();
		this.setupDiscordBot();
		this.setupBotCommands();
		this.timer = setTimeout(_ => { this.run(); }, Number(process.env.APP_TICK || 250));
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof OmegaBot
	 */
	protected run(): void {
		const guilds = this.DiscordBot && this.DiscordBot.guilds ? this.DiscordBot.guilds.cache.size : 0;
		process.title = `OmegaBot: ${this.botNodeId} - ${guilds}`;
		this.timer.refresh();
	}

	/**
	 *
	 *
	 * @returns {Promise<boolean>}
	 * @memberof OmegaBot
	 */
	public destroy(): Promise<boolean> {
		return Promise.resolve(true);
	}

	/**
	 *
	 *
	 * @protected
	 * @param {string} guildId
	 * @memberof OmegaBot
	 */
	protected async saveGuildSettings(guildId: string, msg?: Message) {
		const GuildConfig: GuildConfiguration = this.guildConfigList.get(guildId) || new GuildConfiguration().default;

		try {
			await guildConfigurationCollection.save(GuildConfig);
			!msg ? null : msg.react("👍");
		} catch (error) {
			Logger(Loglevel.ERROR, "OmegaBot:saveGuildSettings", error);
			!msg ? null : msg.react("👎");
		}
	}

	/**
	 * import old config json files
	 *
	 * @protected
	 * @param {string} guildId
	 * @returns
	 * @memberof OmegaBot
	 */
	protected importGuildSettings(guildId: string) {
		let guildConfig: GuildConfiguration;
		guildConfig = new GuildConfiguration().default;
		guildConfig.guildId = guildId;

		try {
			const file = resolve(process.cwd(), "infos", guildId + ".json");
			if (existsSync(file)) {
				const importRawContent = readFileSync(file).toString('utf-8');
				const plain = JSON.parse(importRawContent);
				plainToClassFromExist(guildConfig, plain);
				Logger(Loglevel.INFO, "OmegaBot:importGuildSettings", `Guild <${guildId}> config file found and imported`);
				this.importInfoItemsFromGuild(guildId);
			} else {
				Logger(Loglevel.WARNING, "OmegaBot:importGuildSettings", `Guild <${guildId}> not found set all to default`);
			}
		} catch (error) {
			Logger(Loglevel.ERROR, "OmegaBot:importGuildSettings", error);
		}
		return guildConfig;
	}

	/**
	 * import old info files
	 *
	 * @protected
	 * @param {string} guildId
	 * @memberof OmegaBot
	 */
	protected importInfoItemsFromGuild(guildId: string) {
		try {
			const dirPath = resolve(process.cwd(), "infos", guildId);
			readdirSync(dirPath).forEach(fileName => {
				const filePath = resolve(process.cwd(), "infos", guildId, fileName);
				const importRawContent = readFileSync(filePath).toString('utf-8');
				const { data } = JSON.parse(importRawContent);

				const info = new CustomInfo();
				info.guildId = guildId;
				info.data = data;
				info.name = basename(fileName, '.json');

				customInfoCollection.save(info);

				Logger(Loglevel.INFO, "OmegaBot:importInfoItemsFromGuild", `Guild <${guildId}> info <${info.name}> imported`);
			});

		} catch (error) {
			Logger(Loglevel.ERROR, "OmegaBot:importInfoItemsFromGuild", error);
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {string} guildId
	 * @memberof OmegaBot
	 */
	protected async loadGuildSettings(guildId: string) {
		if (this.settingsLoaded.has(guildId) && this.settingsLoaded.get(guildId)) return;
		// TODO handle external changes with changestreams
		let guildConfig: GuildConfiguration;
		try {
			guildConfig = await guildConfigurationCollection.findItem({ guildId });
			if (guildConfig) {
				Logger(Loglevel.INFO, "OmegaxBot:loadGuildSettings", `Guild <${guildId}> settings found and loaded!`);
				this.settingsLoaded.set(guildId, true);
			} else {
				guildConfig = this.importGuildSettings(guildId);
			}
			this.guildConfigList.set(guildId, guildConfig);
			this.saveGuildSettings(guildId);
		} catch (error) {
			Logger(Loglevel.ERROR, "OmegaBot:saveGuildSettings", error);
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {GuildConfiguration} old
	 * @memberof OmegaBot
	 */
	protected patchGuildConfig(old: GuildConfiguration): GuildConfiguration {
		return old;
	}

	/**
	 *
	 *
	 * @protected
	 * @param {GuildMember} M
	 * @returns
	 * @memberof OmegaBot
	 */
	protected guildMemberAddListener(M: GuildMember) {
		const Guild: Guild = M.guild;
		const { welcomeMessage, flags } = this.guildConfigList.get(Guild.id);
		const msg = welcomeMessage || "Herzlich willkommen <@!PH_MEMBER_ID>";
		if (!flags.sayHello) return;
		(Guild.systemChannel as TextChannel).send(msg.replace("PH_MEMBER_NAME", M.displayName).replace("PH_MEMBER_ID", M.id));
	};

	/**
	 *
	 *
	 * @protected
	 * @param {Guild} G
	 * @memberof OmegaBot
	 */
	protected initGuild(G: Guild) {
		this.loadGuildSettings(G.id);
		const { botname } = this.guildConfigList.get(G.id) || { botname: null };
		if (botname && G.me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) G.me.setNickname(botname);
		Logger(Loglevel.INFO, "OmegaBot:setupDiscordBot", `I'am member of ${G.name} with ${G.memberCount} members`);
		this.initGuildCache(G);

		G.client.off("guildMemberAdd", this.guildMemberAddListener);
		G.client.on("guildMemberAdd", this.guildMemberAddListener);

		if (!this.streamerChecks.has(G.id)) {
			this.streamerChecks.set(G.id, setTimeout(() => {
				const Guild: Guild = G;

				const { streamerChannelId, streamerList, announcementDelayHours, announcerMessage } = this.guildConfigList.get(G.id);

				// if (!streamerChannelId) return;

				if (!this.announcementCache.has(G.id)) {
					this.announcementCache.set(G.id, new Map<string, Activity>());
				}
				if (!this.announcementDateCache.has(G.id)) {
					this.announcementDateCache.set(G.id, new Map<string, Date>());
				}
				const aCache = this.announcementCache.get(G.id);
				const aDateCache = this.announcementDateCache.get(G.id);
				const blockTime = new Date();
				blockTime.setHours(blockTime.getHours() - (announcementDelayHours || 5));

				Guild.members.cache.forEach((Member, key) => {
					const [Game] = Member.presence.activities.filter(activity => activity.type == "STREAMING" && activity.url);
					const lastGame = aCache.get(Member.id);
					const liveDate = aDateCache.get(Member.id);
					if (Game && Game && (!lastGame || !lastGame) && (!liveDate || liveDate.getTime() < blockTime.getTime()) && (streamerList[Member.id])) {
						const StreamerConfig = streamerList[Member.id];
						const channelId = StreamerConfig?.channelId || streamerChannelId;
						const streamerMessage = StreamerConfig?.message || announcerMessage || `Achtung! PH_USERNAME ist jetzt Live mit <PH_GAME_NAME / PH_GAME_DETAIL> Siehe hier: PH_GAME_URL`;
						if (!channelId) return;
						const txtCh: TextChannel = <TextChannel>Guild.channels.cache.get(channelId);
						try {
							let msg = streamerMessage.replace("PH_USERNAME", Member.displayName).replace("PH_GAME_NAME", Game.name).replace("PH_GAME_DETAIL", Game.details).replace("PH_GAME_URL", Game.url);
							!txtCh ? null : txtCh.send(msg);
							aDateCache.set(Member.id, new Date());
						} catch (error) {
							Logger(Loglevel.ERROR, "OmegaBot:setupDiscordBot", error);
						}
					}
					aCache.set(Member.id, Game);
				});
				this.announcementCache.set(G.id, aCache);
				this.streamerChecks.get(G.id).refresh();
			}, 5000));
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof OmegaBot
	 */
	protected setupBotCommands(): void {

		this.availableBotCommands.set("?info", {
			restricted: false,
			method: (msg, [type, ...other]) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const streamChannel = msg.guild.channels.cache.get(GuildConfig.streamerChannelId);
				const streamerIdList = [];
				for (const key in GuildConfig.streamerList) {
					if (GuildConfig.streamerList.hasOwnProperty(key)) {
						streamerIdList.push(key);
					}
				}
				if (type.toLowerCase() == "streamer") {
					const response = `Aktuell ist folgendes für Streamer eingestellt:
\`\`\`ini
Kanal    = ${GuildConfig.streamerChannelId} (${streamChannel ? streamChannel.name : "nicht gesetzt!"})
Alle     = ${GuildConfig.flags.allowAll ? "ja" : "nein"}
Streamer = ${streamerIdList.map(v => v + ` ( ${msg.guild.members.cache.get(v).displayName} )`)}
Delay    = ${GuildConfig.announcementDelayHours} Stunden
Meldung  = ${GuildConfig.announcerMessage || "standard (nichts angegeben)"}
\`\`\`
`;
					let attachment: MessageAttachment = response.length > 1900 ? new MessageAttachment(response, "info.md") : null;
					TC.send(response.length > 1900 ? "Meine Antwort wäre zu lang, daher hab ich dir eine info datei zusammengestellt." : response, attachment);
				} else {
					TC.send(`Hm was? versuch mal \`?help\``);
				}
			},
			help: `?info [type]`.padEnd(40, " ") + `| Mit diesem Befehl zeige ich dir Informationen über [type] wobei type derzeit folgende Werte annehmen kann: streamer`,
			helpId: "HELP_INFO"
		})

		this.availableBotCommands.set("?help", {
			restricted: false,
			method: async (msg, [what, ...options]) => {
				const TC: TextChannel = msg.channel as TextChannel;

				const author = msg.author;
				const member = msg.guild.member(author);
				const isDeveloper = this.botConfig?.developerAccess?.includes(member.id);
				const isAdmin = member.hasPermission("ADMINISTRATOR") || isDeveloper;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);

				if (what == "announcementMsg") {
					TC.send(`Also wenn du \`!set announcementMsg [text]\` verwendest kannst du in [text] folgende Platzhalter verwenden:
\`\`\`
PH_USERNAME     | Dieser Platzhalter wird durch den Namen des Streamer's ersetzt
PH_GAME_NAME    | Dieser Platzhalter zeigt den namen des Streams an
PH_GAME_DETAIL  | Dieser Platzhalter zeigt das Spiel an, welches gestreamt wird
PH_GAME_URL     | Dieser Platzhalter wird durch einen Link zum Stream ersetzt
\`\`\``);
				} else {
					const response = `Oh, du hast die Kommandos vergessen? Hier Bitte:
\`\`\`
Kommandos für Administratoren und berechtigte Personen:
${Array.from(this.availableBotCommands.entries()).filter(([k, v]) => !v.devOnly && v.restricted).filter(([k, v]) => isAdmin || isDeveloper || (GuildConfig.commandPermissions[k] && GuildConfig.commandPermissions[k].includes(author.id))).map(([k, v]) => v.help).join("\n")}
-------------------------------
Kommandos für alle anderen:
${Array.from(this.availableBotCommands.values()).filter(v => !v.devOnly && !v.restricted).map(v => v.help).join("\n")}\n`
						+ `?[was]`.padEnd(40, " ") + `| Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
\`\`\``;
					const responseList: string[] = [];
					let index = 0;
					if (response.length > 1900) {
						let tmp = response.split(EOL);
						Logger(Loglevel.VERBOSE, "?help", `response length ${response.length} splitting response into ${tmp.length} pieces for rejoining`);
						while (tmp.length) {
							if (!responseList[index]) responseList[index] = index < 1 ? "" : "```";
							let nextLength = responseList[index].length + tmp[0].length;
							if (nextLength > 1900) {
								responseList[index] += "```";
								TC.send(responseList[index]);
								index++;
							} else {
								responseList[index] += EOL + tmp.shift();
							}
						}
						TC.send(responseList[index]);
					} else {
						TC.send(response);
					}

				}
				/*
!add [was] [text]                    | Füge einen neuen text hinzu der per ?[was] wieder abgerufen werden kann, zum Beispiel Zitate oder Infos
!remove [was]                        | Entferne alle Einträge zu [was] aus dem Speicher
!setStreamChannel                    | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
!setAllowAll [true|false]            | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
!addStreamer @name ...               | Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!
!removeStreamer @name ...            | Du kannst einen Streamer auch wieder entfernen, dann bleibe ich still
!set name [name]                     | Du kannst meinen Nicknamen ändern wenn du möchtest :)
!set allowAll [true|false]           | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
!set streamerChannel                 | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
!set announcementDelayHours [number] | Damit stellst du ein wie lange ich still bleiben soll nachdem ich einen Streamer angekündigt habe!
!set announcementMsg [text]	         | Oh das ist komplex versuch mal ?help announcementMsg
!!clear                              | Wenn du möchtest das ich mal aufräume.... ich werde aber maximal 100 Nachrichten löschen, dann brauch ich eine Pause

?wiki [was]                          | Ich werde dir einen Link zur wikipedia Seite geben, ob er funktioniert musst du selber testen!

				!i18n ls                             | Ich zeige dir eine Liste mit allen Text-Indices die ich so drauf habe.
				!i18n reset [lang?]                  | Ich werde meine Texte auf die Standardwerte zurücksetzen, du kannst eine Sprache angeben wenn du magst
				!i18n lang                           | Ich zeige dir eine Liste mit Sprachen, die ich kenne.
				!i18n get [index]                    | Ich zeige dir den Text der für [index] hinterlegt wurde
				!i18n set [index] [text]             | Damit kannst du meine Ausgabetexte ändern, beachte bitte das manche Texte Platzhalter benötigen, siehe dir vorher den text mit `!i18n get [index]` an
				?streamer                            | Ich werde dir eine Liste mit allen Streamern ausgeben, für die ich freigegeben wurde.
				!!grant [command] @name ...          | Damit kannst du ein oder mehrere Mitglider für eins meiner Kommandos freigeben
				!!revoke [command] @name ...         | Du kannst vergebene Rechte auch wieder entziehen, .. du bist der Boss!
				*/
			},
			help: `?help`.padEnd(40, " ") + "| Wenn du diese Hilfe hier mal wieder brauchst, sag einfach bescheid :)",
			helpId: "HELP_HELP"
		});

		this.availableBotCommands.set("?wiki", {
			restricted: false,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				TC.send(`Versuchs mal hier: https://de.wikipedia.org/wiki/${options[0]}`);
			},
			help: `?wiki [was]`.padEnd(40, " ") + "| Ich werde dir einen Link zur wikipedia Seite geben, ob er funktioniert musst du selber testen!",
			helpId: "HELP_WIKI"
		});

		this.availableBotCommands.set("!remove", {
			restricted: true,
			method: async (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const name: string = options.join(" ").toLowerCase();
				try {
					await customInfoCollection.hardRemove({ guildId, name });
					msg.react("👍");
				} catch (error) {
					msg.react("👎");
				}
			},
			help: `!remove [was]`.padEnd(40, " ") + "| Entferne alle Einträge zu [was] aus dem Speicher",
			helpId: "HELP_REMOVE"
		});

		this.availableBotCommands.set("!add", {
			restricted: true,
			devOnly: false,
			method: async (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const [target, ...text] = options;
				if (["help", "wiki", "info"].includes(target)) {
					msg.react("👎");
					return;
				}
				const name = target.toLowerCase();
				const item = await customInfoCollection.findItem({ guildId, name });
				const content = text.join(" ");
				if (item) {
					if (!isArray(item.data)) {
						item.data = [item.data];
					}
					item.data.push(content);
					try {
						await customInfoCollection.save(item);
						msg.react("👍");
					} catch (error) {
						msg.react("👎");
					}
				} else {
					const nItem = plainToClass(CustomInfo, { data: content, name, guildId });
					try {
						await customInfoCollection.save(nItem);
						msg.react("👍");
					} catch (error) {
						msg.react("👎");
					}
				}
				// const file = resolve(rootDir, "infos", guildId, target.toLowerCase() + ".json");
				// let data = null;
				// try {
				// 	const dataRaw = readFileSync(file);
				// 	data = JSON.parse(dataRaw.toString());
				// 	if (Array.isArray(data.data)) {
				// 		data.data.push(text.join(" "));
				// 	} else {
				// 		data.data = [data.data, text.join(" ")];
				// 	}
				// } catch (error) {
				// 	data = { data: text.join(" ") };
				// }
				// writeFileSync(file, JSON.stringify(data, null, 2));
				// msg.react("👍");
			},
			help: `!add [was] [text]`.padEnd(40, " ") + "| Füge einen neuen text hinzu der per ?[was] wieder abgerufen werden kann, zum Beispiel Zitate oder Infos",
			helpId: "HELP_ADD"
		});

		this.availableBotCommands.set("!addStreamer", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				msg.mentions.members.array().forEach((Member) => {
					if (!GuildConfig.streamerList[Member.id]) {
						GuildConfig.streamerList[Member.id] = {
							id: Member.id,
							channelId: null,
							message: null
						}
					}
				});
				this.saveGuildSettings(guildId, msg);
			},
			help: `!addStreamer @name ...`.padEnd(40, " ") + "| Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!",
			helpId: "HELP_STREAMER_ADD"
		});

		this.availableBotCommands.set("!setStreamer", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const [prop, value, ...other] = options;
				if (!["channelId", "message"].includes(prop)) {
					TC.send(`Die Eigenschaft ${prop} kenne ich nicht!`);
					return;
				}
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				msg.mentions.members.array().forEach((Member) => {
					if (!GuildConfig.streamerList[Member.id]) {
						GuildConfig.streamerList[Member.id] = {
							id: Member.id,
							channelId: prop == "channelId" ? value : null,
							message: prop == "message" ? value : null
						}
					} else if (prop == "channelId") {
						if (value == "null") {
							GuildConfig.streamerList[Member.id].channelId = null;
						} else if (msg.guild.channels.cache.has(value)) {
							GuildConfig.streamerList[Member.id].channelId = value;
						} else {
							TC.send(`Die KanalID ${value} kenne ich nicht!`);
						}
					} else if (prop == "message") {
						GuildConfig.streamerList[Member.id].message = value == "null" ? null : value;
					}
				});
				this.saveGuildSettings(guildId, msg);
			},
			help: `!setStreamer [PROP] [VALUE] @name ...`.padEnd(40, " ") + "| Ändere die Konfiguration eines Streamers, prop kann 'channelId' oder 'message' sein",
			helpId: "HELP_STREAMER_SET"
		});

		this.availableBotCommands.set("!removeStreamer", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				msg.mentions.members.array().forEach((Member) => {
					if (GuildConfig.streamerList[Member.id]) {
						delete GuildConfig.streamerList[Member.id];
					}
				});
				this.saveGuildSettings(guildId, msg);
			},
			help: `!removeStreamer @name ...`.padEnd(40, " ") + "| Du kannst einen Streamer auch wieder entfernen, dann bleibe ich still",
			helpId: "HELP_STREAMER_REMOVE"
		});

		this.availableBotCommands.set("!setStreamChannel", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				GuildConfig.streamerChannelId = TC.id;
				this.saveGuildSettings(guildId, msg);
			},
			help: `!setStreamChannel`.padEnd(40, " ") + "| Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen",
			helpId: "HELP_SET_STREAM_CH"
		});

		this.availableBotCommands.set("!setAllowAll", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const to = options[0] == "true";
				GuildConfig.flags.allowAll = to;
				this.saveGuildSettings(guildId, msg);
			},
			help: `!setAllowAll [true|false]`.padEnd(40, " ") + "| Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]",
			helpId: "HELP_SET_ALLOW_ALL"
		});

		this.availableBotCommands.set("!unset", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const me = msg.guild.me;
				const [prop, ...args] = options;
				switch (prop) {
					case "role": {
						const [roleId] = args;
						const [Role, ...other] = msg.mentions.roles.array();
						const useRoleId = Role?.id || roleId;
						if (GuildConfig.selfPromotionRoles[useRoleId]) {
							delete GuildConfig.selfPromotionRoles[useRoleId];
						} else {
						}
						this.saveGuildSettings(guildId, msg);

					} break;
					default:
						msg.react("👎");
						break;
				}

			},
			help: `!unset role @role`.padEnd(40, " ") + "| Entziehe mir das Recht diese Rolle zu vergeben",
			helpId: "HELP_UNSET"
		});

		this.availableBotCommands.set("!set", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const me = msg.guild.me;
				const [prop, ...args] = options;
				switch (prop) {
					case "allowAll": {
						GuildConfig.flags.allowAll = [true, "true", 1, "1"].includes(args[0]);
						this.saveGuildSettings(guildId, msg);
					} break;
					case "name": {
						GuildConfig.botname = args.join(" ");
						if (me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) {
							me.setNickname(args.join(" "));
							TC.send(`Okay, dann heiße ich nun *${args}* für dich!`);
							this.saveGuildSettings(guildId, msg);
						} else {
							msg.react("👎");
							TC.send(`Tut mir leid, aber ich habe nicht das recht meinen Nicknamen selber zu ändern.`);
						}
					} break;
					case "streamerChannel": {
						GuildConfig.streamerChannelId = TC.id;
						this.saveGuildSettings(guildId, msg);
					} break;
					case "announcementDelayHours": {
						GuildConfig.announcementDelayHours = Number(args);
						this.saveGuildSettings(guildId, msg);
					} break;
					case "announcementMsg": {
						GuildConfig.announcerMessage = args.join(" ");
						this.saveGuildSettings(guildId, msg);
					} break;
					case "welcomeMsg": {
						GuildConfig.welcomeMessage = args.join(" ");
						this.saveGuildSettings(guildId, msg);
					} break;
					case "sayHello": {
						GuildConfig.flags.sayHello = [true, "true", 1, "1"].includes(args[0]);
						this.saveGuildSettings(guildId, msg);
					} break;
					case "removeJoinCommand": {
						GuildConfig.flags.removeJoinCommand = [true, "true", 1, "1"].includes(args[0]);
						this.saveGuildSettings(guildId, msg);
					} break;
					case "removeLeaveCommand": {
						GuildConfig.flags.removeLeaveCommand = [true, "true", 1, "1"].includes(args[0]);
						this.saveGuildSettings(guildId, msg);
					} break;
					case "streamer": {
						const [streamerId, property, ...value] = args;
						const registredStreamerIds = Object.keys(GuildConfig.streamerList);
						if (registredStreamerIds.includes(streamerId)) {
							switch (property) {
								case "channelId": {
									GuildConfig.streamerList[streamerId].channelId = value.join();
									this.saveGuildSettings(guildId, msg);
								} break;
								case "message": {
									GuildConfig.streamerList[streamerId].message = value.join(" ");
									this.saveGuildSettings(guildId, msg);
								} break;
								default:
									// TODO unknown property, what is your problem?
									break;
							}
						} else {
							// TODO message please use addStreamer first
						}
					} break;
					case "role": {
						const [roleId, channelId, alias, emoji] = args;
						const [Role, ...other] = msg.mentions.roles.array();
						if (other && other.length) {
							// TODO Sorry only 1 role per command!
						} else {
							const useRoleId = Role?.id || roleId;
							if (GuildConfig.selfPromotionRoles[useRoleId]) {

								if (channelId) GuildConfig.selfPromotionRoles[useRoleId].channelId.push(channelId);
								if (alias) GuildConfig.selfPromotionRoles[useRoleId].alias = alias;
								if (emoji) GuildConfig.selfPromotionRoles[useRoleId].emojiName = emoji;
							} else {
								GuildConfig.selfPromotionRoles[useRoleId] = {
									id: useRoleId,
									alias: alias ? alias : null,
									channelId: channelId ? [channelId] : [],
									emojiName: emoji
								}
							}
							this.saveGuildSettings(guildId, msg);
						}
					} break;
					default:
						msg.react("👎");
						break;
				}
			},
			help: `!set name [name]`.padEnd(40, " ") + `| Du kannst meinen Nicknamen ändern wenn du möchtest :)\n`
				+ `!set allowAll [true|false]`.padEnd(40, " ") + `| Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]\n`
				+ `!set streamerChannel`.padEnd(40, " ") + `| Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen\n`
				+ `!set announcementDelayHours [number]`.padEnd(40, " ") + `| Damit stellst du ein wie lange ich still bleiben soll nachdem ich einen Streamer angekündigt habe!\n`
				+ `!set announcementMsg [text]`.padEnd(40, " ") + `| Oh das ist komplex versuch mal ?help announcementMsg\n`
				+ `!set sayHello [true|false]`.padEnd(40, " ") + `| Soll ich neue Mitglieder persönlich begrüßen oder nicht?\n`
				+ `!set removeJoinCommand [true|false]`.padEnd(40, " ") + `| Soll ich eingegebene !join Befehle löschen oder nicht?\n`
				+ `!set removeLeaveCommand [true|false]`.padEnd(40, " ") + `| Soll ich eingegebene !leave Befehle löschen oder nicht?\n`
				+ `!set role @role channelId? alias? emoji?`.padEnd(40, " ") + `| Konfiguriere eine Rolle die ich vergeben darf\n`
				+ `!set streamer memberId property value`.padEnd(40, " ") + `| Konfiguriere einen Streamer, property kann 'message' oder 'channelId' sein\n`
				+ `!set welcomeMsg [text]`.padEnd(40, " ") + `| Damit kannst du den Willkommenstext für neue Mitglieder ändern. Nutze PH_MEMBER_NAME und/oder PH_MEMBER_ID als Platzhalter`,
			helpId: "HELP_SET"
		});

		this.availableBotCommands.set("!!clear", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_MESSAGES");
				if (check) {
					this.clearTextChannel(TC, msg);
				} else {
					TC.send(`Tut mir leid, aber ich habe nicht die nötigen Rechte um hier sauber zu machen :'(`);
				}
			},
			help: `!!clear`.padEnd(40, " ") + "| Wenn du möchtest das ich mal aufräume.... aber Vorsicht! Du kannst mich nicht aufhalten",
			helpId: "HELP_CLEAR"
		});

		this.availableBotCommands.set("!!export", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const Author = msg.author;
				const TC: TextChannel = msg.channel as TextChannel;
				const check = TC.permissionsFor(TC.guild.me).has("ATTACH_FILES");
				if (check) {
					TC.send(`Tut mir leid, aber diese Funktion wird aktuell überarbeitet - oder auch entfernt, schaue später wieder`);
					return;
					// let message = `Ok hier der angeforderte Datenexport für dich <@!${Author.id}>`;
					// let attachment: MessageAttachment = null;
					// const file = resolve(rootDir, "infos", msg.guild.id + ".json");
					// try {
					// 	const rawFileContent = readFileSync(file);
					// 	attachment = new MessageAttachment(rawFileContent, msg.guild.id + ".json");
					// } catch (error) {
					// 	message = `Huch, da lief was falsch, sorry! Bitte dem Entwickler melden: \n\`${error}\``;
					// }
					// TC.send(message, attachment);
				} else {
					TC.send(`Tut mir leid, aber ich habe nicht die nötigen Rechte um Dateien anzuhängen`);
				}
			},
			help: `!!export`.padEnd(40, " ") + "| Ich werde dir alles was ich weiss per Datei senden!",
			helpId: "HELP_CLEAR"
		});

		// TEMPLATE

		this.availableBotCommands.set("!template", {
			restricted: true,
			devOnly: true,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
			},
			help: `!template`.padEnd(40, " ") + "| Ähm.. das ist kein echtes Kommando...",
			helpId: "HELP_TEMPLATE"
		});

		// Self promotion
		// ?rolesInfo
		this.availableBotCommands.set("?roles", {
			restricted: false,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				// const BotRolePosition = TC.guild.me.highestRole.calculatedPosition;
				const Author = msg.author;
				// const roleNames: string[] = [];
				const roleIds = Object.keys(GuildConfig.selfPromotionRoles)
				const roles = roleIds.map(roleId => msg.guild.roles.resolve(roleId))
				const roleNames = roles.map((R) => "`" + R?.name + "`");
				// const roleNames = msg.guild.roles.cache.filter((R) => !!GuildConfig.selfPromotionRoles[R.id]).map((R) => "`" + R.name + "`");
				roleNames.length < 1 ? TC.send(`Hey <@!${Author.id}>! Tut mir leid aber ich darf keine Rollen vergeben :'(`) : TC.send(`Hey <@!${Author.id}>! Folgende Rollen kann ich vergeben/nehmen: ${roleNames.join(', ')}`);
				// roleNamesWarn.length<1?null: TC.send(`ACHTUNG! Folgende Rollen sind über meinem Niveau: ${roleNamesWarn.join(', ')}`);
			},
			help: `?roles`.padEnd(40, " ") + "| Ich zeige dir welche Rollen ich verwalten darf, benutze `!join @role` um einer Rolle beizutreten.",
			helpId: "HELP_ROLES_INFO"
		});

		this.availableBotCommands.set("!rolesAdd", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const BotRolePosition = TC.guild.me.roles.highest.position;
				const roleNames: string[] = [];
				// const roleNamesWarn: string[] = [];
				const Author = msg.author;
				msg.mentions.roles.array().forEach((Role) => {
					if (Role.managed) {
						TC.send(`ACHTUNG! Die Rolle \`${Role.name}\` wird von einem anderen Service verwaltet, die kann ich nicht vergeben`);
						return;
					}
					if (Role.position >= BotRolePosition) {
						// roleNamesWarn.push(Role.name);
						TC.send(`UPS! Die Rolle \`${Role.name}\` ist über meinem Niveau, ich kann Sie nicht vergeben, sorry!`);
						return;
					}
					if (!GuildConfig.selfPromotionRoles[Role.id]) {
						GuildConfig.selfPromotionRoles[Role.id] = {
							id: Role.id,
							alias: null,
							channelId: null,
							emojiName: null
						};
						roleNames.push(Role.name);

					}
				});
				this.saveGuildSettings(guildId, msg);
				roleNames.length < 1 ? null : TC.send(`Alles klar <@!${Author.id}>, ich werde jetzt Mitglieder erlauben folgenden Rollen beizutreten: ${roleNames.join(', ')}`);
				// roleNamesWarn.length<1?null: TC.send(`ACHTUNG! Folgende Rollen sind über meinem Niveau: ${roleNamesWarn.join(', ')}`);
			},
			help: `!rolesAdd @role ...`.padEnd(40, " ") + "| Du kannst mir erlauben bestimmte Rollen an Mitglieder zu vergeben wenn diese '!join @role' verwenden - und ich die Rechte dazu habe",
			helpId: "HELP_ROLES_ADD"
		});

		this.availableBotCommands.set("!rolesRemove", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				// const BotRolePosition = TC.guild.me.highestRole.calculatedPosition;
				const roleNames: string[] = [];
				// const roleNamesWarn: string[] = [];
				const Author = msg.author;
				msg.mentions.roles.array().forEach((Role) => {
					if (GuildConfig.selfPromotionRoles[Role.id]) {
						delete GuildConfig.selfPromotionRoles[Role.id];
						roleNames.push(Role.name);

						// if(Role.calculatedPosition>=BotRolePosition) {
						// 	roleNamesWarn.push(Role.name);
						// }
					}
				});
				this.saveGuildSettings(guildId, msg);
				roleNames.length < 1 ? null : TC.send(`Alles klar <@!${Author.id}>, ich werde jetzt Mitglieder nicht mehr erlauben folgenden Rollen beizutreten: ${roleNames.join(',')}`);
				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check) {
					TC.send(`ACHTUNG! Ich habe nicht die nötigen Rechte um Rollen zu verwalten!`);
				}
			},
			help: `!rolesRemove @role ...`.padEnd(40, " ") + "| Du kannst Rollen auch wieder entfernen",
			helpId: "HELP_ROLES_REMOVE"
		});

		this.availableBotCommands.set("!join", {
			restricted: false,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const Author = msg.author;
				const BotRolePosition = TC.guild.me.roles.highest.position;

				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check) {
					TC.send(`ACHTUNG! Ich habe nicht die nötigen Rechte um Rollen zu verwalten!`);
					return;
				}


				const Role = msg.mentions.roles.array()[0];
				const selfPromotionConfig = GuildConfig.selfPromotionRoles[Role.id];
				if (selfPromotionConfig.channelId.length > 0 && !selfPromotionConfig.channelId.includes(TC.id)) {
					return; // not allowed in this channel
				}
				if (selfPromotionConfig && Role.position < BotRolePosition) {
					msg.guild.member(Author).roles.add(Role);
					TC.send(`Alles klar <@!${Author.id}>, du bist jetzt in \`${Role.name}\`, herzlichen Glückwunsch!`);
				} else {
					TC.send(`Tut mir leid <@!${Author.id}>, die Rolle \`${Role.name}\` darf ich nicht verwalten.`);
				}
			},
			help: `!join @role`.padEnd(40, " ") + "| Versuche einer Rolle beizutreten, ob es klappt sag ich dir schon!",
			helpId: "HELP_ROLES_JOIN"
		});

		this.availableBotCommands.set("!leave", {
			restricted: false,
			devOnly: false,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const Author = msg.author;
				const BotRolePosition = TC.guild.me.roles.highest.position;

				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check) {
					TC.send(`ACHTUNG! Ich habe nicht die nötigen Rechte um Rollen zu verwalten!`);
					return;
				}

				const Role = msg.mentions.roles.array()[0];
				if (GuildConfig.selfPromotionRoles[Role.id] && Role.position < BotRolePosition) {
					msg.guild.member(Author).roles.remove(Role);
					TC.send(`Alles klar <@!${Author.id}>, du bist jetzt nicht mehr in \`${Role.name}\``);
				} else {
					TC.send(`Tut mir leid <@!${Author.id}>, die Rolle \`${Role.name}\` darf ich nicht verwalten.`);
				}
			},
			help: `!leave @role`.padEnd(40, " ") + "| du willst eine Rolle loswerden? Dann versuch es damit!",
			helpId: "HELP_ROLES_LEAVE"
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {void}
	 * @memberof OmegaBot
	 */
	protected async setupDiscordBot(): Promise<void> {

		this.botConfig = await botNodeCollection.getItem(this.botNodeId);

		console.log(this.botConfig, this.botNodeId);

		if (!this.botConfig?.enabled) {
			Logger(Loglevel.WARNING, "OmegaBot:setupDiscordBot", `Discord not enabled.`);
			return;
		}

		this.DiscordBot = new Client();
		this.DiscordBot.on('ready', () => {
			Logger(Loglevel.INFO, "OmegaBot:setupDiscordBot", `Logged in as ${this.DiscordBot.user.tag}!`);

			this.DiscordBot.guilds.cache.forEach((G, key) => {
				this.initGuild(G);
			});
		});



		this.DiscordBot.on("guildCreate", (guild) => {
			this.initGuild(guild);
			try {
				Logger(Loglevel.INFO, "DiscordBot.on->guildCreate", `Just joined new Guild ${guild.name} with ${guild.memberCount} members`);
				const publicCH = guild.channels.cache.find((GC) => GC.type == "text" && GC.permissionsFor(guild.me).has("SEND_MESSAGES"));
				(<TextChannel>guild.systemChannel || <TextChannel>publicCH).send(`Hey cool, da bin ich! Tippe \`?help\` und ich sage dir was ich kann!`);
			} catch (error) {
				Logger(Loglevel.ERROR, "DiscordBot.on->guildCreate", error);
			}
		});

		this.DiscordBot.on('messageReactionAdd', async (messageReaction, user) => {
			if (user.bot || messageReaction.message.channel.type !== "text") {
				return; // dont handle bot reactions
			}
			const { emoji, message } = messageReaction;
			const guildId = message.guild.id;
			const TC = message.channel as TextChannel;
			const { selfPromotionRoles } = this.guildConfigList.get(guildId);
			const [role] = (selfPromotionRoles ? Object.keys(selfPromotionRoles) : []).filter(roleId => selfPromotionRoles[roleId].emojiName == emoji.name).map(roleId => selfPromotionRoles[roleId]);
			Logger(Loglevel.VERBOSE, "DiscordBot.on->messageReactionAdd", `${user.username} reacted with <${emoji.name}> (ID:${emoji.id}) connected role <${role?.id}>`);
			if (role) {
				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check || role.channelId.length > 0 && !role.channelId.includes(TC.id)) {
					return; // not allowed in this channel
				}
				const Role = await message.guild.roles.fetch(role.id);
				if (Role.comparePositionTo(message.guild.me.roles.highest) < 0) {
					message.guild.member(user.id).roles.add(Role);
				} else {
					Logger(Loglevel.VERBOSE, "DiscordBot.on->messageReactionAdd", `Highest bot role vs. role position: ${Role.comparePositionTo(message.guild.me.roles.highest)}`);
				}
			}

		});

		this.DiscordBot.on('messageReactionRemove', async (messageReaction, user) => {
			if (user.bot || messageReaction.message.channel.type !== "text") {
				return; // dont handle bot reactions
			}
			const { emoji, message } = messageReaction;
			const guildId = message.guild.id;
			const TC = message.channel as TextChannel;
			const { selfPromotionRoles } = this.guildConfigList.get(guildId);
			const [role] = Object.keys(selfPromotionRoles).filter(roleId => selfPromotionRoles[roleId].emojiName == emoji.name).map(roleId => selfPromotionRoles[roleId]);
			Logger(Loglevel.VERBOSE, "DiscordBot.on->messageReactionRemove", `${user.username} removed reaction <${emoji.name}> (ID:${emoji.id}) connected role <${role?.id}>`);
			if (role) {
				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check || role.channelId.length > 0 && !role.channelId.includes(TC.id)) {
					return; // not allowed in this channel
				}
				const Role = await message.guild.roles.fetch(role.id);
				if (Role.comparePositionTo(message.guild.me.roles.highest) < 0) {
					message.guild.member(user.id).roles.remove(Role);
				} else {
					Logger(Loglevel.VERBOSE, "DiscordBot.on->messageReactionRemove", `Highest bot role vs. role position: ${Role.comparePositionTo(message.guild.me.roles.highest)}`);
				}
			}

		});

		this.DiscordBot.on('messageReactionRemoveAll', (message) => {
			// Logger(Loglevel.VERBOSE, "DiscordBot.on->messageReactionRemoveAll", message);
		});


		this.DiscordBot.on('message', async msg => {
			if (!msg.guild) return;
			// ignore bot messages
			if (msg.author.bot) {
				return;
			}
			const guildId: string = msg.guild.id;
			const me = msg.guild.me;
			const TC: TextChannel = msg.channel as TextChannel;
			const author = msg.author;
			const member = await msg.guild.member(author);
			const isDeveloper = this.botConfig?.developerAccess?.includes(member.id);
			const isAdmin = member.hasPermission("ADMINISTRATOR") || isDeveloper;
			const isCommand = msg.content.startsWith('?') || msg.content.startsWith('!');
			const GuildConfig = this.guildConfigList.get(guildId);
			const { streamerChannelId, streamerList, announcementDelayHours, announcerMessage, commandPermissions, selfPromotionRoles } = GuildConfig;
			const [isAliasFor] = (selfPromotionRoles ? Object.keys(selfPromotionRoles) : []).filter(role => msg.content === selfPromotionRoles[role].alias);

			// ignore all other messages
			if (!isCommand) {
				if (isAliasFor) {
					const role = selfPromotionRoles[isAliasFor];
					Logger(Loglevel.VERBOSE, "DiscordBot.on->message", `Member used alias <${role.alias}> for ${role.id}`);
					const guildRole = await msg.guild.roles.fetch(role.id);
					const isCorrectChannel = role.channelId.includes(TC.id);

					if (isCorrectChannel) member.roles.add(guildRole);
				} else {
					Logger(Loglevel.VERBOSE, "DiscordBot.on->message", `Unhandled message <${msg.content}> from ${author.username}`);
				}
				return;
			}

			const [command, ...options] = msg.content.split(" ");
			if (!this.availableBotCommands.has(command)) {
				if (!msg.content.startsWith('?')) {
					msg.react("👎");
					TC.send(`Also dieser Befehl ist mir unbekannt! Probier doch mal \`?help\` `);
				} else {
					const infoName = command.replace("?", "").toLowerCase();
					const customInfo = await customInfoCollection.findItem({ guildId: guildId, name: infoName });
					// TODO globalInfo?
					if (customInfo) {
						if (Array.isArray(customInfo.data)) {
							shuffle(customInfo.data);
							TC.send(customInfo.data[0]);
						} else {
							TC.send(customInfo.data);
						}
					} else {
						TC.send(`Darüber (${command}) weiss ich überhaupt gar nichts!`);
					}
				}
				return;
			}

			const boco = this.availableBotCommands.get(command);

			if (boco.devOnly && !isDeveloper) {
				msg.react("👎");
				TC.send(`Ey! Dieser Befehl ist für den Entwickler reserviert, lass deine Finger davon!`);
				return;
			}

			if (boco.restricted && !isAdmin && (!commandPermissions[command] || !commandPermissions[command].includes(member.id))) {
				msg.react("👎");
				TC.send(`Moment mal! Dieser Befehl ist für bestimmte Personen zugelassen und du gehörst... NICHT dazu!`);
				return;
			}

			boco.method(msg, options);
			return;

		});

		this.DiscordBot.on("error", (e: Error) => {
			Logger(Loglevel.ERROR, "OmegaBot:setupDiscordBot@error", e);
		});

		this.DiscordBot.on("warn", (w) => {
			Logger(Loglevel.WARNING, "OmegaBot:setupDiscordBot@warn", w);
		});

		this.DiscordBot.on("debug", (d) => {
			Logger(-1, "OmegaBot:setupDiscordBot@debug", d);
		});

		this.DiscordBot.on("rateLimit", (limit) => {
			Logger(Loglevel.DEBUG, "OmegaBot:setupDiscordBot@rateLimit", limit);
		});

		this.DiscordBot.login(this.botConfig.token).catch(e => {
			Logger(Loglevel.ERROR, "OmegaBot:setupDiscordBot->login", e);
		});

	}

	/**
	 * fetch last 100 messages from every channel to support reactions to those messages in case of bot restart
	 *
	 * @protected
	 * @param {Guild} guild
	 * @memberof OmegaBot
	 */
	protected initGuildCache(guild: Guild) {

		guild.channels.cache.forEach(async channel => {
			if (channel.type == "text") {
				const TC: TextChannel = channel as TextChannel;
				try {
					const messages = await TC.messages.fetch({ limit: 100 }, true);
					Logger(Loglevel.VERBOSE, "OmegaBot:initGuildCache", `loaded ${messages.size} messages from ${TC.name}`);
				} catch (error) {
					// no access == 50001
					if (error.code !== 50001) {
						Logger(Loglevel.ERROR, "OmegaBot:initGuildCache", error);
					}
				}
			}
		})
	}

	/**
	 *
	 *
	 * @protected
	 * @param {TextChannel} TC
	 * @param {Message} m
	 * @param {number} [d=0]
	 * @memberof OmegaBot
	 */
	protected clearTextChannel(TC: TextChannel, m: Message, d: number = 0): void {
		const startId = TC.lastMessageID;
		const startMsg = TC.lastMessage;
		const Author = m.author;

		TC.messages.fetch({ before: startId, limit: 100 }).then(async (msgList) => {
			Logger(Loglevel.DEBUG, "OmegaBot.clearTextChannel", `Found ${msgList.size} messages in ${TC.guild.name}/${TC.name} to delete`);
			const idList = msgList.keyArray();
			const deleteQueue = [];
			for (let i = 0; i < idList.length; i++) {
				const msgId = idList[i];
				const msg = msgList.get(msgId);
				msg && !msg.pinned && msg.deletable && msg.id != m.id ? deleteQueue.push(msg.delete()) : null;
			}
			await Promise.all(deleteQueue).catch(e => Logger(Loglevel.ERROR, "OmegaBot.clearTextChannel", e.message));
			const startChk = startMsg && startMsg.deletable && !startMsg.pinned && startMsg.id != m.id;
			startChk ? await startMsg.delete() : null; // will only trigger once since message is deleted in the first loop
			const total = d + idList.length + (startChk ? 1 : 0);
			const reactionNumbers = ["\u0030\u20E3", "\u0031\u20E3", "\u0032\u20E3", "\u0033\u20E3", "\u0034\u20E3", "\u0035\u20E3", "\u0036\u20E3", "\u0037\u20E3", "\u0038\u20E3", "\u0039\u20E3"];// ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
			if (idList.length > 99) { this.clearTextChannel(TC, m, total); } else {
				// we are done

				m.channel.send(`Okay <@!${m.author.id}>, ich habe \`${total}\` Nachrichten aus dem Kanal \`${TC.name}\` entfernt!`);
				// try {
				// 	await m.react("🇩");
				// 	await m.react("🇴");
				// 	await m.react("🇳");
				// 	await m.react("🇪");
				// 	await m.react(encodeURIComponent("\u25B6"));
				// } catch (e) {
				// 	Logger(Loglevel.ERROR, "OmegaBot.clearTextChannel", e.message);
				// }

				// const totalDigits = total.toString().split("").map((s) => Number(s));

				// for (let i = 0; i < totalDigits.length; i++) {
				// 	const digit = totalDigits[i];
				// 	const emoji = encodeURIComponent(reactionNumbers[digit]);
				// 	await m.react(emoji).catch(e => Logger(Loglevel.ERROR, "OmegaBot.clearTextChannel", e.message, emoji, digit));
				// }
			}
		});
	}
}
