import { Client, TextChannel, Guild, GuildChannel, MessageOptions, Attachment, RichEmbed, WebhookMessageOptions, Permissions, Game, Message } from "discord.js";
import { cfg, LOGTAG } from "./config";
import * as jdenticon from "jdenticon";

import { WorkerProcess } from "./WorkerProcess";
import { resolve } from "path";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { shuffle } from "./shuffle";
import { stringify } from "querystring";

interface GuildConfiguration {
	allowAll: boolean,
	streamerList: string[],
	streamerChannelId: string,
	announcementDelayHours: number,
	announcerMessage: string,
	botname: string
}

export class OmegaBot extends WorkerProcess {
	protected DiscordBot: Client = null;
	protected timer: NodeJS.Timer = null;
	protected streamerChecks: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>();
	protected guildConfigList: Map<string, GuildConfiguration> = new Map<string, GuildConfiguration>();

	// protected streamerChannel: Map<string, string> = new Map<string, string>();
	// protected streamerAllowed: Map<string, string[]> = new Map<string, string[]>();
	// protected streamerAllowAll: Map<string, boolean> = new Map<string, boolean>();

	protected announcementCache: Map<string, Map<string, Game>> = new Map<string, Map<string, Game>>();
	protected announcementDateCache: Map<string, Map<string, Date>> = new Map<string, Map<string, Date>>();
	protected settingsLoaded: Map<string, boolean> = new Map<string, boolean>();

	constructor() {
		super();
		this.timer = setTimeout(_ => { this.run(); }, 200);
		this.run();
		this.setupDiscordBot();
	}

	protected run(): void {
		this.timer.refresh();
	}

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
			const file = resolve(__dirname, "..", "infos", guildId + ".json");
			try {
				writeFileSync(file, JSON.stringify(GuildConfig, null, 2));
				!msg ? null : msg.react("👍");
			} catch (error) {
				console.log(LOGTAG.ERROR, error);
				!msg ? null : msg.react("👎");
			}

		} catch (error) {
			console.log(LOGTAG.ERROR, error);
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
		try {
			const file = resolve(__dirname, "..", "infos", guildId + ".json");
			try {
				const dataRaw = readFileSync(file);
				GuildConfig = JSON.parse(dataRaw.toString());
				!cfg.log.info ? null : console.log(LOGTAG.INFO, "[OmegaBot:loadGuildSettings]", `Guild <${guildId}> settings found and loaded!`);
			} catch (error) {
				!cfg.log.info ? null : console.log(LOGTAG.INFO, "[OmegaBot:loadGuildSettings]", `Guild <${guildId}> not found set all to default`);
			} finally {
				this.settingsLoaded.set(guildId, true);
				this.guildConfigList.set(guildId, GuildConfig);
			}

		} catch (error) {
			console.log(LOGTAG.ERROR, error);
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
		if (!cfg.discord || !cfg.discord.enabled) {
			!cfg.log.info ? null : console.log(LOGTAG.INFO, "[OmegaBot:setupDiscordBot]", `Discord not enabled.`);
			return;
		} else {
			this.DiscordBot = new Client();
			this.DiscordBot.on('ready', () => {
				!cfg.log.info ? null : console.log(LOGTAG.INFO, "[OmegaBot:setupDiscordBot]", `Logged in as ${this.DiscordBot.user.tag}!`);

				this.DiscordBot.guilds.forEach((G, key) => {
					this.loadGuildSettings(G.id);
					const { botname } = this.guildConfigList.get(G.id);
					if (botname && G.me.hasPermission(Permissions.FLAGS.CHANGE_NICKNAME)) G.me.setNickname(botname);
					!cfg.log.info ? null : console.log(LOGTAG.INFO, "[OmegaBot:setupDiscordBot]", `I'am member of ${G.name} with ${G.memberCount} members`);
					if (!this.streamerChecks.has(key)) {
						this.streamerChecks.set(key, setTimeout(() => {
							const Guild: Guild = G;

							// if (!this.streamerChannel.has(G.id)) {
							// 	this.streamerChannel.set(G.id, null);
							// }
							const { streamerChannelId, allowAll, streamerList, announcementDelayHours, announcerMessage } = this.guildConfigList.get(G.id);

							if (!streamerChannelId) return;

							// if (!this.streamerAllowAll.has(G.id)) {
							// 	this.streamerAllowAll.set(G.id, false);
							// }
							// const allowAll = this.streamerAllowAll.get(G.id);

							// if (!this.streamerAllowed.has(G.id)) {
							// 	this.streamerAllowed.set(G.id, []);
							// }
							// const streamerList = this.streamerAllowed.get(G.id);

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
										!txtCh ? null : txtCh.send(`@everyone Aufgepasst ihr Seelen! \`${Member.displayName}\` streamt gerade! \n\`${Game.name}\` - \`${Game.details}\` \n Siehe hier:${Game.url}`);
										aDateCache.set(Member.id, new Date());
									} catch (error) {
										console.log(error);
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

				const [command, args] = msg.content.split(" ", 2);

				if (command.startsWith('!')) {
					if (!isAdmin) {
						msg.react("👎");
						TC.send(`Du hast nicht die benötigten Rechte um \`${command}\` auszuführen, versuch es erst gar nicht! Probier doch mal \`?help\` `);
						return;
					}
					switch (command) {
						case "!remove": {
							const file = resolve(__dirname, "..", "infos", guildId, args.toLowerCase() + ".json");
							try {
								unlinkSync(file);
								msg.react("👍");
							} catch (error) {
								msg.react("👎");
							}
						} break;
						case "!add": {
							const [target, text] = args.split(" ", 2);
							if (target == "help") {
								msg.react("👎");
								return;
							}
							const file = resolve(__dirname, "..", "infos", guildId, target.toLowerCase() + ".json");
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
							const to = args == "true";
							GuildConfig.allowAll = to;
							this.saveGuildSettings(guildId, msg);
						} break;
						case "set": {
							const [prop, options] = args.split(" ", 2);
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
					const what = msg.content.substr(1); // without ?
					switch (what) {
						case "help":
							TC.send(`Oh, du hast die Kommandos vergessen? Hier Bitte:\n
\`\`\`\n
Kommandos für Administratoren:
!add [was?] [text]          | Füge einen neuen text hinzu der per ?[was] wieder abgerufen werden kann, zum Beispiel Zitate oder Infos
!remove [was?]              | Entferne alle Einträge zu [was] aus dem Speicher
!setStreamChannel           | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
!setAllowAll [true|false]   | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
!addStreamer @name ...      | Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!
!removeStreamer @name ...   | Du kannst einen Streamer auch wieder entfernen, dann bleibe ich still
-------------------------------
Kommandos für alle anderen:
?help                       | Wenn du diese Hilfe hier mal wieder brauchst, sag einfach bescheid :)
?[was?]                     | Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
\n\`\`\``);
							break;

						default: {

							const datadir = resolve(__dirname, "..", "infos", guildId);
							try {
								mkdirSync(datadir);
							} catch (error) {
								console.log(LOGTAG.ERROR, error);
							}
							const file = resolve(datadir, what.toLowerCase() + ".json");
							try {
								const dataRaw = readFileSync(file);
								const data = JSON.parse(dataRaw.toString());
								if (Array.isArray(data.data)) {
									shuffle(data.data);
									TC.send(`Oha, zu ${what} fällt mir zum Beispiel das hier ein: \n${data.data[0]}`);
								} else {
									TC.send(`Zu ${what} kann ich dir nur so viel sagen: \n${data.data}`);
								}
							} catch (error) {
								TC.send("Darüber weiss ich überhaupt gar nichts!");
							}
						} break;
					}
				}

				// 				if (msg.content.startsWith("!remove")) {
				// 					if (isAdmin) {
				// 						const [command, target] = msg.content.split(" ");
				// 						const file = resolve(__dirname, "..", "infos", guildId, target.toLowerCase() + ".json");
				// 						try {
				// 							unlinkSync(file);
				// 							msg.react("👍");
				// 						} catch (error) {
				// 							msg.react("👎");
				// 						}
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}
				// 				} else if (msg.content.startsWith("!addStreamer")) {
				// 					if (isAdmin) {
				// 						const [command, streamer] = msg.content.split(" ");
				// 						// const streamerList = this.streamerAllowed.get(guildId) || [];
				// 						msg.mentions.members.array().forEach((Member) => {
				// 							if (!GuildConfig.streamerList.includes(Member.id)) {
				// 								GuildConfig.streamerList.push(Member.id);
				// 							}
				// 						});
				// 						// this.streamerAllowed.set(guildId, streamerList);
				// 						try {
				// 							this.saveGuildSettings(guildId);
				// 							msg.react("👍");
				// 						} catch (error) {
				// 							msg.react("👎");
				// 						}
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}
				// 				} else if (msg.content.startsWith("!add")) {
				// 					if (isAdmin) {
				// 						const [command, target, ...text] = msg.content.split(" ");
				// 						if (target == "help") {
				// 							msg.react("👎");
				// 							return;
				// 						}
				// 						const file = resolve(__dirname, "..", "infos", guildId, target.toLowerCase() + ".json");
				// 						let data = null;
				// 						try {
				// 							const dataRaw = readFileSync(file);
				// 							data = JSON.parse(dataRaw.toString());
				// 							if (Array.isArray(data.data)) {
				// 								data.data.push(text.join(' '));
				// 							} else {
				// 								data.data = [data.data, text.join(' ')];
				// 							}
				// 						} catch (error) {
				// 							data = { data: text.join(' ') };
				// 						}
				// 						writeFileSync(file, JSON.stringify(data, null, 2));
				// 						msg.react("👍");
				// 						return;
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}
				// 				} else if (msg.content.startsWith("!removeStreamer")) {
				// 					if (isAdmin) {
				// 						const [command, streamer] = msg.content.split(" ");
				// 						// const streamerList = this.streamerAllowed.get(guildId) || [];
				// 						msg.mentions.members.array().forEach((Member) => {
				// 							if (GuildConfig.streamerList.includes(Member.id)) {
				// 								GuildConfig.streamerList.splice(GuildConfig.streamerList.indexOf(Member.id), 1);
				// 							}
				// 						});
				// 						// this.streamerAllowed.set(guildId, streamerList);
				// 						try {
				// 							this.saveGuildSettings(guildId);
				// 							msg.react("👍");
				// 						} catch (error) {
				// 							msg.react("👎");
				// 						}
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}
				// 				} else if (msg.content.startsWith("!setStreamChannel")) {
				// 					if (isAdmin) {
				// 						GuildConfig.streamerChannelId = TC.id;
				// 						try {
				// 							this.saveGuildSettings(guildId);
				// 							msg.react("👍");
				// 						} catch (error) {
				// 							msg.react("👎");
				// 						}
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}

				// 				} else if (msg.content.startsWith("!setAllowAll")) {
				// 					if (isAdmin) {
				// 						const [command, value] = msg.content.split(" ");
				// 						const to = value == "true";
				// 						GuildConfig.allowAll = to;
				// 						try {
				// 							this.saveGuildSettings(guildId);
				// 							msg.react("👍");
				// 						} catch (error) {
				// 							msg.react("👎");
				// 						}
				// 					} else {
				// 						msg.react("👎");
				// 						return;
				// 					}
				// 				} else if (msg.content.startsWith('?help')) {
				// 					const [command, value] = msg.content.split(" ");
				// 					return TC.send(`Oh, du hast die Kommandos vergessen? Hier Bitte:\n
				// \`\`\`\n
				// Kommandos für Administratoren:
				// !add [was?] [text]          | Füge einen neuen text hinzu der per ?[was] wieder abgerufen werden kann, zum Beispiel Zitate oder Infos
				// !remove [was?]              | Entferne alle Einträge zu [was] aus dem Speicher
				// !setStreamChannel           | Der aktuelle Kanal wird zum Streamer Kanal, hier landen alle Ankündigungen
				// !setAllowAll [true|false]   | Erlaube das ich jeden Streamer angekündigt darf [true] oder nicht [false]
				// !addStreamer @name ...      | Füge ein oder mehrere Streamer hinzu die ich ankündigen darf!
				// !removeStreamer @name ...   | Du kannst einen Streamer auch wieder entfernen, dann bleibe ich still
				// -------------------------------
				// Kommandos für alle anderen:
				// ?help                       | Wenn du diese Hilfe hier mal wieder brauchst, sag einfach bescheid :)
				// ?[was?]                     | Ich werde dir zeigen was ich zu [was?] weiss, wenn ich nichts weiss, sag ichs dir auch ;)
				// \n\`\`\``);
				// 				} else if (msg.content.startsWith('?')) {
				// 					const name = msg.content.substr(1); // without ?
				// 					const datadir = resolve(__dirname, "..", "infos", guildId);
				// 					try {
				// 						mkdirSync(datadir);
				// 					} catch (error) {
				// 						console.log(LOGTAG.ERROR, error);
				// 					}
				// 					const file = resolve(datadir, name.toLowerCase() + ".json");
				// 					try {
				// 						const dataRaw = readFileSync(file);
				// 						const data = JSON.parse(dataRaw.toString());
				// 						if (Array.isArray(data.data)) {
				// 							shuffle(data.data);
				// 							TC.send(`Oha, zu ${name} fällt mir zum Beispiel das hier ein: \n${data.data[0]}`);
				// 						} else {
				// 							TC.send(`Zu ${name} kann ich dir nur so viel sagen: \n${data.data}`);
				// 						}
				// 					} catch (error) {
				// 						TC.send("Darüber weiss ich überhaupt gar nichts!");
				// 					}
				// 				}





				// // !cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[OmegaBot:omMessage]", `Message Guild: ${guildId} \n ${TC.guild.id}`);
				// const WebHookName = (cfg.discord.hookname + TC.name.toUpperCase()).substr(0, 32);
				// TC.fetchWebhooks().then((WHC) => {
				// 	const WH = WHC.filter((wh) => wh.name === WebHookName).first();
				// 	if (!WH) {
				// 		// !cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendBCMessageToDiscord]", `creating web-hook ${WebHookName}`);
				// 		return TC.createWebhook(WebHookName, jdenticon.toPng(process.hrtime().join("#"), 256));
				// 	} else {
				// 		// !cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendBCMessageToDiscord]", `web-hook ${WebHookName} found`);
				// 		return WH;
				// 	}
				// }).then(async (WH) => {
				// 	// const Avatar = jdenticon.toPng(Message.playerUID, 256);
				// 	// const b64Avatar = "data:image/png;base64," + encodeURIComponent(Avatar.toString('base64'));
				// 	// const AvatarURL = "https://api.adorable.io/avatars/128/" + Message.playerUID;
				// 	const WHO: WebhookMessageOptions = {
				// 		username: cfg.discord.botname,
				// 		// avatarURL: AvatarURL
				// 	};
				// 	// if (Message.attachment) {
				// 	// 	const buffer = Buffer.from(Message.attachment, "base64");
				// 	// 	WHO.file = new Attachment(buffer, "screenshot.jpg");
				// 	// }


				// }).catch(e => {
				// 	console.log(LOGTAG.ERROR, e);
				// });



			});
			this.DiscordBot.on("error", (e: Error) => {
				console.log(LOGTAG.ERROR, "[DiscordBot.onError]", e);
			});
			this.DiscordBot.login(cfg.discord.token);
		}
	}

}