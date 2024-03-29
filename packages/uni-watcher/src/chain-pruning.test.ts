//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import { AssertionError } from 'assert';
import 'mocha';
import _ from 'lodash';

import { JOB_KIND_PRUNE, JobQueue, getCustomProvider, getConfig } from '@cerc-io/util';
import { Config, JobRunner } from '@vulcanize/util';
import { getCache } from '@cerc-io/cache';
import { insertNDummyBlocks, removeEntities } from '@vulcanize/util/test';
import { EthClient } from '@cerc-io/ipld-eth-client';

import { Indexer } from './indexer';
import { Database } from './database';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';

const CONFIG_FILE = './environments/test.toml';

describe('chain pruning', () => {
  let db: Database;
  let indexer: Indexer;
  let jobRunner: JobRunner;

  before(async () => {
    // Get config.
    const config: Config = await getConfig(CONFIG_FILE);

    const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

    assert(dbConfig, 'Missing database config');

    // Initialize database.
    db = new Database(dbConfig);
    await db.init();

    // Check if database is empty.
    const isBlockProgressEmpty = await db.isEntityEmpty(BlockProgress);
    const isSyncStatusEmpty = await db.isEntityEmpty(SyncStatus);
    const isDbEmptyBeforeTest = isBlockProgressEmpty && isSyncStatusEmpty;

    assert(isDbEmptyBeforeTest, 'Abort: Database not empty.');

    // Create an Indexer object.
    assert(upstream, 'Missing upstream config');
    const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');

    const cache = await getCache(cacheConfig);
    const ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      cache
    });

    const ethProvider = getCustomProvider(rpcProviderEndpoint);

    const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
    assert(dbConnectionString, 'Missing job queue db connection string');

    const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

    indexer = new Indexer(config.server, db, { ethClient }, ethProvider, jobQueue);
    assert(indexer, 'Could not create indexer object.');

    jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
  });

  afterEach(async () => {
    await removeEntities(db, BlockProgress);
    await removeEntities(db, SyncStatus);
  });

  after(async () => {
    await db.close();
  });

  //
  //                                     +---+
  //                           head----->| 20|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 19|
  //                                     +---+
  //                                       |
  //                                       |
  //                                    12 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 6 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 5 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 4 |        ------> Block Height to be pruned
  //                                     +---+
  //                                       |
  //                                       |
  //                                   2 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should prune a block in chain without branches', async () => {
    // Create BlockProgress test data.
    await insertNDummyBlocks(db, 20);
    const pruneBlockHeight = 4;

    // Should return only one block as there are no branches.
    const blocks = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocks).to.have.lengthOf(1);

    const job = { data: { kind: JOB_KIND_PRUNE, pruneBlockHeight } };
    await jobRunner.processBlock(job);

    // Only one canonical (not pruned) block should exist at the pruned height.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksAfterPruning).to.have.lengthOf(1);
  });

  //
  //                                  +---+
  //                                  | 20|
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 19|
  //                                  +---+
  //                                    |
  //                                    |
  //                                13 Blocks
  //                                    |
  //                                    |
  //                                  +---+         +---+
  //                                  | 5 |         | 5 |
  //                                  +---+         +---+
  //                                    |          /
  //                                    |         /
  //                    +---+         +---+  +----
  //                    | 4 |         | 4 |  | 4 |          ----> Block Height to be pruned
  //                    +---+         +---+  +---+
  //                         \          |   /
  //                          \         |  /
  //                          +---+   +---+
  //                          | 3 |   | 3 |
  //                          +---+   +---+
  //                                \   |
  //                                 \  |
  //                                  +---+
  //                                  | 2 |
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 1 |
  //                                  +---+
  //
  it('should prune block at height with branches', async () => {
    // Create BlockProgress test data.
    const firstSeg = await insertNDummyBlocks(db, 2);
    const secondSeg = await insertNDummyBlocks(db, 2, _.last(firstSeg));
    expect(_.last(secondSeg).number).to.equal(4);
    const thirdSeg = await insertNDummyBlocks(db, 1, _.last(firstSeg));
    const fourthSeg = await insertNDummyBlocks(db, 2, _.last(thirdSeg));
    expect(_.last(fourthSeg).number).to.equal(5);
    const fifthSeg = await insertNDummyBlocks(db, 17, _.last(thirdSeg));
    expect(_.last(fifthSeg).number).to.equal(20);

    const expectedCanonicalBlock = fifthSeg[0];
    const expectedPrunedBlocks = [secondSeg[1], fourthSeg[0]];

    const pruneBlockHeight = 4;

    // Should return multiple blocks that are not pruned.
    const blocksBeforePruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksBeforePruning).to.have.lengthOf(3);

    const job = { data: { kind: JOB_KIND_PRUNE, pruneBlockHeight } };
    await jobRunner.processBlock(job);

    // Only one canonical (not pruned) block should exist at the pruned height.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksAfterPruning).to.have.lengthOf(1);

    // Assert that correct block is canonical.
    expect(blocksAfterPruning[0].blockHash).to.equal(expectedCanonicalBlock.hash);

    // Assert that correct blocks are pruned.
    const prunedBlocks = await indexer.getBlocksAtHeight(pruneBlockHeight, true);
    expect(prunedBlocks).to.have.lengthOf(2);
    const prunedBlockHashes = prunedBlocks.map(({ blockHash }) => blockHash);
    const expectedPrunedBlockHashes = expectedPrunedBlocks.map(({ hash }) => hash);
    expect(prunedBlockHashes).to.have.members(expectedPrunedBlockHashes);
  });

  //
  //                                  +---+         +---+
  //                                  | 20|         | 20|
  //                                  +---+         +---+
  //                                    |          /
  //                                    |         /
  //                                  +---+  +----
  //                                  | 19|  | 19|
  //                                  +---+  +---+
  //                                    |   /
  //                                    |  /
  //                                  +----
  //                                  | 18|
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 17|
  //                                  +---+
  //                                    |
  //                                    |
  //                                11 Blocks
  //                                    |
  //                                    |
  //                                  +---+         +---+
  //                                  | 5 |         | 5 |
  //                                  +---+         +---+
  //                                    |          /
  //                                    |         /
  //                                  +---+  +----
  //                                  | 4 |  | 4 |          ----> Block Height to be pruned
  //                                  +---+  +---+
  //                                    |   /
  //                                    |  /
  //                                  +----
  //                                  | 3 |
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 2 |
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 1 |
  //                                  +---+
  //
  it('should prune block with multiple branches at chain head', async () => {
    // Create BlockProgress test data.
    const firstSeg = await insertNDummyBlocks(db, 3);
    const secondSeg = await insertNDummyBlocks(db, 2, _.last(firstSeg));
    expect(_.last(secondSeg).number).to.equal(5);
    const thirdSeg = await insertNDummyBlocks(db, 15, _.last(firstSeg));
    const fourthSeg = await insertNDummyBlocks(db, 2, _.last(thirdSeg));
    expect(_.last(fourthSeg).number).to.equal(20);
    const fifthSeg = await insertNDummyBlocks(db, 2, _.last(thirdSeg));
    expect(_.last(fifthSeg).number).to.equal(20);

    const expectedCanonicalBlock = thirdSeg[0];
    const expectedPrunedBlock = secondSeg[0];

    const pruneBlockHeight = 4;

    // Should return multiple blocks that are not pruned.
    const blocksBeforePruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksBeforePruning).to.have.lengthOf(2);

    const job = { data: { kind: JOB_KIND_PRUNE, pruneBlockHeight } };
    await jobRunner.processBlock(job);

    // Only one canonical (not pruned) block should exist at the pruned height.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksAfterPruning).to.have.lengthOf(1);
    expect(blocksAfterPruning[0].blockHash).to.equal(expectedCanonicalBlock.hash);

    // Assert that correct blocks are pruned.
    const prunedBlocks = await indexer.getBlocksAtHeight(pruneBlockHeight, true);
    expect(prunedBlocks).to.have.lengthOf(1);
    expect(prunedBlocks[0].blockHash).to.equal(expectedPrunedBlock.hash);
  });

  //
  //                                  +---+
  //                                  | 21|                 ----> Latest Indexed
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 20|
  //                                  +---+
  //                                    |
  //                                    |
  //                                15 Blocks
  //                                    |
  //                                    |
  //                    +---+         +---+
  //                    | 4 |         | 4 |
  //                    +---+         +---+
  //                         \          |
  //                          \         |
  //                          +---+   +---+
  //                          | 3 |   | 3 |                 ----> Block Height to be pruned
  //                          +---+   +---+
  //                                \   |
  //                                 \  |
  //                                  +---+
  //                                  | 2 |
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 1 |
  //                                  +---+
  //
  it('should prune block at depth greater than max reorg depth from latest indexed block', async () => {
    // Create BlockProgress test data.
    const firstSeg = await insertNDummyBlocks(db, 2);
    const secondSeg = await insertNDummyBlocks(db, 2, _.last(firstSeg));
    expect(_.last(secondSeg).number).to.equal(4);
    const thirdSeg = await insertNDummyBlocks(db, 19, _.last(firstSeg));
    expect(_.last(thirdSeg).number).to.equal(21);

    const expectedCanonicalBlock = thirdSeg[0];
    const expectedPrunedBlock = secondSeg[0];

    const pruneBlockHeight = 3;

    // Should return multiple blocks that are not pruned.
    const blocksBeforePruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksBeforePruning).to.have.lengthOf(2);

    const job = { data: { kind: JOB_KIND_PRUNE, pruneBlockHeight } };
    await jobRunner.processBlock(job);

    // Only one canonical (not pruned) block should exist at the pruned height.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksAfterPruning).to.have.lengthOf(1);
    expect(blocksAfterPruning[0].blockHash).to.equal(expectedCanonicalBlock.hash);

    // Assert that correct blocks are pruned.
    const prunedBlocks = await indexer.getBlocksAtHeight(pruneBlockHeight, true);
    expect(prunedBlocks).to.have.lengthOf(1);
    expect(prunedBlocks[0].blockHash).to.equal(expectedPrunedBlock.hash);
  });

  //
  //                                  +---+
  //                                  | 20|
  //                                  +---+
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 19|
  //                                  +---+
  //                                    |
  //                                    |
  //                                 8 Blocks
  //                                    |
  //                                    |
  //                                  +---+         +---+
  //                                  | 10|         | 10|
  //                                  +---+         +---+
  //                                    |          /
  //                                    |         /
  //                                  +---+  +----
  //                                  | 9 |  | 9 |          ----> Block Height to be pruned
  //                                  +---+  +---+
  //                                    |   /
  //                                    |  /
  //                                  +---+
  //                                  | 8 |
  //                                  +---+
  //                                    |
  //                                    |
  //                                 6 Blocks
  //                                    |
  //                                    |
  //                                  +---+
  //                                  | 1 |
  //                                  +---+
  //
  it('should avoid pruning block in frothy region', async () => {
    // Create BlockProgress test data.
    const firstSeg = await insertNDummyBlocks(db, 8);
    const secondSeg = await insertNDummyBlocks(db, 2, _.last(firstSeg));
    expect(_.last(secondSeg).number).to.equal(10);
    const thirdSeg = await insertNDummyBlocks(db, 12, _.last(firstSeg));
    expect(_.last(thirdSeg).number).to.equal(20);
    const pruneBlockHeight = 9;

    // Should return multiple blocks that are not pruned.
    const blocksBeforePruning = await indexer.getBlocksAtHeight(pruneBlockHeight, false);
    expect(blocksBeforePruning).to.have.lengthOf(2);

    try {
      const job = { data: { kind: JOB_KIND_PRUNE, pruneBlockHeight } };
      await jobRunner.processBlock(job);
      expect.fail('Job Runner should throw error for pruning at frothy region');
    } catch (error) {
      expect(error).to.be.instanceof(AssertionError);
    }

    // No blocks should be pruned at frothy region.
    const blocksAfterPruning = await indexer.getBlocksAtHeight(pruneBlockHeight, true);
    expect(blocksAfterPruning).to.have.lengthOf(0);
  });
});
