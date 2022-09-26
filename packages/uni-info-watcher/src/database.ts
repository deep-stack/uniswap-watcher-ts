//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Connection,
  ConnectionOptions,
  DeepPartial,
  FindConditions,
  FindManyOptions,
  FindOneOptions,
  LessThanOrEqual,
  QueryRunner
} from 'typeorm';
import path from 'path';

import {
  Database as BaseDatabase,
  DatabaseInterface,
  BlockHeight,
  QueryOptions,
  Where,
  Relation
} from '@vulcanize/util';

import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';
import { Transaction } from './entity/Transaction';
import { Mint } from './entity/Mint';
import { UniswapDayData } from './entity/UniswapDayData';
import { Tick } from './entity/Tick';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { Position } from './entity/Position';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { BlockProgress } from './entity/BlockProgress';
import { Block } from './events';
import { SyncStatus } from './entity/SyncStatus';
import { TickDayData } from './entity/TickDayData';
import { Contract } from './entity/Contract';

export class Database implements DatabaseInterface {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };

    this._baseDatabase = new BaseDatabase(this._config);
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  async getFactory (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Factory>): Promise<Factory | undefined> {
    const repo = queryRunner.manager.getRepository(Factory);
    const whereOptions: FindConditions<Factory> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getFactory-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Factory>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }
    console.timeEnd('time:database#getFactory-db');

    return entity;
  }

  async getBundle (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Bundle>): Promise<Bundle | undefined> {
    const repo = queryRunner.manager.getRepository(Bundle);
    const whereOptions: FindConditions<Bundle> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getBundle-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Bundle>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }
    console.timeEnd('time:database#getBundle-db');

    return entity;
  }

  async getToken (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Token>, loadRelations = false): Promise<Token | undefined> {
    const repo = queryRunner.manager.getRepository(Token);
    const whereOptions: FindConditions<Token> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getToken-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Token>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash, number: blockNumber },
        [
          {
            entity: Pool,
            type: 'many-to-many',
            field: 'whitelistPools'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getToken-db');

    return entity;
  }

  async getTokenNoTx ({ id, blockHash }: DeepPartial<Token>): Promise<Token | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getToken(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPool (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Pool>, loadRelations = false): Promise<Pool | undefined> {
    const repo = queryRunner.manager.getRepository(Pool);
    const whereOptions: FindConditions<Pool> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getPool-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Pool>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash, number: blockNumber },
        [
          {
            entity: Token,
            type: 'one-to-one',
            field: 'token0'
          },
          {
            entity: Token,
            type: 'one-to-one',
            field: 'token1'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getPool-db');

    return entity;
  }

  async getPoolNoTx ({ id, blockHash, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getPool(queryRunner, { id, blockHash, blockNumber });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPosition ({ id, blockHash }: DeepPartial<Position>, loadRelations = false): Promise<Position | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let entity;

    try {
      await queryRunner.connect();
      const repo = queryRunner.manager.getRepository(Position);
      const whereOptions: FindConditions<Position> = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      const findOptions = {
        where: whereOptions,
        order: {
          blockNumber: 'DESC'
        }
      };

      console.time('time:database#getPosition-db');
      entity = await repo.findOne(findOptions as FindOneOptions<Position>);

      if (!entity && findOptions.where.blockHash) {
        entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
      }

      if (loadRelations && entity) {
        [entity] = await this._baseDatabase.loadRelations(
          queryRunner,
          { hash: blockHash },
          [
            {
              entity: Pool,
              type: 'one-to-one',
              field: 'pool'
            },
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token0'
            },
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token1'
            },
            {
              entity: Tick,
              type: 'one-to-one',
              field: 'tickLower'
            },
            {
              entity: Tick,
              type: 'one-to-one',
              field: 'tickUpper'
            },
            {
              entity: Transaction,
              type: 'one-to-one',
              field: 'transaction'
            }
          ],
          [entity]
        );
      }
      console.timeEnd('time:database#getPosition-db');
    } finally {
      await queryRunner.release();
    }

    return entity;
  }

  async getTick (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Tick>, loadRelations = false): Promise<Tick | undefined> {
    const repo = queryRunner.manager.getRepository(Tick);
    const whereOptions: FindConditions<Tick> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getTick-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Tick>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Pool,
            type: 'one-to-one',
            field: 'pool'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getTick-db');

    return entity;
  }

  async getTickNoTx ({ id, blockHash }: DeepPartial<Tick>): Promise<Tick | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getTick(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPoolDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolDayData>, loadRelations = false): Promise<PoolDayData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    const whereOptions: FindConditions<PoolDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getPoolDayData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<PoolDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Pool,
            type: 'one-to-one',
            field: 'pool'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getPoolDayData-db');

    return entity;
  }

  async getPoolHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolHourData>, loadRelations = false): Promise<PoolHourData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    const whereOptions: FindConditions<PoolHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getPoolHourData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<PoolHourData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Pool,
            type: 'one-to-one',
            field: 'pool'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getPoolHourData-db');

    return entity;
  }

  async getUniswapDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<UniswapDayData>): Promise<UniswapDayData | undefined> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    const whereOptions: FindConditions<UniswapDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getUniswapDayData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<UniswapDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }
    console.timeEnd('time:database#getUniswapDayData-db');

    return entity;
  }

  async getTokenDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenDayData>, loadRelations = false): Promise<TokenDayData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    const whereOptions: FindConditions<TokenDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getTokenDayData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<TokenDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Token,
            type: 'one-to-one',
            field: 'token'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getTokenDayData-db');

    return entity;
  }

  async getTokenHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenHourData>, loadRelations = false): Promise<TokenHourData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    const whereOptions: FindConditions<TokenHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getTokenHourData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<TokenHourData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Token,
            type: 'one-to-one',
            field: 'token'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getTokenHourData-db');

    return entity;
  }

  async getTickDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TickDayData>, loadRelations = false): Promise<TickDayData | undefined> {
    const repo = queryRunner.manager.getRepository(TickDayData);
    const whereOptions: FindConditions<TickDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getTickDayData-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<TickDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    if (loadRelations && entity) {
      [entity] = await this._baseDatabase.loadRelations(
        queryRunner,
        { hash: blockHash },
        [
          {
            entity: Tick,
            type: 'one-to-one',
            field: 'tick'
          },
          {
            entity: Pool,
            type: 'one-to-one',
            field: 'pool'
          }
        ],
        [entity]
      );
    }
    console.timeEnd('time:database#getTickDayData-db');

    return entity;
  }

  async getTransaction (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Transaction>): Promise<Transaction | undefined> {
    const repo = queryRunner.manager.getRepository(Transaction);
    const whereOptions: FindConditions<Transaction> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    console.time('time:database#getTransaction-db');
    let entity = await repo.findOne(findOptions as FindOneOptions<Transaction>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }
    console.timeEnd('time:database#getTransaction-db');

    return entity;
  }

  async getModelEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, block: BlockHeight, where: Where = {}, queryOptions: QueryOptions = {}, relations: Relation[] = []): Promise<Entity[]> {
    return this._baseDatabase.getModelEntities(queryRunner, entity, block, where, queryOptions, relations);
  }

  async getModelEntitiesNoTx<Entity> (entity: new () => Entity, block: BlockHeight, where: Where = {}, queryOptions: QueryOptions = {}, relations: Relation[] = []): Promise<Entity[]> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getModelEntities(queryRunner, entity, block, where, queryOptions, relations);
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async saveFactory (queryRunner: QueryRunner, factory: Factory, block: Block): Promise<Factory> {
    const repo = queryRunner.manager.getRepository(Factory);
    factory.blockNumber = block.number;
    factory.blockHash = block.hash;
    console.time('time:database#saveFactory-db');
    const data = repo.save(factory);
    console.timeEnd('time:database#saveFactory-db');

    return data;
  }

  async saveBundle (queryRunner: QueryRunner, bundle: Bundle, block: Block): Promise<Bundle> {
    const repo = queryRunner.manager.getRepository(Bundle);
    bundle.blockNumber = block.number;
    bundle.blockHash = block.hash;
    console.time('time:database#saveBundle-db');
    const data = repo.save(bundle);
    console.timeEnd('time:database#saveBundle-db');

    return data;
  }

  async savePool (queryRunner: QueryRunner, pool: Pool, block: Block): Promise<Pool> {
    const repo = queryRunner.manager.getRepository(Pool);
    pool.blockNumber = block.number;
    pool.blockHash = block.hash;
    console.time('time:database#savePool-db');
    const data = repo.save(pool);
    console.timeEnd('time:database#savePool-db');

    return data;
  }

  async savePoolDayData (queryRunner: QueryRunner, poolDayData: PoolDayData, block: Block): Promise<PoolDayData> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    poolDayData.blockNumber = block.number;
    poolDayData.blockHash = block.hash;
    console.time('time:database#savePoolDayData-db');
    const data = repo.save(poolDayData);
    console.timeEnd('time:database#savePoolDayData-db');

    return data;
  }

  async savePoolHourData (queryRunner: QueryRunner, poolHourData: PoolHourData, block: Block): Promise<PoolHourData> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    poolHourData.blockNumber = block.number;
    poolHourData.blockHash = block.hash;
    console.time('time:database#savePoolHourData-db');
    const data = repo.save(poolHourData);
    console.timeEnd('time:database#savePoolHourData-db');

    return data;
  }

  async saveToken (queryRunner: QueryRunner, token: Token, block: Block): Promise<Token> {
    const repo = queryRunner.manager.getRepository(Token);
    token.blockNumber = block.number;
    token.blockHash = block.hash;
    console.time('time:database#saveToken-db');
    const data = repo.save(token);
    console.timeEnd('time:database#saveToken-db');

    return data;
  }

  async saveTransaction (queryRunner: QueryRunner, transaction: Transaction, block: Block): Promise<Transaction> {
    const repo = queryRunner.manager.getRepository(Transaction);
    transaction.blockNumber = block.number;
    transaction.blockHash = block.hash;
    console.time('time:database#saveTransaction-db');
    const data = repo.save(transaction);
    console.timeEnd('time:database#saveTransaction-db');

    return data;
  }

  async saveUniswapDayData (queryRunner: QueryRunner, uniswapDayData: UniswapDayData, block: Block): Promise<UniswapDayData> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    uniswapDayData.blockNumber = block.number;
    uniswapDayData.blockHash = block.hash;
    console.time('time:database#saveUniswapDayData-db');
    const data = repo.save(uniswapDayData);
    console.timeEnd('time:database#saveUniswapDayData-db');

    return data;
  }

  async saveTokenDayData (queryRunner: QueryRunner, tokenDayData: TokenDayData, block: Block): Promise<TokenDayData> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    tokenDayData.blockNumber = block.number;
    tokenDayData.blockHash = block.hash;
    console.time('time:database#saveTokenDayData-db');
    const data = repo.save(tokenDayData);
    console.timeEnd('time:database#saveTokenDayData-db');

    return data;
  }

  async saveTokenHourData (queryRunner: QueryRunner, tokenHourData: TokenHourData, block: Block): Promise<TokenHourData> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    tokenHourData.blockNumber = block.number;
    tokenHourData.blockHash = block.hash;
    console.time('time:database#saveTokenHourData-db');
    const data = repo.save(tokenHourData);
    console.timeEnd('time:database#saveTokenHourData-db');

    return data;
  }

  async saveTick (queryRunner: QueryRunner, tick: Tick, block: Block): Promise<Tick> {
    const repo = queryRunner.manager.getRepository(Tick);
    tick.blockNumber = block.number;
    tick.blockHash = block.hash;
    console.time('time:database#saveTick-db');
    const data = repo.save(tick);
    console.timeEnd('time:database#saveTick-db');

    return data;
  }

  async saveTickDayData (queryRunner: QueryRunner, tickDayData: TickDayData, block: Block): Promise<TickDayData> {
    const repo = queryRunner.manager.getRepository(TickDayData);
    tickDayData.blockNumber = block.number;
    tickDayData.blockHash = block.hash;
    console.time('time:database#saveTickDayData-db');
    const data = repo.save(tickDayData);
    console.timeEnd('time:database#saveTickDayData-db');

    return data;
  }

  async savePosition (queryRunner: QueryRunner, position: Position, block: Block): Promise<Position> {
    const repo = queryRunner.manager.getRepository(Position);
    position.blockNumber = block.number;
    position.blockHash = block.hash;
    console.time('time:database#savePosition-db');
    const data = repo.save(position);
    console.timeEnd('time:database#savePosition-db');

    return data;
  }

  async savePositionSnapshot (queryRunner: QueryRunner, positionSnapshot: PositionSnapshot, block: Block): Promise<PositionSnapshot> {
    const repo = queryRunner.manager.getRepository(PositionSnapshot);
    positionSnapshot.blockNumber = block.number;
    positionSnapshot.blockHash = block.hash;
    console.time('time:database#savePositionSnapshot-db');
    const data = repo.save(positionSnapshot);
    console.timeEnd('time:database#savePositionSnapshot-db');

    return data;
  }

  async saveMint (queryRunner: QueryRunner, mint: Mint, block: Block): Promise<Mint> {
    const repo = queryRunner.manager.getRepository(Mint);
    mint.blockNumber = block.number;
    mint.blockHash = block.hash;
    console.time('time:database#saveMint-db');
    const data = repo.save(mint);
    console.timeEnd('time:database#saveMint-db');

    return data;
  }

  async saveBurn (queryRunner: QueryRunner, burn: Burn, block: Block): Promise<Burn> {
    const repo = queryRunner.manager.getRepository(Burn);
    burn.blockNumber = block.number;
    burn.blockHash = block.hash;
    console.time('time:database#saveBurn-db');
    const data = repo.save(burn);
    console.timeEnd('time:database#saveBurn-db');

    return data;
  }

  async saveSwap (queryRunner: QueryRunner, swap: Swap, block: Block): Promise<Swap> {
    const repo = queryRunner.manager.getRepository(Swap);
    swap.blockNumber = block.number;
    swap.blockHash = block.hash;
    console.time('time:database#saveSwap-db');
    const data = repo.save(swap);
    console.timeEnd('time:database#saveSwap-db');

    return data;
  }

  async getContracts (): Promise<Contract[]> {
    const repo = this._conn.getRepository(Contract);

    return this._baseDatabase.getContracts(repo);
  }

  async saveContract (queryRunner: QueryRunner, address: string, kind: string, startingBlock: number): Promise<Contract> {
    const repo = queryRunner.manager.getRepository(Contract);

    return this._baseDatabase.saveContract(repo, address, startingBlock, kind);
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getProcessedBlockCountForRange(repo, fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEventsInRange(repo, fromBlockNumber, toBlockNumber);
  }

  async saveEventEntity (queryRunner: QueryRunner, entity: Event): Promise<Event> {
    const repo = queryRunner.manager.getRepository(Event);
    return this._baseDatabase.saveEventEntity(repo, entity);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Event[]> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getBlockEvents(repo, blockHash, where, queryOptions);
  }

  async saveEvents (queryRunner: QueryRunner, events: Event[]): Promise<void> {
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveEvents(eventRepo, events);
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber, force);
  }

  async getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatus | undefined> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.getSyncStatus(repo);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEvent(repo, id);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgress[]): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlocksAsPruned(repo, blocks);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return this._baseDatabase.getBlockProgress(repo, blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlockProgressEntities(repo, where, options);
  }

  async saveBlockProgress (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.saveBlockProgress(repo, block);
  }

  async updateBlockProgress (queryRunner: QueryRunner, block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.updateBlockProgress(repo, block, lastProcessedEventIndex);
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    return this._baseDatabase.getEntities(queryRunner, entity, findConditions);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    return this._baseDatabase.isEntityEmpty(entity);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseDatabase.getAncestorAtDepth(blockHash, depth);
  }
}
