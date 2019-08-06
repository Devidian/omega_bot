'use strict';
import { Client, Game, Guild, Message, Permissions, TextChannel } from "discord.js";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, accessSync } from "fs";
import { resolve } from "path";
import { Logger } from "../lib/tools/Logger";
import { NodeConfig } from "../config";
import { GuildConfiguration } from "../models/GuildConfiguration";
import { WorkerProcess } from "./WorkerProcess";
import { shuffle } from "../lib/tools/shuffle";




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
			streamerList: []
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
			streamerList: []
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
					this.loadGuildSettings(G.id);
					const { botname } = this.guildConfigList.get(G.id);
					if (botname && G.me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) G.me.setNickname(botname);
					Logger(111, "OmegaBot:setupDiscordBot", `I'am member of ${G.name} with ${G.memberCount} members`);
					if (!this.streamerChecks.has(key)) {
						this.streamerChecks.set(key, setTimeout(() => {
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
							this.streamerChecks.get(key).refresh();
						}, 5000));
					}
				});
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
				const guildId: string = msg.guild.id;
				const me = msg.guild.me;
				const TC: TextChannel = msg.channel as TextChannel;

				const author = msg.author;
				const member = await msg.guild.fetchMember(author);
				const isDeveloper = member.id == "385696536949948428";
				const isAdmin = member.hasPermission("ADMINISTRATOR") || isDeveloper;
				const GuildConfig = this.guildConfigList.get(guildId)
				const { streamerChannelId, allowAll, streamerList, announcementDelayHours, announcerMessage } = GuildConfig;

				const [command, ...args] = msg.content.split(" ");

				if (command.startsWith('!')) {
					if (!isAdmin) {
						msg.react("👎");
						TC.send(`Du hast nicht die benötigten Rechte um \`${command}\` auszuführen, versuch es erst gar nicht! Probier doch mal \`?help\` `);
						return;
					}
					switch (command) {
						case "!remove": {
							const file = resolve(process.cwd(), "infos", guildId, args.join(" ").toLowerCase() + ".json");
							try {
								unlinkSync(file);
								msg.react("👍");
							} catch (error) {
								msg.react("👎");
							}
						} break;
						case "!add": {
							const [target, ...text] = args;
							if (target == "help") {
								msg.react("👎");
								return;
							}
							const file = resolve(process.cwd(), "infos", guildId, target.toLowerCase() + ".json");
							let data = null;
							try {
								const dataRaw = readFileSync(file);
								data = JSON.parse(dataRaw.toString());
								if (Array.isArray(data.data)) {
									data.data.push(text);
								} else {
									data.data = [data.data, text];
								}
							} catch (error) {
								data = { data: text };
							}
							writeFileSync(file, JSON.stringify(data, null, 2));
							msg.react("👍");
						} break;
						case "!addStreamer": {
							msg.mentions.members.array().forEach((Member) => {
								if (!GuildConfig.streamerList.includes(Member.id)) {
									GuildConfig.streamerList.push(Member.id);
								}
							});
							this.saveGuildSettings(guildId, msg);
						} break;
						case "!removeStreamer": {
							msg.mentions.members.array().forEach((Member) => {
								if (GuildConfig.streamerList.includes(Member.id)) {
									GuildConfig.streamerList.splice(GuildConfig.streamerList.indexOf(Member.id), 1);
								}
							});
							this.saveGuildSettings(guildId, msg);
						} break;
						case "!setStreamChannel": {
							GuildConfig.streamerChannelId = TC.id;
							this.saveGuildSettings(guildId, msg);
						} break;
						case "!setAllowAll": {
							const to = args[0] == "true";
							GuildConfig.allowAll = to;
							this.saveGuildSettings(guildId, msg);
						} break;
						case "!set": {
							const [prop, options] = args;
							switch (prop) {
								case "allowAll": {
									GuildConfig.allowAll = options == "true";
									this.saveGuildSettings(guildId, msg);
								} break;
								case "name": {
									GuildConfig.botname = options;
									if (me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) {
										me.setNickname(options);
										TC.send(`Okay, dann heiße ich nun *${options}* für dich!`);
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
									GuildConfig.announcementDelayHours = Number(options);
									this.saveGuildSettings(guildId, msg);
								} break;
								case "announcementMsg": {
									GuildConfig.announcerMessage = options;
									this.saveGuildSettings(guildId, msg);
								} break;
								default:
									msg.react("👎");
									break;
							}
						} break;
						case "": { } break;
						case "": { } break;
						case "": { } break;
						default:
							TC.send(`Oh das tut mir leid, aber das Kommando \`${command}\` sagt mir leider gar nichts. Probier doch mal \`?help\` `);
							break;
					}

				} else {// if(command.startsWith('?'))
					const [what, ...options] = msg.content.split(" ");
					switch (what) {
						case "?help":
							if (options.length) {
								switch (options[0]) {
									case "announcementMsg":
										TC.send(`Also wenn du \`!set announcementMsg [text]\` verwendest kannst du in [text] folgende Platzhalter verwenden:
\`\`\`
PH_USERNAME     | Dieser Platzhalter wird durch den Namen des Streamer's ersetzt
PH_GAME_NAME    | Dieser Platzhalter zeigt den namen des Streams an
PH_GAME_DETAIL  | Dieser Platzhalter zeigt das Spiel an, welches gestreamt wird
PH_GAME_URL     | Dieser Platzhalter wird durch einen Link zum Stream ersetzt
\`\`\`
										`);

										break;

									default:
										break;
								}
							} else {

								TC.send(`Oh, du hast die Kommandos vergessen? Hier Bitte:
\`\`\`
Kommandos für Administratoren:
!add [was?] [text]                   | Füge einen neuen text hinzu der per ?[was] wieder abgerufen werden kann, zum Beispiel Zitate oder Infos
!remove [was?]                       | Entferne alle Einträge zu [was] aus dem Speicher
!setStreamChannel                    | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
!setAllowAll [true|false]            | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
!addStreamer @name ...               | Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!
!removeStreamer @name ...            | Du kannst einen Streamer auch wieder entfernen, dann bleibe ich still
!set name [name]                     | Du kannst meinen Nicknamen ändern wenn du möchtest :)
!set allowAll [true|false]           | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
!set streamerChannel                 | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
!set announcementDelayHours [number] | Damit stellst du ein wie lange ich still bleiben soll nachdem ich einen Streamer angekündigt habe!
!set announcementMsg [text]			 | Oh das ist komplex versuch mal ?help announcementMsg
-------------------------------
Kommandos für alle anderen:
?help                                | Wenn du diese Hilfe hier mal wieder brauchst, sag einfach bescheid :)
?[was?]                              | Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
\`\`\``);
							} break;

						default: {

							const datadir = resolve(process.cwd(), "infos", guildId);
							const file = resolve(datadir, what.replace("?", "").toLowerCase() + ".json");
							try {
								const dataRaw = readFileSync(file);
								const data = JSON.parse(dataRaw.toString());
								if (Array.isArray(data.data)) {
									shuffle(data.data);
									TC.send(`Oha, zu ${what.replace("?", "")} fällt mir zum Beispiel das hier ein: \n${data.data[0]}`);
								} else {
									TC.send(`Zu ${what.replace("?", "")} kann ich dir nur so viel sagen: \n${data.data}`);
								}
							} catch (error) {
								TC.send(`Darüber (${what}) weiss ich überhaupt gar nichts!`);
							}
						} break;
					}
				}

			});
			this.DiscordBot.on("error", (e: Error) => {
				Logger(911, "OmegaBot:setupDiscordBot", e);
			});
			this.DiscordBot.login(OmegaBot.NodeConfig.token);
		}
	}

}