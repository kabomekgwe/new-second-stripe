import { StartedPostgreSqlContainer, PostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedRedisContainer, RedisContainer } from '@testcontainers/redis';

export class TestContainers {
  public postgres: StartedPostgreSqlContainer;
  public redis: StartedRedisContainer;

  async setup() {
    // Start PostgreSQL
    this.postgres = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('stripe_app_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    // Start Redis
    this.redis = await new RedisContainer('redis:7-alpine')
      .start();
  }

  async teardown() {
    await this.postgres?.stop();
    await this.redis?.stop();
  }

  getPostgresUrl(): string {
    return this.postgres.getConnectionUri();
  }

  getRedisUrl(): string {
    return this.redis.getConnectionUrl();
  }
}
