//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['address'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column('varchar', { length: 42 })
    address!: string;

  @Column('varchar', { length: 8 })
    kind!: string;

  @Column('boolean', { default: false })
    checkpoint!: boolean;

  @Column('integer')
    startingBlock!: number;
}
