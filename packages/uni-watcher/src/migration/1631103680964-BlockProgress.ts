import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class BlockProgress1631103680964 implements MigrationInterface {
  public async up (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'block_progress',
      columns: [
        {
          name: 'id',
          type: 'SERIAL'
        },
        {
          name: 'blockHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'parentHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'blockNumber',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'blockTimestamp',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'numEvents',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'numProcessedEvents',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'lastProcessedEventIndex',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'isComplete',
          type: 'boolean',
          isNullable: false
        },
        {
          name: 'isPruned',
          type: 'boolean',
          isNullable: false,
          default: false
        }
      ]
    }), true);

    await queryRunner.createPrimaryKey('block_progress', ['id']);

    await queryRunner.createIndex('block_progress', new TableIndex({
      columnNames: ['blockHash'],
      isUnique: true
    }));

    await queryRunner.createIndex('block_progress', new TableIndex({
      columnNames: ['parentHash']
    }));

    await queryRunner.createIndex('block_progress', new TableIndex({
      columnNames: ['blockNumber']
    }));
  }

  public async down (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('block_progress');
  }
}
