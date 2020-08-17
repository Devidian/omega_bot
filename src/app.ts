'use strict';
import 'module-alias/register';
import { MongoDB, Logger, Loglevel } from './util';
import { isMaster, worker, fork as forkChild, setupMaster, Worker as clusterWorker } from 'cluster';
import { BehaviorSubject } from 'rxjs';
import { Server } from "ws";
import { ObjectId, ObjectID } from 'mongodb';


const [cwd, app, botId, ...appArguments] = process.argv;

let cliServer: Server = null;
let botNodes: clusterWorker[] = [];
let flagReboot: boolean = false;

/**
 * starting a bot
 *
 */
async function initWorker() {
    await MongoDB.config(); // Setup MongoDB

    // start node
    const { OmegaBot } = await import("./app/OmegaBot");
    const botObjectId = ObjectID.isValid(botId) ? new ObjectId(botId) : botId;
    const Application = new OmegaBot(botObjectId);

    process.on('message', (msg: any) => {
        switch (msg) {
            case 'shutdown':
            case 'reboot':
                Application.destroy().then(() => {
                    process.exit();
                });
                break;

            default:
                Logger(Loglevel.ERROR, __filename.split("/").pop(), `Invalid message ${msg}`);
                break;
        }
    });
}

/**
 * starting a new bot for each configuration
 *
 * @returns
 */
async function startNodes() {
    await MongoDB.config(); // Setup MongoDB

    const { botNodeCollection } = await import('@/app/models/bot-node-config/bot-node-config.collection');

    const nodeList = await botNodeCollection.getAll();
    Logger(Loglevel.INFO, 'app', `found ${nodeList.length} bot nodes`);

    if (nodeList.length < 1) return;

    return nodeList.map(node => {
        if (!node.enabled) return null;
        let W: clusterWorker = null;

        setupMaster({
            exec: app,
            args: [node._id + '']
        });
        W = forkChild();

        // W.on("exit", (c: number, s: string) => {
        //     if (this.nodeList.has(type)) {
        //         this.nodeList.get(type).get(nodeId).removeAllListeners();
        //         this.nodeList.get(type).delete(nodeId);
        //         this.flagWatchFile.set(type, false);
        //     }
        //     if (this.flagReboot) {
        //         Logger(120, 'app', '[Master]', `Worker[${W.id}/${type}]: exited (reboot)`);

        //         if (this.activeNodes < 1) {
        //             Logger(120, 'app', '[Master]', `All worker shut down, exit now for reboot`);
        //             this.cleanExit();
        //         }
        //     } else {
        //         Logger(Loglevel.WARNING, 'app', '[Master]', `Worker[${W.id}/${type}]: exited`);
        //         this.bootWorker(type);
        //     }
        // });

        W.on("close", (c: number, s: string) => {
            Logger(Loglevel.WARNING, 'app', '[Master]', `Worker[${W.id}/${node.name}]: closed`);
        }).on("disconnect", () => {
            Logger(Loglevel.WARNING, 'app', '[Master]', `Worker[${W.id}/${node.name}]: disconnected`);
        }).on("error", (e: Error) => {
            Logger(Loglevel.WARNING, 'app', '[Master]', `Worker[${W.id}/${node.name}]: error ${e.toString()}`);
        }).on("message", (msg: any) => {
            if (msg.type == "ABC") {
            } else {
                Logger(20, 'app', '[Master]', `Worker[${W.id}/${node.name}]: ${msg.type}`);
            }
        });
        return W;
    });
}

function setupCLIServer() {
    Logger(Loglevel.INFO, 'app', `Starting CLI WebSocket server on port ${process.env.APP_CLI_PORT}`);
    cliServer = new Server({ port: Number(process.env.APP_CLI_PORT) });


    // Command Line Interface
    cliServer.on('connection', (ws, req) => {
        Logger(Loglevel.INFO, 'app', `CLI connected from ${req.connection.remoteAddress}`);
        // ws.send(JSON.stringify({ event: 'hello', content: 'Welcome to Master cli' }));
        ws.on("message", (message: string) => {
            const [command, options] = JSON.parse(message);
            let done = new BehaviorSubject<boolean>(false);
            switch (command) {
                case "reboot":
                    flagReboot = true;
                    botNodes.forEach(CP => {
                        CP.send("reboot");
                    });
                    done.next(true);
                    break;
                default:
                    Logger(Loglevel.ERROR, 'app', 'CLI', `Unknown command ${command}`);
                    break;
            }
            done.subscribe({
                next: (val) => {
                    !val ? null : ws.send(JSON.stringify({ event: 'done' }));
                }
            });
        });
    });
}

if (isMaster) {
    Logger(Loglevel.INFO, 'app', `starting master process`);
    process.title = "Application Master"
    startNodes();
} else {
    process.title = `W${worker.id}`;
    initWorker();
}