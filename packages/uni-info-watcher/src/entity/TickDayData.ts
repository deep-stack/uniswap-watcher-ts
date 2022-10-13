//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { bigintTransformer, GraphDecimal, graphDecimalTransformer } from '@vulcanize/util';

@Entity()
@Index(['id', 'blockNumber'])
export class TickDayData {
  @PrimaryColumn('varchar')
  id!: string;

  // https://typeorm.io/#/entities/primary-columns
  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string

  @Column('integer')
  blockNumber!: number;

  @Column('integer')
  date!: number

  @Column('varchar', { length: 42 })
  pool!: string;

  @Column('varchar')
  tick!: string;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityGross!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  liquidityNet!: bigint;

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeToken0!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeToken1!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  volumeUSD!: GraphDecimal

  @Column('numeric', { transformer: graphDecimalTransformer })
  feesUSD!: GraphDecimal

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  feeGrowthOutside0X128!: bigint

  @Column('numeric', { default: 0, transformer: bigintTransformer })
  feeGrowthOutside1X128!: bigint
}
