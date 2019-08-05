import { WorkerProcess } from './classes/WorkerProcess';
import { BaseConfig, cfg, NodeConfig, ocfg, processNodeId, processType } from './config';
import { Logger } from './lib/tools/Logger';
import { OmegaBot } from './classes/OmegaBot';


const Config: NodeConfig = cfg.nodes[processType][processNodeId];
process.env.unit = processNodeId;

let Application: WorkerProcess = null;

switch (processType) {
	case 'omegabot':
		Application = OmegaBot.getInstance(Config);
		break;
	default:
		Logger(510, __filename.split("/").pop(), `Invalid module`);
		break;
}

ocfg.subscribe({
	next: (C: BaseConfig) => {
		Application.updateConfig(C.nodes[processType][processNodeId]);
	}
});

if (Application) {
	process.on('message', (msg: any) => {
		switch (msg) {
			case 'shutdown':
			case 'reboot':
				Application.destroy().then(() => {
					process.exit();
				});
				break;

			default:
				Logger(911, __filename.split("/").pop(), `Invalid message ${msg}`);
				break;
		}
	});
}