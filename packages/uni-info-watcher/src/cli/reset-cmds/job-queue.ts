//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { resetJobs, getConfig } from '@cerc-io/util';
import { Config } from '@vulcanize/util';

const log = debug('vulcanize:reset-job-queue');

export const command = 'job-queue';

export const desc = 'Reset job queue';

export const builder = {};

export const handler = async (argv: any): Promise<void> => {
  const config: Config = await getConfig(argv.configFile);
  await resetJobs(config);

  log('Job queue reset successfully');
};
