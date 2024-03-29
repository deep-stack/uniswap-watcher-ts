//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { JsonFragment } from '@ethersproject/abi';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { IndexerInterface } from '@vulcanize/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import {
  Indexer as BaseIndexer,
  ServerConfig,
  StateStatus,
  ValueResult,
  Where,
  QueryOptions,
  UNKNOWN_EVENT_NAME,
  JobQueue,
  DatabaseInterface,
  Clients,
  StateKind
} from '@cerc-io/util';
import { StorageLayout, MappingKey } from '@cerc-io/solidity-mapper';

import { Database } from './database';
import { Event } from './entity/Event';
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from './utils';
import { SyncStatus } from './entity/SyncStatus';
import artifacts from './artifacts/ERC20.json';
import { BlockProgress } from './entity/BlockProgress';
import { Contract } from './entity/Contract';
import { State } from './entity/State';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { Allowance } from './entity/Allowance';
import { Balance } from './entity/Balance';

const log = debug('vulcanize:indexer');

const ETH_CALL_MODE = 'eth_call';

const TRANSFER_EVENT = 'Transfer';
const APPROVAL_EVENT = 'Approval';

export const CONTRACT_KIND = 'token';

interface EventResult {
  event: {
    from?: string;
    to?: string;
    owner?: string;
    spender?: string;
    value?: bigint;
    __typename: string;
  }
  proof?: string;
}

export class Indexer implements IndexerInterface {
  _db: Database;
  _ethClient: EthClient;
  _ethProvider: ethers.providers.BaseProvider;
  _baseIndexer: BaseIndexer;
  _serverConfig: ServerConfig;
  _storageLayoutMap: Map<string, StorageLayout> = new Map();

  _abi: JsonFragment[];
  _storageLayout: StorageLayout;
  _contract: ethers.utils.Interface;
  _serverMode: string;

  constructor (serverConfig: ServerConfig, db: DatabaseInterface, clients: Clients, ethProvider: ethers.providers.BaseProvider, jobQueue: JobQueue) {
    assert(db);
    assert(clients.ethClient);

    this._db = db as Database;
    this._ethClient = clients.ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._serverMode = this._serverConfig.mode;
    this._baseIndexer = new BaseIndexer(serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
  }

  getResultEvent (event: Event): EventResult {
    const eventFields = JSON.parse(event.eventInfo);

    return {
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },
      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult> {
    return this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      variable,
      ...mappingKeys
    );
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    return this._db.getEntitiesForBlock(blockHash, tableName);
  }

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  async totalSupply (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenTotalSupply(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_totalSupply');
    }

    // https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-521460510
    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async balanceOf (blockHash: string, token: string, owner: string): Promise<ValueResult> {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      log('balanceOf: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('balanceOf: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);

      // eth_call doesnt support calling method by blockHash https://eth.wiki/json-rpc/API#the-default-block-parameter
      const value = await contract.balanceOf(owner, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_balances', owner);
    }

    log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, blockNumber, token, owner, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async allowance (blockHash: string, token: string, owner: string, spender: string): Promise<ValueResult> {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      log('allowance: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('allowance: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);
      const value = await contract.allowance(owner, spender, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_allowances', owner, spender);
    }

    // log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, blockNumber, token, owner, spender, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async name (blockHash: string, token: string): Promise<ValueResult> {
    const entity = await this._db.getName({ blockHash, token });
    if (entity) {
      log('name: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('name: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenName(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_name');
    }

    await this._db.saveName({ blockHash, blockNumber, token, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async symbol (blockHash: string, token: string): Promise<ValueResult> {
    const entity = await this._db.getSymbol({ blockHash, token });
    if (entity) {
      log('symbol: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('symbol: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenSymbol(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_symbol');
    }

    await this._db.saveSymbol({ blockHash, blockNumber, token, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async decimals (blockHash: string, token: string): Promise<ValueResult> {
    const entity = await this._db.getDecimals({ blockHash, token });
    if (entity) {
      log('decimals: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('decimals: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenDecimals(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      // Not a state variable, uses hardcoded return value in contract function.
      // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86
      throw new Error('Not implemented.');
    }

    await this._db.saveDecimals({ blockHash, blockNumber, token, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const { eventName, eventInfo, contract: token, block: { blockHash } } = event;
    const eventFields = JSON.parse(eventInfo);

    // What data we index depends on the kind of event.
    switch (eventName) {
      case TRANSFER_EVENT: {
        // On a transfer, balances for both parties change.
        // Therefore, trigger indexing for both sender and receiver.
        const { from, to } = eventFields;
        await this.balanceOf(blockHash, token, from);
        await this.balanceOf(blockHash, token, to);

        break;
      }
      case APPROVAL_EVENT: {
        // Update allowance for (owner, spender) combination.
        const { owner, spender } = eventFields;
        await this.allowance(blockHash, token, owner, spender);

        break;
      }
    }
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processBlock (blockProgress: BlockProgress): Promise<void> {
    // Method for processing on indexing new block.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    // TODO Implement
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // TODO: Call initial state hook.
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // TODO: Call checkpoint hook.
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCheckpoint (blockHash: string): Promise<void> {
    // TODO Implement
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    // TODO Implement
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    // TODO Implement
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStateByCID (cid: string): Promise<State | undefined> {
    // TODO Implement
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStates (where: FindConditions<State>): Promise<State[]> {
    // TODO Implement
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    // TODO Implement
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    // TODO Implement
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    // TODO Implement
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async saveOrUpdateState (state: State): Promise<State> {
    return {} as State;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    // TODO Implement
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;
    const logDescription = this._contract.parseLog({ data, topics });
    const eventSignature = logDescription.signature;

    switch (logDescription.name) {
      case TRANSFER_EVENT: {
        eventName = logDescription.name;
        const [from, to, value] = logDescription.args;
        eventInfo = {
          from,
          to,
          value: value.toString()
        };

        break;
      }
      case APPROVAL_EVENT: {
        eventName = logDescription.name;
        const [owner, spender, value] = logDescription.args;
        eventInfo = {
          owner,
          spender,
          value: value.toString()
        };

        break;
      }
    }

    return { eventName, eventInfo, eventSignature };
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgress> {
    // TODO Implement
    return {} as BlockProgress;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getEventsByFilter (blockHash: string, contract: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  isWatchedContract (address : string): Contract | undefined {
    return this._baseIndexer.isWatchedContract(address);
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return this._baseIndexer.watchContract(address, CONTRACT_KIND, checkpoint, startingBlock);
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    this._baseIndexer.updateStateStatusMap(address, stateStatus);
  }

  cacheContract (contract: Contract): void {
    return this._baseIndexer.cacheContract(contract);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._baseIndexer.saveEventEntity(dbEvent);
  }

  async saveEvents (dbEvents: Event[]): Promise<void> {
    return this._baseIndexer.saveEvents(dbEvents);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async saveBlockAndFetchEvents (block: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    return this._saveBlockAndFetchEvents(block);
  }

  async saveBlockProgress (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.saveBlockProgress(block);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    const entities = [Allowance, Balance];
    await this._baseIndexer.resetWatcherToBlock(blockNumber, entities);
  }

  async _saveBlockAndFetchEvents ({
    id,
    cid: blockCid,
    blockHash,
    blockNumber,
    blockTimestamp,
    parentHash
  }: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    assert(blockHash);
    assert(blockNumber);

    const dbEvents = await this._baseIndexer.fetchEvents(blockHash, blockNumber, this.parseEventNameAndArgs.bind(this));

    const block = {
      id,
      cid: blockCid,
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash,
      numEvents: dbEvents.length,
      isComplete: dbEvents.length === 0
    };

    console.time(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);
    const blockProgress = await this.saveBlockProgress(block);
    console.timeEnd(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);

    return [blockProgress, dbEvents];
  }
}
