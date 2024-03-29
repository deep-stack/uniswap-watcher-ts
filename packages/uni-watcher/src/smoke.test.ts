//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import { ethers, Contract, ContractTransaction, Signer, constants } from 'ethers';
import 'mocha';

import { JobQueue, getConfig } from '@cerc-io/util';
import { Config } from '@vulcanize/util';
import {
  deployTokens,
  deployUniswapV3Callee,
  TESTERC20_ABI,
  TICK_MIN,
  getMinTick,
  getMaxTick,
  approveToken,
  NFPM_ABI
} from '@vulcanize/util/test';
import { getCache } from '@cerc-io/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';
import {
  abi as FACTORY_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import { Client as UniClient } from './client';
import { Indexer } from './indexer';
import { Database } from './database';
import {
  testCreatePool,
  testInitialize,
  checkMintEvent,
  checkBurnEvent,
  checkSwapEvent,
  checkTransferEvent,
  checkIncreaseLiquidityEvent,
  checkDecreaseLiquidityEvent,
  checksCollectEvent
} from '../test/utils';

const CONFIG_FILE = './environments/test.toml';

describe('uni-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let token0: Contract;
  let token1: Contract;
  let poolCallee: Contract;
  let token0Address: string;
  let token1Address: string;
  let nfpm: Contract;

  let nfpmTokenId: number;
  let tickLower: number;
  let tickUpper: number;
  let config: Config;
  let db: Database;
  let uniClient: UniClient;
  let ethClient: EthClient;
  let ethProvider: ethers.providers.JsonRpcProvider;
  let jobQueue: JobQueue;
  let signer: Signer;
  let recipient: string;
  let deadline: number;

  before(async () => {
    config = await getConfig(CONFIG_FILE);

    const { database: dbConfig, upstream, server: { host, port }, jobQueue: jobQueueConfig } = config;
    assert(dbConfig, 'Missing dbConfig.');
    assert(upstream, 'Missing upstream.');
    assert(host, 'Missing host.');
    assert(port, 'Missing port.');

    const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint.');
    assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint.');
    assert(cacheConfig, 'Missing dbConfig.');

    db = new Database(dbConfig);
    await db.init();

    const cache = await getCache(cacheConfig);
    ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      cache
    });

    const gqlEndpoint = `http://${host}:${port}/graphql`;
    const gqlSubscriptionEndpoint = `ws://${host}:${port}/graphql`;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    ethProvider = new ethers.providers.JsonRpcProvider(rpcProviderEndpoint);
    signer = ethProvider.getSigner();
    recipient = await signer.getAddress();

    // Deadline set to 2 days from current date.
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 2);
    deadline = Math.floor(deadlineDate.getTime() / 1000);

    const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
    jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  });

  after(async () => {
    await db.close();
  });

  it('should have a watched Factory contract', async () => {
    // Get the factory contract address.
    const factoryContract = await uniClient.getContract('factory');
    expect(factoryContract).to.not.be.empty;

    // Initialize the factory contract.
    factory = new Contract(factoryContract.address, FACTORY_ABI, signer);

    // Verifying with the db.
    const indexer = new Indexer(config.server, db, { ethClient }, ethProvider, jobQueue);
    await indexer.init();
    assert(indexer.isWatchedContract(factory.address), 'Factory contract not added to the database.');
  });

  it('should deploy 2 tokens', async () => {
    // Deploy 2 tokens.

    // Not initializing global token contract variables just yet; initialized in `create pool` to maintatin order coherency.
    ({ token0Address, token1Address } = await deployTokens(signer));
    expect(token0Address).to.not.be.empty;
    expect(token1Address).to.not.be.empty;
  });

  it('should create pool', async () => {
    const fee = 500;

    pool = await testCreatePool(uniClient, factory, token0Address, token1Address, fee, POOL_ABI, signer);

    // Getting tokens from pool as their order might be swapped (Need to do only once for two specific tokens).
    token0Address = await pool.token0();
    token0 = new Contract(token0Address, TESTERC20_ABI, signer);
    token1Address = await pool.token1();
    token1 = new Contract(token1Address, TESTERC20_ABI, signer);

    // Initializing ticks.
    const tickSpacing = await pool.tickSpacing();
    // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
    tickLower = getMinTick(tickSpacing);
    tickUpper = getMaxTick(tickSpacing);
  });

  it('should initialize pool', async () => {
    const sqrtPrice = '4295128939';

    await testInitialize(uniClient, pool, sqrtPrice, TICK_MIN);
  });

  it('should mint specified amount', done => {
    (async () => {
      const amount = 10;
      const approveAmount = BigInt(1000000000000000000000000);

      // Deploy UniswapV3Callee.
      poolCallee = await deployUniswapV3Callee(signer);

      await approveToken(token0, poolCallee.address, approveAmount);
      await approveToken(token1, poolCallee.address, approveAmount);

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = poolCallee.address;
          const exptectedOwner: string = recipient;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool mint.
      const transaction: ContractTransaction = await poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should burn specified amount', done => {
    (async () => {
      const amount = 10;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = recipient;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, amount);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool burn.
      const transaction: ContractTransaction = await pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should swap pool tokens', done => {
    (async () => {
      const sqrtPrice = '4295128938';

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'SwapEvent') {
          const expectedContract: string = pool.address;
          const exptectedSender: string = poolCallee.address;

          checkSwapEvent(value, expectedContract, exptectedSender, recipient, sqrtPrice, TICK_MIN);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool swap.
      const transaction: ContractTransaction = await poolCallee.swapToLowerSqrtPrice(pool.address, BigInt(sqrtPrice), recipient);
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should have a watched NFPM contract', async () => {
    // Get the NFPM contract address.
    const nfpmContract = await uniClient.getContract('nfpm');
    expect(nfpmContract).to.not.be.empty;

    // Initialize the NFPM contract.
    nfpm = new Contract(nfpmContract.address, NFPM_ABI, signer);

    // Verifying with the db.
    const indexer = new Indexer(config.server, db, { ethClient }, ethProvider, jobQueue);
    await indexer.init();
    assert(await indexer.isWatchedContract(nfpm.address), 'NFPM contract not added to the database.');
  });

  it('should mint specified amount: nfpm', done => {
    (async () => {
      const fee = 3000;
      pool = await testCreatePool(uniClient, factory, token0Address, token1Address, fee, POOL_ABI, signer);

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      const sqrtPrice = '79228162514264337593543950336';
      await testInitialize(uniClient, pool, sqrtPrice, 0);

      const amount0Desired = 15;
      const amount1Desired = 15;
      const amount0Min = 0;
      const amount1Min = 0;

      // Approving tokens for NonfungiblePositionManager contract.
      // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/NonfungiblePositionManager.spec.ts#L44
      const t0 = await token0.approve(nfpm.address, constants.MaxUint256);
      await t0.wait();

      const t1 = await token1.approve(nfpm.address, constants.MaxUint256);
      await t1.wait();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = nfpm.address;
          const exptectedOwner: string = nfpm.address;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount1Desired);
        }
        if (value.event.__typename === 'TransferEvent') {
          const expectedContract: string = nfpm.address;
          const from = '0x0000000000000000000000000000000000000000';

          checkTransferEvent(value, expectedContract, from, recipient);
          nfpmTokenId = Number(value.event.tokenId);
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          const expectedTokenId = nfpmTokenId;
          const expectedContract: string = nfpm.address;

          checkIncreaseLiquidityEvent(value, expectedTokenId, expectedContract, amount1Desired);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger mint.
      const transaction: ContractTransaction = await nfpm.mint({
        token0: token0Address,
        token1: token1Address,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient,
        deadline,
        fee
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should increase liquidity', done => {
    (async () => {
      const amount0Desired = 15;
      const amount1Desired = 15;
      const amount0Min = 0;
      const amount1Min = 0;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = nfpm.address;
          const exptectedOwner: string = nfpm.address;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount0Desired);
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          const expectedTokenId = nfpmTokenId;
          const expectedContract: string = nfpm.address;

          checkIncreaseLiquidityEvent(value, expectedTokenId, expectedContract, amount0Desired);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger increase liquidity.
      const transaction: ContractTransaction = await nfpm.increaseLiquidity({
        tokenId: nfpmTokenId,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should decrease liquidity', done => {
    (async () => {
      const liquidity = 5;
      const amount0Min = 0;
      const amount1Min = 0;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = nfpm.address;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, liquidity);
        }
        if (value.event.__typename === 'DecreaseLiquidityEvent') {
          const expectedTokenId = nfpmTokenId;
          const expectedContract: string = nfpm.address;

          checkDecreaseLiquidityEvent(value, expectedTokenId, expectedContract, liquidity);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger decrease liquidity.
      const transaction: ContractTransaction = await nfpm.decreaseLiquidity({
        tokenId: nfpmTokenId,
        liquidity,
        amount0Min,
        amount1Min,
        deadline
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should collect fees', done => {
    (async () => {
      const amount0Max = 15;
      const amount1Max = 15;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = nfpm.address;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, 0);
        }
        if (value.event.__typename === 'CollectEvent') {
          const expectedTokenId = nfpmTokenId;
          const expectedContract: string = nfpm.address;

          checksCollectEvent(value, expectedTokenId, expectedContract, recipient);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger collect.
      const transaction: ContractTransaction = await nfpm.collect({
        tokenId: nfpmTokenId,
        recipient,
        amount0Max,
        amount1Max
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });
});
