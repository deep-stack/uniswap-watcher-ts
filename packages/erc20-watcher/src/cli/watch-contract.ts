//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';

import { DEFAULT_CONFIG_PATH, JobQueue, initClients, getConfig } from '@cerc-io/util';
import { Config } from '@vulcanize/util';

import { Database } from '../database';
import { CONTRACT_KIND, Indexer } from '../indexer';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    address: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Address of the deployed contract'
    },
    checkpoint: {
      type: 'boolean',
      require: true,
      demandOption: true,
      describe: 'Turn checkpointing on'
    },
    startingBlock: {
      type: 'number',
      default: 1,
      describe: 'Starting block'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { database: dbConfig, jobQueue: jobQueueConfig } = config;
  const { ethClient, ethProvider } = await initClients(config);

  assert(dbConfig);

  const db = new Database(dbConfig);
  await db.init();

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);

  await indexer.watchContract(argv.address, CONTRACT_KIND, argv.checkpoint, argv.startingBlock);

  await db.close();
  await jobQueue.stop();
  process.exit();
})();
