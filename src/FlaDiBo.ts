import { Client, TextChannel, Guild, GuildChannel, MessageOptions, Attachment, RichEmbed, WebhookMessageOptions, Permissions } from "discord.js";
import { cfg, LOGTAG } from "./config";
import * as jdenticon from "jdenticon";

import { WorkerProcess } from "./WorkerProcess";
import { resolve } from "path";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { shuffle } from "./shuffle";

export class FlaDiBo extends WorkerProcess {
	protected DiscordBot: Client = null;
	protected timer: NodeJS.Timer = null;

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

	protected setupDiscordBot(): void {
		if (!cfg.discord || !cfg.discord.enabled) {
			!cfg.log.info ? null : console.log(LOGTAG.INFO, "[FlaDiBo:setupDiscordBot]", `Discord not enabled.`);
			return;
		} else {
			this.DiscordBot = new Client();
			this.DiscordBot.on('ready', () => {
				!cfg.log.info ? null : console.log(LOGTAG.INFO, "[FlaDiBo:setupDiscordBot]", `Logged in as ${this.DiscordBot.user.tag}!`);
			});
			this.DiscordBot.on('message', msg => {
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
				const TC: TextChannel = msg.channel as TextChannel;
				const WebHookName = (cfg.discord.hookname + TC.name.toUpperCase()).substr(0, 32);
				TC.fetchWebhooks().then((WHC) => {
					const WH = WHC.filter((wh) => wh.name === WebHookName).first();
					if (!WH) {
						// !cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendBCMessageToDiscord]", `creating web-hook ${WebHookName}`);
						return TC.createWebhook(WebHookName, jdenticon.toPng(process.hrtime().join("#"), 256));
					} else {
						// !cfg.log.debug ? null : console.log(LOGTAG.DEBUG, "[sendBCMessageToDiscord]", `web-hook ${WebHookName} found`);
						return WH;
					}
				}).then(async (WH) => {
					// const Avatar = jdenticon.toPng(Message.playerUID, 256);
					// const b64Avatar = "data:image/png;base64," + encodeURIComponent(Avatar.toString('base64'));
					// const AvatarURL = "https://api.adorable.io/avatars/128/" + Message.playerUID;
					const WHO: WebhookMessageOptions = {
						username: cfg.discord.botname,
						// avatarURL: AvatarURL
					};
					// if (Message.attachment) {
					// 	const buffer = Buffer.from(Message.attachment, "base64");
					// 	WHO.file = new Attachment(buffer, "screenshot.jpg");
					// }
					if (msg.content.startsWith("!remove")) {
						const author = msg.author;
						const member = await msg.guild.fetchMember(author);
						if (member.hasPermission("ADMINISTRATOR")) {
							const [command, target] = msg.content.split(" ");
							const file = resolve(__dirname, "..", "infos", target.toLowerCase() + ".json");
							try {
								unlinkSync(file);
								msg.react("👍");
							} catch (error) {
								msg.react("👎");
							}
						} else {
							msg.react("👎");
							return;
						}
					} else if (msg.content.startsWith("!add")) {
						const author = msg.author;
						const member = await msg.guild.fetchMember(author);
						if (member.hasPermission("ADMINISTRATOR")) {
							const [command, target, ...text] = msg.content.split(" ");
							const file = resolve(__dirname, "..", "infos", target.toLowerCase() + ".json");
							let data = null;
							try {
								const dataRaw = readFileSync(file);
								data = JSON.parse(dataRaw.toString());
								if (Array.isArray(data.data)) {
									data.data.push(text.join(' '));
								} else {
									data.data = [data.data, text.join(' ')];
								}
							} catch (error) {
								data = { data: text.join(' ') };
							}
							writeFileSync(file, JSON.stringify(data, null, 2));
							msg.react("👍");
							return;
						} else {
							msg.react("👎");
							return;
						}
					} else if (msg.content.startsWith('?')) {
						const name = msg.content.substr(1); // without ?
						const datadir = resolve(__dirname, "..", "infos", guildId);
						try {
							mkdirSync(datadir);
						} catch (error) {
							console.log(LOGTAG.ERROR, error);
						}
						const file = resolve(datadir, name.toLowerCase() + ".json");
						try {
							const dataRaw = readFileSync(file);
							const data = JSON.parse(dataRaw.toString());
							if (Array.isArray(data.data)) {
								shuffle(data.data);
								return WH.sendMessage(`Oha, zu ${name} fällt mir zum Beispiel das hier ein: \n${data.data[0]}`, WHO);
							} else {
								return WH.sendMessage(`Zu ${name} kann ich dir nur so viel sagen: \n${data.data}`, WHO);
							}
						} catch (error) {
							return WH.sendMessage("Darüber weiss ich überhaupt gar nichts!", WHO);
						}
					}
				}).catch(e => {
					console.log(LOGTAG.ERROR, e);
				});



			});
			this.DiscordBot.on("error", (e: Error) => {
				console.log(LOGTAG.ERROR, "[DiscordBot.onError]", e);
			});
			this.DiscordBot.login(cfg.discord.token);
		}
	}

}