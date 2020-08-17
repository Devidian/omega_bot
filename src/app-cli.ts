import { ClientOptions } from "ws";
const WebSocket = require('ws');
import { Logger, Loglevel } from './util';

const [cwd, app, command] = process.argv;

Logger(Loglevel.INFO, "app-cli", 'Starting IO Client for sending command <%s> to Master', command);

var IOClient = new WebSocket(`ws://localhost:${Number(process.env.APP_CLI_PORT)}/`);

IOClient.on('disconnect', function () {
	Logger(Loglevel.INFO, "app-cli", 'Disconnected, bye!');
	IOClient.removeAllListeners();
	process.exit(0);
});

interface CLIMessage {
	event: string,
	[key: string]: any
}

IOClient.on('connect', function () {
	Logger(Loglevel.INFO, "app-cli", 'Successful connected to Master');
	IOClient.send(command);
	IOClient.on('message', function (msg: CLIMessage) {
		Logger(11, "app-cli", `Master: ${msg}`);
		switch (msg.event) {
			case 'hello':

				break;
			case 'done':
				Logger(Loglevel.INFO, "app-cli", 'Done! Closeing connection to Master.');
				IOClient.close();
				break;
			default:
				Logger(Loglevel.WARNING, "app-cli", `Unknown response ${msg.event}`);
				IOClient.close();
				break;
		}
		IOClient.close();
	});
});