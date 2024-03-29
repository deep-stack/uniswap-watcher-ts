//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

const resultEvent = `
{
  block {
    number
    hash
    timestamp
    parentHash
  }
  tx {
    hash
    from
    to
    index
  }
  contract
  eventIndex

  event {
    __typename

    ... on PoolCreatedEvent {
      token0
      token1
      fee
      tickSpacing
      pool
    }

    ... on InitializeEvent {
      sqrtPriceX96
      tick
    }

    ... on MintEvent {
      sender
      owner
      tickLower
      tickUpper
      amount
      amount0
      amount1
    }

    ... on BurnEvent {
      owner
      tickLower
      tickUpper
      amount
      amount0
      amount1
    }

    ... on SwapEvent {
      sender
      recipient
      amount0
      amount1
      sqrtPriceX96
      liquidity
      tick
    }

    ... on IncreaseLiquidityEvent {
      tokenId
      liquidity
      amount0
      amount1
    }

    ... on DecreaseLiquidityEvent {
      tokenId
      liquidity
      amount0
      amount1
    }

    ... on CollectEvent {
      tokenId
      recipient
      amount0
      amount1
    }

    ... on TransferEvent {
      from
      to
      tokenId
    }
  }

  proof {
    data
  }
}
`;

export const subscribeEvents = gql`
  subscription SubscriptionEvents {
    onEvent
      ${resultEvent}
  }
`;

export const queryEvents = gql`
query getEvents($blockHash: String!, $contract: String) {
  events(blockHash: $blockHash, contract: $contract)
    ${resultEvent}
}
`;

export const queryPosition = gql`
query getPosition($blockHash: String!, $tokenId: String!) {
  position(blockHash: $blockHash, tokenId: $tokenId) {
    nonce
    operator
    poolId
    tickLower
    tickUpper
    liquidity
    feeGrowthInside0LastX128
    feeGrowthInside1LastX128
    tokensOwed0
    tokensOwed1

    proof {
      data
    }
  }
}
`;

export const queryPositions = gql`
query getPosition($blockHash: String!, $contractAddress: String!, $tokenId: String!) {
  positions(blockHash: $blockHash, contractAddress: $contractAddress, tokenId: $tokenId) {
    value {
      nonce,
      operator,
      token0,
      token1,
      fee,
      tickLower,
      tickUpper,
      liquidity,
      feeGrowthInside0LastX128,
      feeGrowthInside1LastX128,
      tokensOwed0,
      tokensOwed1,
    }

    proof {
      data
    }
  }
}
`;

export const queryPoolIdToPoolKey = gql`
query poolIdToPoolKey($blockHash: String!, $poolId: String!) {
  poolIdToPoolKey(blockHash: $blockHash, poolId: $poolId) {
    token0
    token1
    fee

    proof {
      data
    }
  }
}
`;

export const queryGetPool = gql`
query getPool($blockHash: String!, $token0: String!, $token1: String!, $fee: String!) {
  getPool(blockHash: $blockHash, token0: $token0, token1: $token1, fee: $fee) {
    pool
    proof {
      data
    }
  }
}
`;

export const queryCallGetPool = gql`
query callGetPool($blockHash: String!, $contractAddress: String!, $key0: String!, $key1: String!, $key2: Int!) {
  callGetPool(blockHash: $blockHash, contractAddress: $contractAddress, key0: $key0, key1: $key1, key2: $key2) {
    value
    proof {
      data
    }
  }
}
`;

export const queryTicks = gql`
query ticks($blockHash: String!, $contractAddress: String!, $tick: Int!) {
  ticks(blockHash: $blockHash, contractAddress: $contractAddress, tick: $tick) {
    value {
      liquidityGross
      liquidityNet
      feeGrowthOutside0X128
      feeGrowthOutside1X128
      tickCumulativeOutside
      secondsPerLiquidityOutsideX128
      secondsOutside
      initialized
    }

    proof {
      data
    }
  }
}
`;

export const queryFeeGrowthGlobal0X128 = gql`
query feeGrowthGlobal0X128($blockHash: String!, $contractAddress: String!) {
  feeGrowthGlobal0X128(blockHash: $blockHash, contractAddress: $contractAddress) {
    value
    proof {
      data
    }
  }
}
`;

export const queryFeeGrowthGlobal1X128 = gql`
query feeGrowthGlobal1X128($blockHash: String!, $contractAddress: String!) {
  feeGrowthGlobal1X128(blockHash: $blockHash, contractAddress: $contractAddress) {
    value
    proof {
      data
    }
  }
}
`;

export const queryGetContract = gql`
query queryGetContract($type: String!) {
  getContract(type: $type) {
    address
  }
}
`;

export const queryEventsInRange = gql`
query getEventsInRange($fromBlockNumber: Int!, $toBlockNumber: Int!) {
  eventsInRange(fromBlockNumber: $fromBlockNumber, toBlockNumber: $toBlockNumber)
    ${resultEvent}
}
`;
