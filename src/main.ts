'use strict';
import { Logger } from './lib/tools/Logger';
import { Master } from './classes/Master';
import { cfg } from './config';

Logger(100, __filename.split("/").pop(), `Starting master-process of ${cfg.app.title}`);
process.title = cfg.app.title;

let M = new Master();