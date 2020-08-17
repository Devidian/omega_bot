'use strict';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { accessSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Logger, Loglevel } from './util';

const rootDir = resolve(__dirname, "..");

// Set process title
process.title = "Application initialisation";

Logger(Loglevel.INFO, "INIT", 'Initializing application!');

const logPath = resolve("/var", "log");
const servicePath = resolve("/usr", "lib", "systemd", "system");
const rsyslogPath = resolve("/etc", "rsyslog.d");

const SERVICE_USER = process.env.SERVICE_USER;
const SERVICE_ID = process.env.SERVICE_ID;
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_DESC = process.env.SERVICE_DESC;
const SERVICE_ENV = JSON.parse(process.env.SERVICE_ENV);
const SERVICE_AFTER = JSON.parse(process.env.SERVICE_AFTER);

Logger(Loglevel.INFO, "INIT", 'Checking paths ...');
try {
    Logger(Loglevel.INFO, "INIT", '... log path');
    accessSync(logPath);
    Logger(Loglevel.INFO, "INIT", '... rsyslog path');
    accessSync(rsyslogPath);
    Logger(Loglevel.INFO, "INIT", '... systemd service path');
    mkdirSync(servicePath, { recursive: true }); // system directory may not be found on fresh installs, so we try to create
} catch (e) {
    Logger(Loglevel.ERROR, "INIT", "Can't initialize paths, make sure to execute init as root", e.code, e.path);
    process.exit(1);
}

Logger(Loglevel.INFO, "INIT", `Checking user <${SERVICE_USER}>...`);
try {
    let output = execSync(`adduser --shell /bin/bash --disabled-password ${SERVICE_USER}`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
    Logger(Loglevel.INFO, "INIT", ' ... created!');
} catch (e) {
    if (e.status != 1) {
        Logger(Loglevel.ERROR, "INIT", e);
        process.exit(1);
    } else {
        Logger(Loglevel.INFO, "INIT", '... already exists!');
    }
}


let serviceFile: string, rsyslogFile: string;
Logger(Loglevel.INFO, "INIT", 'Reading template files ...');
try {
    serviceFile = readFileSync(resolve(rootDir, "app.service"), { encoding: 'utf-8' });
    rsyslogFile = readFileSync(resolve(rootDir, "app.conf"), { encoding: 'utf-8' });
    Logger(Loglevel.INFO, "INIT", ' ... done!');
} catch (e) {
    Logger(Loglevel.ERROR, "INIT", "Can't read app.service and app.conf file", e.code);
    process.exit(1);
}

Logger(Loglevel.INFO, "INIT", 'Creating rsyslog filter file ...');
try {
    const data = rsyslogFile.replace(/PH_SERVICE_ID/g, SERVICE_ID).replace(/PH_LOG_PATH/g, resolve(logPath, SERVICE_NAME + ".log"));
    writeFileSync(resolve(rsyslogPath, SERVICE_NAME + ".conf"), data);
} catch (e) {
    Logger(Loglevel.ERROR, "INIT", "Can't save rsyslog file", e.code);
    process.exit(1);
}

Logger(Loglevel.INFO, "INIT", 'Creating service file ...');
try {
    const data = serviceFile
        .replace(/PH_SERVICE_ID/g, SERVICE_ID)
        .replace(/PH_SERVICE_DESC/g, SERVICE_DESC)
        .replace(/PH_SERVICE_USER/g, SERVICE_USER)
        .replace(/PH_SERVICE_ENV/g, SERVICE_ENV)
        .replace(/PH_SERVICE_AFTER/g, SERVICE_AFTER)
        .replace(/PH_WORKING_DIR/g, rootDir);
    writeFileSync(resolve(servicePath, SERVICE_NAME + ".service"), data);
} catch (e) {
    Logger(Loglevel.ERROR, "INIT", "Can't save service file", e.code);
    process.exit(1);
}

try {
    Logger(Loglevel.INFO, "INIT", 'Restarting rsyslog ...');
    let log = execSync("systemctl restart rsyslog.service", <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
    log += execSync(`systemctl daemon-reload`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
    log += execSync(`systemctl enable ${SERVICE_NAME}.service`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
    log += execSync(`systemctl start ${SERVICE_NAME}.service`, <ExecSyncOptionsWithStringEncoding>{ encoding: "utf-8" });
} catch (e) {
    Logger(Loglevel.ERROR, "INIT", "Can't restart service(s)", e);
    process.exit(1);
}

Logger(Loglevel.INFO, "INIT", `Done!`);
process.exit(0);