import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class SyncStatus1631158816298 implements MigrationInterface {
  public async up (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'sync_status',
      columns: [
        {
          name: 'id',
          type: 'SERIAL'
        },
        {
          name: 'chainHeadBlockHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'chainHeadBlockNumber',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'latestIndexedBlockHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'latestIndexedBlockNumber',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'latestCanonicalBlockHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'latestCanonicalBlockNumber',
          type: 'integer',
          isNullable: false
        }
      ]
    }), true);

    await queryRunner.createPrimaryKey('sync_status', ['id']);
  }

  public async down (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sync_status');
  }
}
