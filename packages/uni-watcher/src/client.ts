//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@cerc-io/ipld-eth-client';

import {
  queryGetPool,
  queryPoolIdToPoolKey,
  queryPosition,
  queryEvents,
  subscribeEvents,
  queryGetContract,
  queryEventsInRange,
  queryCallGetPool,
  queryPositions,
  queryTicks,
  queryFeeGrowthGlobal0X128,
  queryFeeGrowthGlobal1X128
} from './queries';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async watchEvents (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._client.subscribe(
      gql(subscribeEvents),
      ({ data }) => {
        onNext(data.onEvent);
      }
    );
  }

  async getEvents (blockHash: string, contract?: string): Promise<any> {
    const { events } = await this._client.query(
      gql(queryEvents),
      {
        blockHash,
        contract
      }
    );

    return events;
  }

  async getPosition (blockHash: string, tokenId: bigint): Promise<any> {
    const { position } = await this._client.query(
      gql(queryPosition),
      {
        blockHash,
        tokenId: tokenId.toString()
      }
    );

    return position;
  }

  async poolIdToPoolKey (blockHash: string, poolId: bigint): Promise<any> {
    const { poolIdToPoolKey } = await this._client.query(
      gql(queryPoolIdToPoolKey),
      {
        blockHash,
        poolId: poolId.toString()
      }
    );

    return poolIdToPoolKey;
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: bigint): Promise<any> {
    const { getPool } = await this._client.query(
      gql(queryGetPool),
      {
        blockHash,
        token0,
        token1,
        fee: fee.toString()
      }
    );

    return getPool;
  }

  async callGetPool (blockHash: string, contractAddress: string, key0: string, key1: string, key2: number): Promise<any> {
    const { callGetPool } = await this._client.query(
      gql(queryCallGetPool),
      {
        blockHash,
        contractAddress,
        key0,
        key1,
        key2
      }
    );

    return callGetPool;
  }

  async positions (blockHash: string, contractAddress: string, tokenId: bigint): Promise<any> {
    const { positions } = await this._client.query(
      gql(queryPositions),
      {
        blockHash,
        contractAddress,
        tokenId: tokenId.toString()
      }
    );

    return positions;
  }

  async ticks (blockHash: string, contractAddress: string, tick: number): Promise<any> {
    const { ticks } = await this._client.query(
      gql(queryTicks),
      {
        blockHash,
        contractAddress,
        tick
      }
    );

    return ticks;
  }

  async feeGrowthGlobal0X128 (blockHash: string, contractAddress: string): Promise<any> {
    const { feeGrowthGlobal0X128 } = await this._client.query(
      gql(queryFeeGrowthGlobal0X128),
      {
        blockHash,
        contractAddress
      }
    );

    return feeGrowthGlobal0X128;
  }

  async feeGrowthGlobal1X128 (blockHash: string, contractAddress: string): Promise<any> {
    const { feeGrowthGlobal1X128 } = await this._client.query(
      gql(queryFeeGrowthGlobal1X128),
      {
        blockHash,
        contractAddress
      }
    );

    return feeGrowthGlobal1X128;
  }

  async getContract (type: string): Promise<any> {
    const { getContract } = await this._client.query(
      gql(queryGetContract),
      {
        type
      }
    );

    return getContract;
  }

  async getEventsInRange (fromblockNumber: number, toBlockNumber: number): Promise<any> {
    const { events } = await this._client.query(
      gql(queryEventsInRange),
      {
        fromblockNumber,
        toBlockNumber
      }
    );

    return events;
  }
}
