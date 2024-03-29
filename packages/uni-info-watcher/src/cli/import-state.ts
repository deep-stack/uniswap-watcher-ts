//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { ImportStateCmd } from '@cerc-io/cli';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Config } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { State } from '../entity/State';

const log = debug('vulcanize:import-state');

export const main = async (): Promise<any> => {
  const importStateCmd = new ImportStateCmd();

  const config: Config = await importStateCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await importStateCmd.init(Database, { uniClient, erc20Client });
  await importStateCmd.initIndexer(Indexer);

  await importStateCmd.exec(State);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
