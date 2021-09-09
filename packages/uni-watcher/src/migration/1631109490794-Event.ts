import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class Event1631109490794 implements MigrationInterface {
  public async up (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'event',
      columns: [
        {
          name: 'id',
          type: 'SERIAL'
        },
        {
          name: 'txHash',
          type: 'varchar',
          length: '66',
          isNullable: false
        },
        {
          name: 'index',
          type: 'integer',
          isNullable: false
        },
        {
          name: 'contract',
          type: 'varchar',
          length: '42',
          isNullable: false
        },
        {
          name: 'eventName',
          type: 'varchar',
          length: '256',
          isNullable: false
        },
        {
          name: 'eventInfo',
          type: 'text',
          isNullable: false
        },
        {
          name: 'extraInfo',
          type: 'text',
          isNullable: false
        },
        {
          name: 'proof',
          type: 'text',
          isNullable: false
        },
        {
          name: 'blockId',
          type: 'integer'
        }
      ]
    }), true);

    await queryRunner.createPrimaryKey('event', ['id']);

    await queryRunner.createIndex('event', new TableIndex({
      columnNames: ['contract']
    }));

    await queryRunner.createForeignKey('event', new TableForeignKey({
      columnNames: ['blockId'],
      referencedColumnNames: ['id'],
      referencedTableName: 'block_progress'
    }));
  }

  public async down (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('event');
  }
}
