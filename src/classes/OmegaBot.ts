'use strict';
import { Client, Game, Guild, Message, Permissions, TextChannel } from "discord.js";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, accessSync } from "fs";
import { resolve } from "path";
import { Logger } from "../lib/tools/Logger";
import { NodeConfig, processType, processNodeId } from "../config";
import { GuildConfiguration } from "../models/GuildConfiguration";
import { WorkerProcess } from "./WorkerProcess";
import { shuffle } from "../lib/tools/shuffle";

interface BotMethod {
	(msg: Message, args?: string[]): void
}

interface BotCommand {
	restricted?: boolean,	// restricted or free for all
	devOnly?: boolean,		// execute only from developer
	method: BotMethod,
	helpId: string,			// help index
	help: string			// help default text
};


export class OmegaBot extends WorkerProcess {
	private static _NodeConfig: NodeConfig = null;
	protected static highlander: OmegaBot = null;

	public static get NodeConfig(): NodeConfig {
		return OmegaBot._NodeConfig;
	};

	public static getInstance(nc?: NodeConfig): OmegaBot {
		OmegaBot._NodeConfig = nc ? nc : OmegaBot.NodeConfig;
		if (!OmegaBot.highlander) {
			OmegaBot.highlander = new OmegaBot();
		}
		return OmegaBot.highlander;
	}

	// Object stuff
	protected DiscordBot: Client = null;
	protected timer: NodeJS.Timer = null;
	protected streamerChecks: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>();
	protected guildConfigList: Map<string, GuildConfiguration> = new Map<string, GuildConfiguration>();

	private get me(): string {
		return __filename.split("/").pop();
	}
	public get title(): string {
		return "OmegaBot";
	}

	protected availableBotCommands: Map<string, BotCommand> = new Map<string, BotCommand>();
	protected announcementCache: Map<string, Map<string, Game>> = new Map<string, Map<string, Game>>();
	protected announcementDateCache: Map<string, Map<string, Date>> = new Map<string, Map<string, Date>>();
	protected settingsLoaded: Map<string, boolean> = new Map<string, boolean>();

	/**
	 *Creates an instance of OmegaBot.
	 * @memberof OmegaBot
	 */
	constructor() {
		super();
		this.setupDiscordBot();
		this.setupBotCommands();
		this.timer = setTimeout(_ => { this.run(); }, OmegaBot.NodeConfig.tick);
	}

	/**
	 *
	 *
	 * @param {NodeConfig} nc
	 * @memberof OmegaBot
	 */
	public updateConfig(nc: NodeConfig): void {
		Object.assign(OmegaBot._NodeConfig, nc);
	}

	/**
	 *
	 *
	 * @protected
	 * @memberof OmegaBot
	 */
	protected run(): void {
		const guilds = this.DiscordBot && this.DiscordBot.guilds ? this.DiscordBot.guilds.size : 0;
		process.title = `OmegaBot: ${processNodeId} - ${guilds}`;
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
	protected saveGuildSettings(guildId: string, msg?: Message) {
		const GuildConfig: GuildConfiguration = this.guildConfigList.get(guildId) || {
			allowAll: false,
			announcementDelayHours: 5,
			announcerMessage: null,
			botname: "OmegaBot",
			streamerChannelId: null,
			streamerList: [],
			streamerMessages: {},
			commandPermissions: {}
		};

		try {
			const file = resolve(process.cwd(), "infos", guildId + ".json");
			try {
				writeFileSync(file, JSON.stringify(GuildConfig, null, 2));
				!msg ? null : msg.react("👍");
			} catch (error) {
				Logger(911, "OmegaBot:saveGuildSettings", error);
				!msg ? null : msg.react("👎");
			}

		} catch (error) {
			Logger(911, "OmegaBot:saveGuildSettings", error);
			!msg ? null : msg.react("👎");
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {string} guildId
	 * @memberof OmegaBot
	 */
	protected loadGuildSettings(guildId: string) {
		if (this.settingsLoaded.has(guildId) && this.settingsLoaded.get(guildId)) return;
		let GuildConfig: GuildConfiguration = {
			allowAll: false,
			announcementDelayHours: 5,
			announcerMessage: null,
			botname: "OmegaBot",
			streamerChannelId: null,
			streamerList: [],
			streamerMessages: {},
			commandPermissions: {}
		};
		const dataPath = resolve(process.cwd(), "infos", guildId);
		try {
			accessSync(dataPath);
		} catch (error) {
			try {
				mkdirSync(dataPath, { recursive: true });
			} catch (error) {
				Logger(911, "OmegaBot:loadGuildSettings", `Unable to create data-directory ${dataPath}`);
			}
		}
		try {
			const file = resolve(process.cwd(), "infos", guildId + ".json");
			try {
				const dataRaw = readFileSync(file);
				GuildConfig = JSON.parse(dataRaw.toString());
				Logger(110, "OmegaBot:loadGuildSettings", `Guild <${guildId}> settings found and loaded!`);
			} catch (error) {
				Logger(510, "OmegaBot:loadGuildSettings", `Guild <${guildId}> not found set all to default`);
			} finally {
				this.settingsLoaded.set(guildId, true);
				this.guildConfigList.set(guildId, GuildConfig);
			}

		} catch (error) {
			Logger(911, "OmegaBot:loadGuildSettings", error);
		}
	}

	/**
	 *
	 *
	 * @protected
	 * @param {Guild} G
	 * @memberof OmegaBot
	 */
	protected initGuild(G: Guild) {
		this.loadGuildSettings(G.id);
		const { botname } = this.guildConfigList.get(G.id);
		if (botname && G.me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) G.me.setNickname(botname);
		Logger(111, "OmegaBot:setupDiscordBot", `I'am member of ${G.name} with ${G.memberCount} members`);
		if (!this.streamerChecks.has(G.id)) {
			this.streamerChecks.set(G.id, setTimeout(() => {
				const Guild: Guild = G;

				const { streamerChannelId, allowAll, streamerList, announcementDelayHours, announcerMessage } = this.guildConfigList.get(G.id);

				if (!streamerChannelId) return;

				if (!this.announcementCache.has(G.id)) {
					this.announcementCache.set(G.id, new Map<string, Game>());
				}
				if (!this.announcementDateCache.has(G.id)) {
					this.announcementDateCache.set(G.id, new Map<string, Date>());
				}
				const aCache = this.announcementCache.get(G.id);
				const aDateCache = this.announcementDateCache.get(G.id);
				const blockTime = new Date();
				blockTime.setHours(blockTime.getHours() - (announcementDelayHours || 5));

				Guild.members.forEach((Member, key) => {
					const Game = Member.presence.game;
					const lastGame = aCache.get(Member.id);
					const liveDate = aDateCache.get(Member.id);
					if (Game && Game.streaming && (!lastGame || !lastGame.streaming) && (!liveDate || liveDate.getTime() < blockTime.getTime()) && (allowAll || streamerList.includes(Member.id))) {
						const txtCh: TextChannel = <TextChannel>Guild.channels.get(streamerChannelId);
						try {
							let msg = announcerMessage.replace("PH_USERNAME", Member.displayName).replace("PH_GAME_NAME", Game.name).replace("PH_GAME_DETAIL", Game.details).replace("PH_GAME_URL", Game.url);
							// !txtCh ? null : txtCh.send(`@everyone Aufgepasst ihr Seelen! \`${Member.displayName}\` streamt gerade! \n\`${Game.name}\` - \`${Game.details}\` \n Siehe hier:${Game.url}`);
							// @everyone Aufgepasst ihr Seelen! `PH_USERNAME` streamt gerade!\n`PH_GAME_NAME` - `PH_GAME_DETAIL`\nSiehe hier: PH_GAME_URL
							!txtCh ? null : txtCh.send(msg);
							aDateCache.set(Member.id, new Date());
						} catch (error) {
							Logger(911, "OmegaBot:setupDiscordBot", error);
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

		this.availableBotCommands.set("?help", {
			restricted: false,
			method: (msg, [what, ...options]) => {
				const TC: TextChannel = msg.channel as TextChannel;
				if (what == "announcementMsg") {
					TC.send(`Also wenn du \`!set announcementMsg [text]\` verwendest kannst du in [text] folgende Platzhalter verwenden:
\`\`\`
PH_USERNAME     | Dieser Platzhalter wird durch den Namen des Streamer's ersetzt
PH_GAME_NAME    | Dieser Platzhalter zeigt den namen des Streams an
PH_GAME_DETAIL  | Dieser Platzhalter zeigt das Spiel an, welches gestreamt wird
PH_GAME_URL     | Dieser Platzhalter wird durch einen Link zum Stream ersetzt
\`\`\``);
				} else {

					TC.send(`Oh, du hast die Kommandos vergessen? Hier Bitte:
\`\`\`
Kommandos für Administratoren und berechtigte Personen:
${Array.from(this.availableBotCommands.values()).filter(v => !v.devOnly && v.restricted).map(v => v.help).join("\n")}
-------------------------------
Kommandos für alle anderen:
${Array.from(this.availableBotCommands.values()).filter(v => !v.devOnly && !v.restricted).map(v => v.help).join("\n")}\n`
						+ `?[was]`.padEnd(40, " ") + `| Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
\`\`\``);
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
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const file = resolve(process.cwd(), "infos", guildId, options.join(" ").toLowerCase() + ".json");
				try {
					unlinkSync(file);
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
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const [target, ...text] = options;
				if (["help", "wiki"].includes(target)) {
					msg.react("👎");
					return;
				}
				const file = resolve(process.cwd(), "infos", guildId, target.toLowerCase() + ".json");
				let data = null;
				try {
					const dataRaw = readFileSync(file);
					data = JSON.parse(dataRaw.toString());
					if (Array.isArray(data.data)) {
						data.data.push(text.join(" "));
					} else {
						data.data = [data.data, text.join(" ")];
					}
				} catch (error) {
					data = { data: text.join(" ") };
				}
				writeFileSync(file, JSON.stringify(data, null, 2));
				msg.react("👍");
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
					if (!GuildConfig.streamerList.includes(Member.id)) {
						GuildConfig.streamerList.push(Member.id);
					}
				});
				this.saveGuildSettings(guildId, msg);
			},
			help: `!addStreamer @name ...`.padEnd(40, " ") + "| Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!",
			helpId: "HELP_STREAMER_ADD"
		});

		this.availableBotCommands.set("!removeStreamer", {
			restricted: true,
			devOnly: false,
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				msg.mentions.members.array().forEach((Member) => {
					if (GuildConfig.streamerList.includes(Member.id)) {
						GuildConfig.streamerList.splice(GuildConfig.streamerList.indexOf(Member.id), 1);
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
				GuildConfig.allowAll = to;
				this.saveGuildSettings(guildId, msg);
			},
			help: `!setAllowAll [true|false]`.padEnd(40, " ") + "| Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]",
			helpId: "HELP_SET_ALLOW_ALL"
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
						GuildConfig.allowAll = args[0] == "true";
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
					default:
						msg.react("👎");
						break;
				}
			},
			help: `!set name [name]`.padEnd(40, " ") + `| Du kannst meinen Nicknamen ändern wenn du möchtest :)\n`
				+ `!set allowAll [true|false]`.padEnd(40, " ") + `| Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]\n`
				+ `!set streamerChannel`.padEnd(40, " ") + `| Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen\n`
				+ `!set announcementDelayHours [number]`.padEnd(40, " ") + `| Damit stellst du ein wie lange ich still bleiben soll nachdem ich einen Streamer angekündigt habe!\n`
				+ `!set announcementMsg [text]`.padEnd(40, " ") + `| Oh das ist komplex versuch mal ?help announcementMsg`,
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

		this.availableBotCommands.set("!template", {
			restricted: true,
			devOnly: true,
			method: (msg, options) => {
				const TC: TextChannel = msg.channel as TextChannel;
			},
			help: `!template`.padEnd(40, " ") + "| Ähm.. das ist kein echtes Kommando...",
			helpId: "HELP_TEMPLATE"
		});
	}

	/**
	 *
	 *
	 * @protected
	 * @returns {void}
	 * @memberof OmegaBot
	 */
	protected setupDiscordBot(): void {
		if (!OmegaBot.NodeConfig.enabled) {
			Logger(511, "OmegaBot:setupDiscordBot", `Discord not enabled.`);
			return;
		} else {
			this.DiscordBot = new Client();
			this.DiscordBot.on('ready', () => {
				Logger(111, "OmegaBot:setupDiscordBot", `Logged in as ${this.DiscordBot.user.tag}!`);

				this.DiscordBot.guilds.forEach((G, key) => {
					this.initGuild(G);
				});
			});

			this.DiscordBot.on("guildCreate", (guild) => {
				this.initGuild(guild);
				try {
					Logger(110, "DiscordBot.on->guildCreate", `Just joined new Guild ${guild.name} with ${guild.memberCount} members`);
					const publicCH = guild.channels.filter((GC) => GC.type == "text" && GC.permissionsFor(guild.me).has("SEND_MESSAGES"));
					(<TextChannel>guild.systemChannel || <TextChannel>publicCH.random()).send(`Hey cool, da bin ich! Tippe \`?help\` und ich sage dir was ich kann!`);
				} catch (error) {
					Logger(911, "DiscordBot.on->guildCreate", error);
				}
			});


			this.DiscordBot.on('message', async msg => {
				if (!msg.guild) return;
				// ignore bot messages
				if (msg.author.bot) {
					return;
				}
				// ignore all other messages
				if (!msg.content.startsWith('?') && !msg.content.startsWith('!')) {
					return;
				}

				const [command, ...options] = msg.content.split(" ");
				const guildId: string = msg.guild.id;
				const me = msg.guild.me;
				const TC: TextChannel = msg.channel as TextChannel;
				if (!this.availableBotCommands.has(command)) {
					if (!msg.content.startsWith('?')) {
						msg.react("👎");
						TC.send(`Also dieser Befehl ist mir unbekannt! Probier doch mal \`?help\` `);
					} else {
						const datadir = resolve(process.cwd(), "infos", guildId);
						const file = resolve(datadir, command.replace("?", "").toLowerCase() + ".json");
						try {
							const dataRaw = readFileSync(file);
							const data = JSON.parse(dataRaw.toString());
							if (Array.isArray(data.data)) {
								shuffle(data.data);
								TC.send(data.data[0]);
							} else {
								TC.send(data.data);
							}
						} catch (error) {
							TC.send(`Darüber (${command}) weiss ich überhaupt gar nichts!`);
						}
					}
					return;
				}
				const boco = this.availableBotCommands.get(command);

				const author = msg.author;
				const member = await msg.guild.fetchMember(author);
				const isDeveloper = member.id == "385696536949948428";
				const isAdmin = member.hasPermission("ADMINISTRATOR") || isDeveloper;
				const GuildConfig = this.guildConfigList.get(guildId);
				const { streamerChannelId, allowAll, streamerList, announcementDelayHours, announcerMessage, commandPermissions, streamerMessages } = GuildConfig;

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
				Logger(911, "OmegaBot:setupDiscordBot", e);
			});
			this.DiscordBot.login(OmegaBot.NodeConfig.token);
		}
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

		TC.fetchMessages({ before: startId, limit: 100 }).then(async (msgList) => {
			Logger(11, "OmegaBot.clearTextChannel", `Found ${msgList.size} messages in ${TC.guild.name}/${TC.name} to delete`);
			const idList = msgList.keyArray();
			const deleteQueue = [];
			for (let i = 0; i < idList.length; i++) {
				const msgId = idList[i];
				const msg = msgList.get(msgId);
				msg && !msg.pinned && msg.deletable && msg.id != m.id ? deleteQueue.push(msg.delete()) : null;
			}
			await Promise.all(deleteQueue).catch(e => Logger(911, "OmegaBot.clearTextChannel", e.message));
			const startChk = startMsg && startMsg.deletable && !startMsg.pinned && startMsg.id != m.id;
			startChk ? await startMsg.delete() : null; // will only trigger once since message is deleted in the first loop
			const total = d + idList.length + (startChk ? 1 : 0);
			const reactionNumbers = ["\u0030\u20E3", "\u0031\u20E3", "\u0032\u20E3", "\u0033\u20E3", "\u0034\u20E3", "\u0035\u20E3", "\u0036\u20E3", "\u0037\u20E3", "\u0038\u20E3", "\u0039\u20E3"];// ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
			if (idList.length > 99) { this.clearTextChannel(TC, m, total); } else {
				// we are done
				try {
					await m.react("🇩");
					await m.react("🇴");
					await m.react("🇳");
					await m.react("🇪");
					await m.react(encodeURIComponent("\u25B6"));
				} catch (e) {
					Logger(911, "OmegaBot.clearTextChannel", e.message);
				}

				const totalDigits = total.toString().split("").map((s) => Number(s));

				for (let i = 0; i < totalDigits.length; i++) {
					const digit = totalDigits[i];
					const emoji = encodeURIComponent(reactionNumbers[digit]);
					await m.react(emoji).catch(e => Logger(911, "OmegaBot.clearTextChannel", e.message, emoji, digit));
				}


			}
		});
	}
}