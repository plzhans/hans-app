# HansApp

**간편화 API - HansAPI **

[![be](https://github.com/plzhans/hans-app/actions/workflows/be.yml/badge.svg?branch=main)](https://github.com/plzhans/hans-app/actions/workflows/be.yml)
[![fe](https://github.com/plzhans/hans-app/actions/workflows/fe.yml/badge.svg?branch=main)](https://github.com/plzhans/hans-app/actions/workflows/fe.yml)
[![release](https://github.com/plzhans/hans-app/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/plzhans/hans-app/actions/workflows/release.yml)
[![node-builder](https://github.com/plzhans/hans-app/actions/workflows/infra-node-builder.yml/badge.svg?branch=main)](https://github.com/plzhans/hans-app/actions/workflows/infra-node-builder.yml)
[![registry cleanup](https://github.com/plzhans/hans-app/actions/workflows/infra-registry-cleanup.yml/badge.svg?branch=main)](https://github.com/plzhans/hans-app/actions/workflows/infra-registry-cleanup.yml)

HansApp 은 여러 원천의 데이터를 **Hans API** 하나로 통합해
일관된 스펙으로 제공하는 API 플랫폼입니다.
앱 등록부터 인증과 키 발급까지 플랫폼이 처리하므로,
사용하는 쪽에서는 앱을 등록하고 키를 받아 호출하기만 하면 됩니다.

첫 번째 제공 영역은 **헬스케어**이며, 이후 영역을 계속 넓혀 갑니다.

## 이용 안내

| | |
| --- | --- |
| **문서** | **https://docs.plzhans.com** — 제공 영역 · 엔드포인트 · 인증 · 사용 가이드 |
| **앱 등록** | **https://plzhans.com** 의 *앱 관리* — API 키와 OAuth 클라이언트를 발급합니다 |

API 사용법은 문서 사이트에서 안내합니다.
아래 내용은 이 저장소의 구성에 대한 설명입니다.

---

## 서비스 운영

이 저장소는 **`plzhans.com` 에서 실제 운영 중인 서비스의 코드**입니다.
아래 표에 정리된 주소들이 모두 이 저장소에서 배포됩니다.

배포는 **GitHub Actions 로 자동화**되어 있습니다 ([배포](#배포) 참고).

---

## 저장소 구조

```
backend/     API 서버와 그 주변 — NestJS 모노레포
frontend/    웹 앱들 — 포털 · 인증 · 문서 · 파생 서비스
docs/        운영 문서 (배포 · CI · 인프라) + OpenAPI 스펙
.github/     워크플로
```

### 백엔드 — [backend/](backend/)

NestJS · Fastify · Prisma/MySQL · Redis · Elasticsearch 로 구성되며,
pnpm 워크스페이스로 계층을 나눕니다.

| 디렉터리   | 무엇                                             |
| ---------- | ------------------------------------------------ |
| `apps/`    | 실행 단위 — API 서버 · 배치 · CLI                |
| `packages/`| 도메인 계층 — 비즈니스 로직 · 데이터 · 검색      |
| `clients/` | 외부 API 클라이언트. 도메인에 의존하지 않는 SDK  |
| `infra/`   | 환경별 서버 구성 (compose · 설정)                |

#### 인증

인증은 OAuth 2.0 · OpenID Connect 표준 체계를 따릅니다.
자체 규약을 두지 않았으므로 표준 클라이언트 라이브러리로 그대로 연동됩니다.

- 인가 코드 흐름을 사용하며, PKCE(RFC 7636, S256)를 모든 인가 코드에 요구합니다.
- access token 은 ES256 으로 서명하고 공개키는 JWKS(`/.well-known/jwks.json`)로 공개합니다.
  토큰을 소비하는 서비스는 인증 서버를 거치지 않고 자체적으로 검증합니다.
- `kid` 는 JWK 지문으로 산출합니다.
  퇴역한 키도 공개키를 남겨 두므로 이미 발급된 토큰은 만료될 때까지 검증되며,
  키 교체 과정에서 서비스가 중단되지 않습니다.
- 이 밖에 OIDC discovery(`/.well-known/openid-configuration`),
  소셜 로그인(Google · Kakao · Naver · LINE),
  서버 간 호출용 API 키를 지원합니다.

> 계층 구조와 실행 방법은 **[backend/Readme.md](backend/Readme.md)** 를 참고하세요.
> 외부 클라이언트는 [backend/clients/README.md](backend/clients/README.md),
> 서버 구축은 [backend/infra/README.md](backend/infra/README.md) 에 있습니다.

### 프론트엔드 — [frontend/](frontend/)

TypeScript · React · Vite 로 구성됩니다.
워크스페이스가 아니라 앱마다 자체 lockfile 로 따로 설치합니다.

| 앱                                           | 무엇                    | 프로덕션           |
| -------------------------------------------- | ----------------------- | ------------------ |
| [`hansapp-web`](frontend/hansapp-web/)       | 포털 (앱 관리)          | `https://plzhans.com`      |
| [`hansapp-auth`](frontend/hansapp-auth/)     | 로그인 · 동의 화면      | `https://auth.plzhans.com` |
| [`hansapp-docs`](frontend/hansapp-docs/)     | API 문서 (VitePress)    | `https://docs.plzhans.com` |
| [`medifinder-web`](frontend/medifinder-web/) | MediFinder              | `https://medifinder.kr`    |
| [`auth-sdk`](frontend/auth-sdk/)             | 로그인 SDK (라이브러리) | —                  |

API 서버는 `api.plzhans.com` 으로 서비스합니다.

> 문서 사이트 빌드는 **[frontend/hansapp-docs/README.md](frontend/hansapp-docs/README.md)** 를 참고하세요.

**MediFinder** 는 Hans API 를 활용한 파생 서비스입니다 (병원 찾기, 한/영/일/중).
별도 저장소로 두는 것이 맞지만 초기 단계라 관리 편의상 함께 두고 있으며,
추후 분리할 예정입니다.

---

## 개발

먼저 루트에서 `pnpm install` 을 한 번 실행합니다.
이때 git 훅(commitlint)이 설치됩니다.
루트에는 훅 외에 빌드가 없으므로,
이후에는 작업할 디렉터리의 README 를 참고하세요.

```bash
pnpm install                  # 루트 — 훅만
pnpm -C backend install       # 백엔드 워크스페이스
pnpm -C frontend/<앱> install # 프론트는 앱마다 따로
```

패키지 매니저는 pnpm 만 사용합니다 (`only-allow` 로 강제).

### 커밋 규약

[Conventional Commits](https://www.conventionalcommits.org/ko/) 를 따릅니다 —
`type(scope): 한국어 설명`, 타입은 도구가 읽으므로 영어 고정.
릴리스 버전이 여기서 계산되므로 규약이 곧 인터페이스입니다.

**husky + commitlint 가 `commit-msg` 에서 막습니다.**
훅은 루트 `pnpm install` 이 걸어 주므로, 클론 직후 한 번은 돌려야 합니다.
규칙은 [commitlint.config.js](commitlint.config.js) 에 있습니다
(한국어 제목이라 대소문자 검사는 꺼 두었습니다).

타입 목록과 scope 는 [DEVELOP.md](DEVELOP.md),
훅 구성은 [docs/husky.md](docs/husky.md) 를 참고하세요.

### 릴리스

버전을 손으로 올리지 않습니다.
로컬에서 릴리스 명령을 미리 돌리는 방식 대신,
**GitHub 위에서 [release-please](https://github.com/googleapis/release-please) 봇이 처리**합니다.

```
main 에 push        → 봇이 커밋을 읽어 다음 버전을 계산하고 Release PR 을 열거나 갱신
Release PR 머지     → 버전 커밋 · CHANGELOG · 태그 · GitHub 릴리스 생성
```

사람이 하는 일은 Release PR 을 머지하는 것 하나입니다.
버전 폭은 커밋 타입이 정합니다 — `fix` 는 patch, `feat` 는 minor, `!` 가 붙으면 major.

**CHANGELOG 는 자동으로 생성됩니다.**
봇이 지난 릴리스 이후의 커밋 메시지를 모아
기능 · 버그 수정 · 성능 · 구조 변경 · 문서 항목으로 분류해
`backend/CHANGELOG.md` · `frontend/CHANGELOG.md` 에 씁니다.
Release PR 에 그 초안이 미리 담기므로 머지 전에 확인할 수 있습니다.

판은 `backend` · `frontend` 둘로 나뉘어 각자 버전 · 태그 · CHANGELOG 를 갖습니다.
릴리스는 여기까지이고, 배포는 별개로 판단합니다.

### 배포

GitHub Actions 워크플로 실행이 곧 배포입니다.

| 대상 | 어떻게 |
| --- | --- |
| **백엔드** | 도커 이미지를 GHCR 에 올리고 서버가 받아 띄웁니다. 서버 접속은 **WireGuard** 경유 |
| **프론트엔드** | **Cloudflare Workers** — 사이트 × 환경마다 Worker 하나 |

백엔드는 **k3s 로 옮길 예정**입니다.

접속 정보 · 키 같은 값은 **GitHub Secrets/Variables** 에 두고,
`.env` · 서명키는 **[SOPS](https://github.com/getsops/sops) + age** 로 암호화해 커밋합니다
([docs/sops.md](docs/sops.md)).

자세한 동작은 [docs/deploy.md](docs/deploy.md) 를 참고하세요.

| 문서                               | 내용                            |
| ---------------------------------- | ------------------------------- |
| [DEVELOP.md](DEVELOP.md)           | 커밋 규약 · 릴리스(버전 자동화) |
| [docs/release.md](docs/release.md) | 릴리스 절차 상세                |
| [docs/deploy.md](docs/deploy.md)   | 배포 파이프라인                 |
