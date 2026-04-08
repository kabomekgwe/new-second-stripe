import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { StartedRedisContainer, RedisContainer } from '@testcontainers/redis';

export class TestContainers {
  public oracle: StartedTestContainer;
  public redis: StartedRedisContainer;

  async setup() {
    // Start Oracle
    this.oracle = await new GenericContainer('gvenzl/oracle-free:23-slim-faststart')
      .withEnvironment({
        ORACLE_PASSWORD: 'oracle',
        APP_USER: 'app_user',
        APP_USER_PASSWORD: 'app_password',
      })
      .withExposedPorts(1521)
      .withStartupTimeout(120_000)
      .start();

    // Start Redis
    this.redis = await new RedisContainer('redis:7-alpine')
      .start();
  }

  async teardown() {
    await this.oracle?.stop();
    await this.redis?.stop();
  }

  getOracleHost(): string {
    return this.oracle.getHost();
  }

  getOraclePort(): number {
    return this.oracle.getMappedPort(1521);
  }

  getRedisUrl(): string {
    return this.redis.getConnectionUrl();
  }
}
