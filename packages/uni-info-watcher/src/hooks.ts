//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';

import { Indexer } from './indexer';
import { ResultEvent } from './events';

/**
 * Hook function to store an initial state.
 * @param indexer Indexer instance.
 * @param blockHash Hash of the concerned block.
 * @param contractAddress Address of the concerned contract.
 * @returns Data block to be stored.
 */
export async function createInitialState (indexer: Indexer, contractAddress: string, blockHash: string): Promise<any> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Store an empty State.
  const stateData: any = {
    state: {}
  };

  // Return initial state data to be saved.
  return stateData;
}

/**
 * Hook function to create state diff.
 * @param indexer Indexer instance that contains methods to fetch the contract varaiable values.
 * @param blockHash Block hash of the concerned block.
 */
export async function createStateDiff (indexer: Indexer, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);

  // Use indexer.createDiff() method to save custom state diff(s).
}

/**
 * Hook function to create state checkpoint
 * @param indexer Indexer instance.
 * @param contractAddress Address of the concerned contract.
 * @param blockHash Block hash of the concerned block.
 * @returns Whether to disable default checkpoint. If false, the state from this hook is updated with that from default checkpoint.
 */
export async function createStateCheckpoint (indexer: Indexer, contractAddress: string, blockHash: string): Promise<boolean> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Use indexer.createStateCheckpoint() method to create a custom checkpoint.

  // Return false to update the state created by this hook by auto-generated checkpoint state.
  // Return true to disable update of the state created by this hook by auto-generated checkpoint state.
  return false;
}

/**
 * Event hook function.
 * @param indexer Indexer instance that contains methods to fetch and update the contract values in the database.
 * @param eventData ResultEvent object containing event information.
 */
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);
}
