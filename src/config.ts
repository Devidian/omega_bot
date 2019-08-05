import { ConfigLoader } from "./lib/tools/ConfigLoader";
import { resolve } from "path";
import { BehaviorSubject } from "rxjs";
import { Config } from "./lib/models/Config";

export interface NodeConfig {
    enabled: boolean,		        // if false this node wont boot
    token: string,
    tick: number,
    [key: string]: any
}

export interface NodeList {
    [id: string]: NodeConfig
}

export interface BaseConfig extends Config {
    nodes?: { [key: string]: NodeList },
    cli?: {
        port: number,
        commands: string[]
    },
}

export const [cwd, app, configType, processType, processNodeId] = process.argv;

const C = ConfigLoader.getInstance<BaseConfig>(resolve(process.cwd(), "config"), configType || "config");
// console.log(C);

export var ocfg: BehaviorSubject<BaseConfig> = new BehaviorSubject<BaseConfig>(C.cfg);
C.on("update", (C: BaseConfig) => ocfg.next(C));

export var cfg: BaseConfig = C.cfg;

export var rootDir = resolve(__dirname, "..");