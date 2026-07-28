# hans-app backend

NestJS 기반 백엔드 모노레포. HTTP 계층 · 애플리케이션(비즈니스) 계층 · 공통 모듈을 pnpm workspace로 분리해 관리합니다.

## 프로젝트 구조

```
backend/
├── apps/
│   └── hansapp-api-server/          # HTTP 계층 (NestJS 실행 앱)
│       └── src/
│           ├── main.ts          # 부트스트랩 진입점
│           ├── app.module.ts    # 루트 모듈 (ApplicationModule import)
│           └── hello/           # 컨트롤러 + 요청/응답 DTO
├── packages/
│   ├── hansapp-application/     # 애플리케이션(비즈니스) 계층
│   │   └── src/
│   │       ├── application.module.ts
│   │       └── hello/           # 서비스 + command/result DTO
│   └── hansapp-common/          # 공통 상수·유틸 (전 계층 공유)
├── pnpm-workspace.yaml          # 워크스페이스 정의 (apps/*, packages/*)
├── package.json                 # 루트 스크립트 · 공통 devDependencies
└── pnpm-lock.yaml
```

### 계층 개요

| 패키지                 | 역할                                             | 의존 방향             |
| ---------------------- | ------------------------------------------------ | --------------------- |
| `hansapp-api-server`   | HTTP 라우팅, 컨트롤러, 요청/응답 DTO             | → application, common |
| `@hansapp/application` | 유스케이스·비즈니스 로직, 서비스, command/result | → common              |
| `@hansapp/common`      | 공통 상수·유틸리티                               | (의존 없음)           |

컨트롤러(server)는 애플리케이션 서비스를 호출하며, HTTP 관심사와 비즈니스 로직을 분리합니다. 워크스페이스 내부 참조는 `workspace:*`로 연결됩니다.

## 시작하기

### 요구 사항

- Node.js 24 LTS
- pnpm 11+ (`corepack enable` 로 활성화 권장)

### 설치 · 실행

```bash
# 의존성 설치 (루트에서)
pnpm install

# 전체 빌드 (common → application → server 순)
pnpm build

# 서버 개발 모드 (watch)
pnpm dev:server
```

### 루트 스크립트

| 스크립트          | 설명                                      |
| ----------------- | ----------------------------------------- |
| `pnpm build`      | 전체 워크스페이스 빌드 (`pnpm -r build`)  |
| `pnpm dev:server` | `hansapp-api-server` 를 watch 모드로 실행 |

각 패키지는 자체 `build` 스크립트(`tsc` / `nest build`)를 가지며, `pnpm --filter <패키지명> <스크립트>` 로 개별 실행할 수 있습니다.

## 기술 스택

> 확정 항목과 후보(추천)를 함께 정리한 계획입니다. 도입 시점은 필요에 따라 조정합니다.

### 코어

| 구분            | 선택            |
| --------------- | --------------- |
| Runtime         | Node.js 24 LTS  |
| Language        | TypeScript      |
| Framework       | NestJS          |
| HTTP Adapter    | Fastify         |
| Package Manager | pnpm (monorepo) |

### 데이터 · 저장소

| 구분               | 선택                       |
| ------------------ | -------------------------- |
| Database           | MySQL                      |
| ORM                | Prisma (추천)              |
| Cache              | Redis (ioredis)            |
| Search _(필요 시)_ | Elasticsearch / OpenSearch |

### 인증 · 보안

| 구분           | 선택                                |
| -------------- | ----------------------------------- |
| Authentication | JWT · Passport · API Key            |
| Password Hash  | Argon2 (추천) / bcrypt              |
| Validation     | class-validator · class-transformer |

### API · 통신

| 구분                  | 선택                                   |
| --------------------- | -------------------------------------- |
| API Documentation     | Swagger (OpenAPI)                      |
| HTTP Client           | Undici (Node fetch 기반, 추천) / Axios |
| API Client Generation | OpenAPI Generator / Orval              |
| Realtime _(필요 시)_  | WebSocket · Socket.IO                  |

### 비동기 · 인프라

| 구분                     | 선택                    |
| ------------------------ | ----------------------- |
| Queue / Background Jobs  | BullMQ (Redis)          |
| Message Queue _(대규모)_ | RabbitMQ · Apache Kafka |
| Reverse Proxy            | Nginx                   |
| Configuration            | @nestjs/config · dotenv |

### 운영 · 품질

| 구분           | 선택                                    |
| -------------- | --------------------------------------- |
| Logging        | Pino · nestjs-pino                      |
| Monitoring     | Prometheus · Grafana                    |
| Error Tracking | Sentry                                  |
| Testing        | Vitest · Supertest                      |
| Code Quality   | ESLint · Prettier · Husky · lint-staged |
