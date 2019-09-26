'use strict';
import { Attachment, Client, Game, Guild, Message, Permissions, TextChannel, GuildMember } from "discord.js";
import { accessSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { EOL } from "os";
import { resolve } from "path";
import { NodeConfig, processNodeId, rootDir } from "../config";
import { Logger } from "../lib/tools/Logger";
import { shuffle } from "../lib/tools/shuffle";
import { GuildConfiguration } from "../models/GuildConfiguration";
import { WorkerProcess } from "./WorkerProcess";

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
			welcomeMessage: null,
			botname: "OmegaBot",
			streamerChannelId: null,
			streamerList: [],
			streamerMessages: {},
			selfPromotionRoles: [],
			commandPermissions: {}
		};

		try {
			const file = resolve(rootDir, "infos", guildId + ".json");
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
			welcomeMessage: null,
			botname: "OmegaBot",
			streamerChannelId: null,
			streamerList: [],
			streamerMessages: {},
			selfPromotionRoles: [],
			commandPermissions: {}
		};
		const dataPath = resolve(rootDir, "infos", guildId);
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
			const file = resolve(rootDir, "infos", guildId + ".json");
			try {
				const dataRaw = readFileSync(file, { encoding: "utf-8" });
				GuildConfig = Object.assign({}, GuildConfig, JSON.parse(dataRaw));
				Logger(110, "OmegaBot:loadGuildSettings", `Guild <${guildId}> settings found and loaded!`);
			} catch (error) {
				Logger(510, "OmegaBot:loadGuildSettings", `Guild <${guildId}> not found set all to default`);
			} finally {
				this.settingsLoaded.set(guildId, true);
				this.guildConfigList.set(guildId, GuildConfig);
				this.saveGuildSettings(guildId);
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

		G.client.on("guildMemberAdd", (M: GuildMember) => {
			const { welcomeMessage } = this.guildConfigList.get(G.id);
			const msg = welcomeMessage || "Herzlich willkommen <@!PH_MEMBER_ID>";
			(G.systemChannel as TextChannel).send(msg.replace("PH_MEMBER_NAME", M.displayName).replace("PH_MEMBER_ID", M.id));
		});

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
							let msg = (!announcerMessage ? `Achtung! PH_USERNAME ist jetzt Live mit <PH_GAME_NAME / PH_GAME_DETAIL> Siehe hier: PH_GAME_URL` : announcerMessage).replace("PH_USERNAME", Member.displayName).replace("PH_GAME_NAME", Game.name).replace("PH_GAME_DETAIL", Game.details).replace("PH_GAME_URL", Game.url);
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

		this.availableBotCommands.set("?info", {
			restricted: false,
			method: (msg, [type, ...other]) => {
				const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const GuildConfig = this.guildConfigList.get(guildId);
				const streamChannel = msg.guild.channels.get(GuildConfig.streamerChannelId);
				if (type.toLowerCase() == "streamer") {
					const response = `Aktuell ist folgendes für Streamer eingestellt:
\`\`\`ini
Kanal    = ${GuildConfig.streamerChannelId} (${streamChannel ? streamChannel.name : "nicht gesetzt!"})
Alle     = ${GuildConfig.allowAll ? "ja" : "nein"}
Streamer = ${GuildConfig.streamerList.map(v => v + ` ( ${msg.guild.members.get(v).displayName} )`)}
Delay    = ${GuildConfig.announcementDelayHours} Stunden
Meldung  = ${GuildConfig.announcerMessage || "standard (nichts angegeben)"}
\`\`\`
`;
					let attachment: Attachment = response.length > 1900 ? new Attachment(response, "info.md") : null;
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
					const response = `Oh, du hast die Kommandos vergessen? Hier Bitte:
\`\`\`
Kommandos für Administratoren und berechtigte Personen:
${Array.from(this.availableBotCommands.values()).filter(v => !v.devOnly && v.restricted).map(v => v.help).join("\n")}
-------------------------------
Kommandos für alle anderen:
${Array.from(this.availableBotCommands.values()).filter(v => !v.devOnly && !v.restricted).map(v => v.help).join("\n")}\n`
						+ `?[was]`.padEnd(40, " ") + `| Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
\`\`\``;
					const responseList: string[] = [];
					let index = 0;
					if (response.length > 1900) {
						let tmp = response.split(EOL);
						Logger(0, "?help", `response length ${response.length} splitting response into ${tmp.length} pieces for rejoining`);
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
			method: (msg, options) => {
				// const TC: TextChannel = msg.channel as TextChannel;
				const guildId: string = msg.guild.id;
				const file = resolve(rootDir, "infos", guildId, options.join(" ").toLowerCase() + ".json");
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
				if (["help", "wiki", "info"].includes(target)) {
					msg.react("👎");
					return;
				}
				const file = resolve(rootDir, "infos", guildId, target.toLowerCase() + ".json");
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
					case "welcomeMsg": {
						GuildConfig.welcomeMessage = args.join(" ");
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
				+ `!set announcementMsg [text]`.padEnd(40, " ") + `| Oh das ist komplex versuch mal ?help announcementMsg\n`
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
					let message = `Ok hier der angeforderte Datenexport für dich <@!${Author.id}>`;
					let attachment: Attachment = null;
					const file = resolve(rootDir, "infos", msg.guild.id + ".json");
					try {
						const rawFileContent = readFileSync(file);
						attachment = new Attachment(rawFileContent, msg.guild.id + ".json");
					} catch (error) {
						message = `Huch, da lief was falsch, sorry! Bitte dem Entwickler melden: \n\`${error}\``;
					}
					TC.send(message, attachment);
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
				const roleNames: string[] = msg.guild.roles.filter((R) => GuildConfig.selfPromotionRoles.includes(R.id)).map((R) => "`" + R.name + "`");
				roleNames.length < 1 ? null : TC.send(`Hey <@!${Author.id}>! Folgende Rollen kann ich vergeben/nehmen: ${roleNames.join(', ')}`);
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
				const BotRolePosition = TC.guild.me.highestRole.calculatedPosition;
				const roleNames: string[] = [];
				// const roleNamesWarn: string[] = [];
				const Author = msg.author;
				msg.mentions.roles.array().forEach((Role) => {
					if (Role.managed) {
						TC.send(`ACHTUNG! Die Rolle \`${Role.name}\` wird von einem anderen Service verwaltet, die kann ich nicht vergeben`);
						return;
					}
					if (Role.calculatedPosition >= BotRolePosition) {
						// roleNamesWarn.push(Role.name);
						TC.send(`UPS! Die Rolle \`${Role.name}\` ist über meinem Niveau, ich kann Sie nicht vergeben, sorry!`);
						return;
					}
					if (!GuildConfig.selfPromotionRoles.includes(Role.id)) {
						GuildConfig.selfPromotionRoles.push(Role.id);
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
					if (GuildConfig.selfPromotionRoles.includes(Role.id)) {
						GuildConfig.selfPromotionRoles.splice(GuildConfig.selfPromotionRoles.indexOf(Role.id), 1);
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
				const BotRolePosition = TC.guild.me.highestRole.calculatedPosition;

				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check) {
					TC.send(`ACHTUNG! Ich habe nicht die nötigen Rechte um Rollen zu verwalten!`);
					return;
				}

				const Role = msg.mentions.roles.array()[0];
				if (GuildConfig.selfPromotionRoles.includes(Role.id) && Role.position < BotRolePosition) {
					msg.guild.member(Author).addRole(Role);
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
				const BotRolePosition = TC.guild.me.highestRole.calculatedPosition;

				const check = TC.permissionsFor(TC.guild.me).has("MANAGE_ROLES");
				if (!check) {
					TC.send(`ACHTUNG! Ich habe nicht die nötigen Rechte um Rollen zu verwalten!`);
					return;
				}

				const Role = msg.mentions.roles.array()[0];
				if (GuildConfig.selfPromotionRoles.includes(Role.id) && Role.position < BotRolePosition) {
					msg.guild.member(Author).removeRole(Role);
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
						const datadir = resolve(rootDir, "infos", guildId);
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
				const isDeveloper = OmegaBot.NodeConfig.developerAccess && OmegaBot.NodeConfig.developerAccess.includes(member.id);
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
		const Author = m.author;

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

				m.channel.send(`Okay <@!${m.author.id}>, ich habe \`${total}\` Nachrichten aus dem Kanal \`${TC.name}\` entfernt!`);
				// try {
				// 	await m.react("🇩");
				// 	await m.react("🇴");
				// 	await m.react("🇳");
				// 	await m.react("🇪");
				// 	await m.react(encodeURIComponent("\u25B6"));
				// } catch (e) {
				// 	Logger(911, "OmegaBot.clearTextChannel", e.message);
				// }

				// const totalDigits = total.toString().split("").map((s) => Number(s));

				// for (let i = 0; i < totalDigits.length; i++) {
				// 	const digit = totalDigits[i];
				// 	const emoji = encodeURIComponent(reactionNumbers[digit]);
				// 	await m.react(emoji).catch(e => Logger(911, "OmegaBot.clearTextChannel", e.message, emoji, digit));
				// }
			}
		});
	}
}