//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { wait } from '.';

import { JobQueueConfig } from './config';
import { MAX_REORG_DEPTH, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING } from './constants';
import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface } from './types';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._jobQueueConfig = jobQueueConfig;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { blockHash, blockNumber, parentHash, priority, timestamp } } = job;

    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Init sync status record if none exists.
    let syncStatus = await this._indexer.getSyncStatus();
    if (!syncStatus) {
      syncStatus = await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);
    }

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    if (blockHash !== syncStatus.latestCanonicalBlockHash) {
      const parent = await this._indexer.getBlockProgress(parentHash);
      if (!parent) {
        const { number: parentBlockNumber, parent: { hash: grandparentHash }, timestamp: parentTimestamp } = await this._indexer.getBlock(parentHash);

        // Create a higher priority job to index parent block and then abort.
        // We don't have to worry about aborting as this job will get retried later.
        const newPriority = (priority || 0) + 1;
        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          blockHash: parentHash,
          blockNumber: parentBlockNumber,
          parentHash: grandparentHash,
          timestamp: parentTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (parentHash !== syncStatus.latestCanonicalBlockHash && !parent.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parent.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        throw new Error(message);
      }
    }

    // Check if block is being already processed.
    const blockProgress = await this._indexer.getBlockProgress(blockHash);

    if (!blockProgress) {
      const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;

      // Delay required to process block.
      await wait(jobDelayInMilliSecs);
      const events = await this._indexer.getOrFetchBlockEvents({ blockHash, blockNumber, parentHash, blockTimestamp: timestamp });

      for (let ei = 0; ei < events.length; ei++) {
        await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { id: events[ei].id, publish: true });
      }
    }
  }

  async processEvent (job: any): Promise<EventInterface> {
    const { data: { id } } = job;

    log(`Processing event ${id}`);

    const dbEvent = await this._indexer.getEvent(id);
    assert(dbEvent);

    const event = dbEvent;

    // Confirm that the parent block has been completely processed.
    // We don't have to worry about aborting as this job will get retried later.
    const parent = await this._indexer.getBlockProgress(event.block.parentHash);
    if (!parent || !parent.isComplete) {
      const message = `Abort processing of event ${id} as parent block not processed yet`;
      throw new Error(message);
    }

    const blockProgress = await this._indexer.getBlockProgress(event.block.blockHash);
    assert(blockProgress);

    const events = await this._indexer.getBlockEvents(event.block.blockHash);
    const eventIndex = events.findIndex((e: any) => e.id === event.id);
    assert(eventIndex !== -1);

    // Check if previous event in block has been processed exactly before this and abort if not.
    if (eventIndex > 0) { // Skip the first event in the block.
      const prevIndex = eventIndex - 1;
      const prevEvent = events[prevIndex];
      if (prevEvent.index !== blockProgress.lastProcessedEventIndex) {
        throw new Error(`Events received out of order for block number ${event.block.blockNumber} hash ${event.block.blockHash},` +
        ` prev event index ${prevEvent.index}, got event index ${event.index} and lastProcessedEventIndex ${blockProgress.lastProcessedEventIndex}, aborting`);
      }
    }

    return event;
  }

  async pruneChain (job: any): Promise<void> {
    const pruneBlockHeight: number = job.data.pruneBlockHeight;

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Should be at least 1.
      assert(blocksAtHeight.length);

      // We have more than one node at this height, so prune all nodes not reachable from indexed block at max reorg depth from prune height.
      // This will lead to orphaned nodes, which will get pruned at the next height.
      if (blocksAtHeight.length > 1) {
        const [indexedBlock] = await this._indexer.getBlocksAtHeight(pruneBlockHeight + MAX_REORG_DEPTH, false);

        // Get ancestor blockHash from indexed block at prune height.
        const ancestorBlockHash = await this._indexer.getAncestorAtDepth(indexedBlock.blockHash, MAX_REORG_DEPTH);

        const blocksToBePruned = blocksAtHeight.filter(block => ancestorBlockHash !== block.blockHash);

        if (blocksToBePruned.length) {
          // Mark blocks pruned which are not the ancestor block.
          await this._indexer.markBlocksAsPruned(blocksToBePruned);
        }
      }
    }
  }
}