//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import fs from 'fs';
import path from 'path';

import { DEFAULT_CONFIG_PATH, getConfig, initClients, JobQueue, StateKind } from '@cerc-io/util';
import { Config } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import * as codec from '@ipld/dag-cbor';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:export-state');

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    exportFile: {
      alias: 'o',
      type: 'string',
      describe: 'Export file path'
    },
    blockNumber: {
      type: 'number',
      describe: 'Block number to create snapshot at'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database, config.server);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);
  await indexer.init();

  const exportData: any = {
    snapshotBlock: {},
    contracts: [],
    stateCheckpoints: []
  };

  const contracts = await db.getContracts();
  let block = await indexer.getLatestStateIndexedBlock();
  assert(block);

  if (argv.blockNumber) {
    if (argv.blockNumber > block.blockNumber) {
      throw new Error(`Export snapshot block height ${argv.blockNumber} should be less than latest hooks processed block height ${block.blockNumber}`);
    }

    const blocksAtSnapshotHeight = await indexer.getBlocksAtHeight(argv.blockNumber, false);

    if (!blocksAtSnapshotHeight.length) {
      throw new Error(`No blocks at snapshot height ${argv.blockNumber}`);
    }

    block = blocksAtSnapshotHeight[0];
  }

  log(`Creating export snapshot at block height ${block.blockNumber}`);

  // Export snapshot block.
  exportData.snapshotBlock = {
    blockNumber: block.blockNumber,
    blockHash: block.blockHash
  };

  // Export contracts and checkpoints.
  for (const contract of contracts) {
    if (contract.startingBlock > block.blockNumber) {
      continue;
    }

    exportData.contracts.push({
      address: contract.address,
      kind: contract.kind,
      checkpoint: contract.checkpoint,
      startingBlock: block.blockNumber
    });

    // Create and export checkpoint if checkpointing is on for the contract.
    if (contract.checkpoint) {
      await indexer.createCheckpoint(contract.address, block.blockHash);

      const state = await indexer.getLatestState(contract.address, StateKind.Checkpoint, block.blockNumber);
      assert(state);

      const data = indexer.getStateData(state);

      exportData.stateCheckpoints.push({
        contractAddress: state.contractAddress,
        cid: state.cid,
        kind: state.kind,
        data
      });
    }
  }

  if (argv.exportFile) {
    const encodedExportData = codec.encode(exportData);

    const filePath = path.resolve(argv.exportFile);
    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    fs.writeFileSync(filePath, encodedExportData);
  } else {
    log(exportData);
  }
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});