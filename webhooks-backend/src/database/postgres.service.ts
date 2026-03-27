import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { SQL_MIGRATIONS } from './migrations';

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      user: this.configService.get<string>('DB_USER', 'postgres'),
      password: this.configService.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DB_NAME', 'stripe_app'),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id varchar PRIMARY KEY,
        "runAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of SQL_MIGRATIONS) {
      const existing = await this.query<{ id: string }>(
        'SELECT id FROM schema_migrations WHERE id = $1',
        [migration.id],
      );

      if (existing.rows[0]) {
        continue;
      }

      await this.transaction(async (client) => {
        await this.query(migration.sql, [], client);
        await this.query(
          'INSERT INTO schema_migrations (id) VALUES ($1)',
          [migration.id],
          client,
        );
      });

      this.logger.log(`Applied SQL migration ${migration.id}`);
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: ReadonlyArray<unknown> = [],
    client?: PoolClient,
  ) {
    return (client ?? this.pool).query<T>(text, params);
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
