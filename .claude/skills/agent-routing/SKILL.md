# Agent Routing Skill

NestJS 백엔드 개발 요청을 분석하여 적절한 전문가 에이전트를 자동으로 선택하고 호출하는 라우팅 시스템입니다.

## MCP Integration

```
ROUTING DECISION PROCESS:
├─ Sequential-Thinking MCP 호출 (복잡한 라우팅 결정)
│   ├─ 다중 키워드 감지 시 우선순위 결정
│   ├─ SEQUENTIAL vs PARALLEL 전략 선택
│   ├─ 복합 요청 분해 및 전문가 매핑
│   └─ 실행 순서 최적화
│
└─ 적용 시점:
    ├─ 2개 이상 도메인 감지 시
    ├─ 복합 요청 분석 시
    └─ 실행 전략 결정 시
```

---

## Triggers

- "백엔드", "backend", "서버", "server"
- "nestjs", "nest", "fastify"
- "redis", "캐시", "cache", "caching"
- "typeorm", "entity", "엔티티", "migration", "마이그레이션", "repository"
- "bullmq", "queue", "큐", "job", "worker", "background"
- "cqrs", "command", "query", "event", "saga"
- "microservice", "마이크로서비스", "rabbitmq", "grpc", "tcp"
- "test", "테스트", "jest", "suites", "automock", "e2e"

---

## Routing Decision Tree

```
USER REQUEST ANALYSIS:
│
├─ KEYWORDS DETECTED → SELECT EXPERT
│
│   "redis" OR "캐시" OR "cache" OR "cache-manager"
│   └─ → redis-cache-expert
│
│   "typeorm" OR "entity" OR "migration" OR "repository" OR "database"
│   └─ → typeorm-expert
│
│   "bullmq" OR "queue" OR "큐" OR "job" OR "worker" OR "background"
│   └─ → bullmq-queue-expert
│
│   "cqrs" OR "command handler" OR "query handler" OR "event" OR "saga"
│   └─ → cqrs-expert
│
│   "microservice" OR "rabbitmq" OR "grpc" OR "tcp" OR "분산"
│   └─ → microservices-expert
│
│   "test" OR "테스트" OR "jest" OR "suites" OR "automock" OR "e2e"
│   └─ → suites-testing-expert
│
│   "fastify" OR "adapter" OR "plugin" OR "helmet" OR "cors"
│   └─ → nestjs-fastify-expert (DIRECT handling)
│
└─ EXECUTION STRATEGY
    │
    ├─ SINGLE_EXPERT: One keyword domain detected
    │   → Task(subagent_type="{expert-name}", prompt="{user_request}")
    │
    ├─ SEQUENTIAL: Dependencies between domains
    │   Example: "TypeORM 엔티티 만들고 테스트도 작성"
    │   → typeorm-expert → suites-testing-expert
    │
    ├─ PARALLEL: Independent domains
    │   Example: "Redis 캐시랑 BullMQ 큐 둘 다 설정"
    │   → [redis-cache-expert, bullmq-queue-expert] (병렬)
    │
    └─ DIRECT: Fastify core tasks
        → nestjs-fastify-expert handles directly
```

---

## Expert Agent Reference

| Expert | Subagent Type | Domain | Model |
|--------|---------------|--------|-------|
| TypeORM | `typeorm-expert` | 엔티티, 리포지토리, 마이그레이션, 트랜잭션 | opus |
| Redis Cache | `redis-cache-expert` | Redis 캐싱, @nestjs/cache-manager | opus |
| BullMQ Queue | `bullmq-queue-expert` | 작업 큐, Producer/Consumer, Worker | opus |
| CQRS | `cqrs-expert` | Command/Query/Event 분리, Saga | opus |
| Microservices | `microservices-expert` | RabbitMQ, gRPC, TCP transport | opus |
| Testing | `suites-testing-expert` | Suites(Automock), Jest, E2E 테스트 | opus |
| Orchestrator | `nestjs-fastify-expert` | Fastify 어댑터, 플러그인, 오케스트레이션 | opus |

---

## Task Call Examples

### Single Expert Call

```
// 사용자: "Redis 캐시 설정해줘"

Task(
  subagent_type = "redis-cache-expert",
  prompt = "NestJS 프로젝트에 Redis 캐시를 설정해주세요.
            @nestjs/cache-manager와 cache-manager-redis-yet를 사용합니다.
            TTL 설정과 캐시 인터셉터도 포함해주세요."
)
```

### Sequential Expert Calls

```
// 사용자: "User 엔티티 만들고 CRUD 테스트도 작성해줘"

// Step 1: TypeORM 전문가로 엔티티 생성
Task(
  subagent_type = "typeorm-expert",
  prompt = "User 엔티티를 생성해주세요.
            필드: id(uuid), email(unique), name, createdAt, updatedAt"
)

// Step 2: 테스트 전문가로 테스트 생성 (Step 1 결과 참조)
Task(
  subagent_type = "suites-testing-expert",
  prompt = "위에서 생성된 User 엔티티에 대한 CRUD 단위 테스트를 작성해주세요.
            Suites를 사용하여 UserService를 테스트합니다."
)
```

### Parallel Expert Calls

```
// 사용자: "BullMQ 큐랑 Redis 캐시 둘 다 설정해줘"

// 두 Task를 동시에 호출 (병렬 실행)
Task(
  subagent_type = "bullmq-queue-expert",
  prompt = "BullMQ 작업 큐를 설정해주세요. email-queue와 notification-queue 생성."
)

Task(
  subagent_type = "redis-cache-expert",
  prompt = "Redis 캐시를 설정해주세요. 기본 TTL 3600초."
)
```

---

## Complex Request Patterns

| Request Pattern | Execution | Expert Sequence |
|-----------------|-----------|-----------------|
| "엔티티 만들고 테스트 작성" | SEQUENTIAL | typeorm → suites-testing |
| "마이크로서비스로 CQRS 적용" | SEQUENTIAL | cqrs → microservices |
| "캐시랑 큐 설정" | PARALLEL | [redis-cache, bullmq] |
| "Fastify 설정하고 Redis 추가" | SEQUENTIAL | nestjs-fastify(direct) → redis-cache |
| "전체 백엔드 아키텍처 설계" | ORCHESTRATOR | nestjs-fastify-expert가 조율 |

---

## When to Use Each Strategy

### SINGLE_EXPERT
- 한 가지 도메인만 관련된 명확한 요청
- 예: "TypeORM 마이그레이션 생성", "Jest 테스트 작성"

### SEQUENTIAL
- 앞선 작업의 결과가 다음 작업에 필요한 경우
- 예: 엔티티 생성 → 테스트 작성 (엔티티 정의 필요)

### PARALLEL
- 서로 독립적인 여러 설정 작업
- 예: 캐시 설정, 큐 설정 (서로 의존성 없음)

### DIRECT (Orchestrator)
- Fastify 핵심 설정 (어댑터, 플러그인)
- 여러 전문가의 복합 조율이 필요한 대규모 작업

---

## Integration with Orchestrator

nestjs-fastify-expert (오케스트레이터)는 이 라우팅 스킬의 정보를 참조하여:

1. 사용자 요청의 키워드 분석
2. 적절한 전문가 선택
3. 실행 전략 결정 (SINGLE/SEQUENTIAL/PARALLEL/DIRECT)
4. Task 호출 및 결과 통합

---

## Best Practices

1. **명확한 요청**: 어떤 기술(Redis, TypeORM 등)을 사용할지 명시하면 정확한 라우팅
2. **복합 요청 분리**: "A하고 B해줘"보다 순서/관계 명시하면 더 정확
3. **컨텍스트 제공**: 기존 코드가 있다면 경로 제공
4. **오케스트레이터 활용**: 복잡한 아키텍처 설계는 nestjs-fastify-expert에게 전체 위임
