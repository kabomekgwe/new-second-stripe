import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb from 'oracledb';
import { SQL_MIGRATIONS } from './migrations';

export type DbConnection = oracledb.Connection;

@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OracleService.name);
  private pool: oracledb.Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('DB_HOST', 'localhost');
    const port = this.configService.get<number>('DB_PORT', 1521);
    const serviceName = this.configService.get<string>('DB_SERVICE_NAME', 'FREEPDB1');

    this.pool = await oracledb.createPool({
      user: this.configService.get<string>('DB_USER', 'app_user'),
      password: this.configService.get<string>('DB_PASSWORD', 'app_password'),
      connectString: `${host}:${port}/${serviceName}`,
    });

    await this.query(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE SCHEMA_MIGRATIONS (
          ID VARCHAR2(255) PRIMARY KEY,
          RUN_AT TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
        )';
      EXCEPTION
        WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);

    for (const migration of SQL_MIGRATIONS) {
      const existing = await this.query<{ id: string }>(
        'SELECT ID FROM SCHEMA_MIGRATIONS WHERE ID = :1',
        [migration.id],
      );

      if (existing.rows[0]) continue;

      await this.transaction(async (connection) => {
        await this.query(migration.sql, [], connection);
        await this.query(
          'INSERT INTO SCHEMA_MIGRATIONS (ID) VALUES (:1)',
          [migration.id],
          connection,
        );
      });

      this.logger.log(`Applied SQL migration ${migration.id}`);
    }
  }

  async query<T = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown> = [],
    connection?: oracledb.Connection,
  ): Promise<{ rows: T[] }> {
    const conn = connection ?? (await this.pool.getConnection());
    try {
      const result = await conn.execute(text, [...params], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: !connection,
      });
      return { rows: (result.rows ?? []) as T[] };
    } finally {
      if (!connection) await conn.close();
    }
  }

  async transaction<T>(
    callback: (connection: oracledb.Connection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.close(0);
  }
}
