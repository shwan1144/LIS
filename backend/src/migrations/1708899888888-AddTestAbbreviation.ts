import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTestAbbreviation1708899888888 implements MigrationInterface {
    name = 'AddTestAbbreviation1708899888888'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tests" ADD "abbreviation" character varying(32)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tests" DROP COLUMN "abbreviation"`);
    }
}
