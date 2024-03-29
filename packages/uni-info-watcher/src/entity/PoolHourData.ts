//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

import { bigintTransformer, graphDecimalTransformer, GraphDecimal } from '@cerc-io/util';

@Entity()
@Index(['id', 'blockNumber'])
export class PoolHourData {
  @PrimaryColumn('varchar')
    id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
    blockHash!: string;

  @Column('integer')
    blockNumber!: number;

  @Column('integer')
    periodStartUnix!: number;

  @Column('varchar', { length: 42 })
    pool!: string;

  @Column('numeric', { transformer: graphDecimalTransformer })
    high!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
    low!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
    open!: GraphDecimal;

  @Column('numeric', { transformer: graphDecimalTransformer })
    close!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
    sqrtPrice!: bigint;

  @Column('numeric', { nullable: true, transformer: bigintTransformer })
    tick!: bigint | null;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
    liquidity!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    token0Price!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    token1Price!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    tvlUSD!: GraphDecimal;

  @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
    txCount!: bigint;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    volumeToken0!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    volumeToken1!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    volumeUSD!: GraphDecimal;

  @Column('numeric', { default: 0, transformer: graphDecimalTransformer })
    feesUSD!: GraphDecimal;

  @Column('boolean', { default: false })
    isPruned!: boolean;

  // Skipping fee growth as they are not queried.
  // @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  // feeGrowthGlobal0X128!: bigint

  // @Column('numeric', { default: BigInt(0), transformer: bigintTransformer })
  // feeGrowthGlobal1X128!: bigint
}
