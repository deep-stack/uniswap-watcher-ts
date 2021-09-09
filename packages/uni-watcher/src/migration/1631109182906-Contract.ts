import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class Contract1631109182906 implements MigrationInterface {
  public async up (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'contract',
      columns: [
        {
          name: 'id',
          type: 'SERIAL'
        },
        {
          name: 'address',
          type: 'varchar',
          length: '42',
          isNullable: false
        },
        {
          name: 'kind',
          type: 'varchar',
          length: '8',
          isNullable: false
        },
        {
          name: 'startingBlock',
          type: 'integer',
          isNullable: false
        }
      ]
    }), true);

    await queryRunner.createPrimaryKey('contract', ['id']);

    await queryRunner.createIndex('contract', new TableIndex({
      columnNames: ['address'],
      isUnique: true
    }));
  }

  public async down (queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('contract');
  }
}
