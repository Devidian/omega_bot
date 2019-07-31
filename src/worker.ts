import { WorkerProcess } from './WorkerProcess';
import { cfg, LOGTAG } from './config';
import { FlaDiBo } from "./FlaDiBo";


const processType = process.argv.pop();
let Application: WorkerProcess = null;

switch (processType) {
	case 'fladibo':
		Application = new FlaDiBo();
		break;
	default:
		!cfg.log.warn ? null : console.log(LOGTAG.WARN, "[worker]", 'Invalid module');
		break;
}

if (Application) {
	process.on('message', (msg: any) => {
		switch (msg) {
			case 'reboot':
				Application.destroy().then(() => {
					process.exit();
				});
				break;

			default:
				console.log(LOGTAG.ERROR, "[worker]", `Invalid message ${msg}`);
				break;
		}
	});
}