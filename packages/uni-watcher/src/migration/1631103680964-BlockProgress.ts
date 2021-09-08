import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class BlockProgress1631103680964 implements MigrationInterface {
  public async up (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'BlockProgress',
      columns: [
        {
          name: 'id',
          type: 'integer',
          isPrimary: true
        },
        {
          name: 'blockHash',
          type: 'varchar'
        },
        {
          name: 'parentHash',
          type: 'varchar'
        },
        {
          name: 'blockNumber',
          type: 'integer'
        },
        {
          name: 'blockTimestamp',
          type: 'integer'
        },
        {
          name: 'numEvents',
          type: 'integer'
        },
        {
          name: 'numProcessedEvents',
          type: 'integer'
        },
        {
          name: 'lastProcessedEventIndex',
          type: 'integer'
        },
        {
          name: 'isComplete',
          type: 'boolean'
        },
        {
          name: 'isPruned',
          type: 'boolean'
        }
      ]
    }), true);
  }

  public async down (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('BlockProgress');
  }
}
