# Changelog

## [0.2.1](https://github.com/plzhans/hans-app/compare/release-frontend/v0.2.0...release-frontend/v0.2.1) (2026-07-29)


### 버그 수정

* **ci:** link: 로 무는 프로젝트의 의존성을 먼저 설치한다 ([3dd614c](https://github.com/plzhans/hans-app/commit/3dd614c922ee3caf7f7d49d4381e3c61b332a2fd))

## [0.2.0](https://github.com/plzhans/hans-app/compare/release-frontend/v0.1.0...release-frontend/v0.2.0) (2026-07-28)


### 기능

* Sentry 환경·릴리스 연동 + 서버 부팅 완료 로그 ([f9defda](https://github.com/plzhans/hans-app/commit/f9defdac872c1f94b138fa7f0920f7216a7ed94e))


### 버그 수정

* **docs:** 경로 바로잡기 ([8108a54](https://github.com/plzhans/hans-app/commit/8108a543c8b81cba339da7bfd7b92c8ec02bd0b4))


### 구조 변경

* frontend/hansapi-docs 를 hansapp-docs 로 이름 변경 ([b026b31](https://github.com/plzhans/hans-app/commit/b026b31d86c62a72a777ef9951d58b1cdb168d79))
* hansapi 접두사를 hansapp 으로 통일한다 ([a3fb17a](https://github.com/plzhans/hans-app/commit/a3fb17aae08f5af1be048afdaf2215d6e44ec847))
* hansapp-api-server 를 hansapp-api 로 줄인다 ([c9af9d5](https://github.com/plzhans/hans-app/commit/c9af9d57d8fc6978e54d2557b90d82c9ff0c34b5))
* 로그인 복귀 검증을 rootDomain 기반 1st-party 판정으로 통일 ([3345bb5](https://github.com/plzhans/hans-app/commit/3345bb5294c3fd66ff53fdd8b802e145d07f1899))


### 문서

* build 로 커밋된 docs/openapi/openapi_hansapi.json 을 그대로 읽는다. ([bd59352](https://github.com/plzhans/hans-app/commit/bd59352725e8c94d72c8378e19cef036111d9dcc))
* mermaid 전이 의존을 .npmrc hoist → 명시적 devDependencies ([0e9be22](https://github.com/plzhans/hans-app/commit/0e9be22731f96fc0c05640a80491a3bf1066276d))
