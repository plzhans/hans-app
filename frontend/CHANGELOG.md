# Changelog

## [0.3.0](https://github.com/plzhans/hans-app/compare/release-frontend/v0.2.1...release-frontend/v0.3.0) (2026-07-31)


### 기능

* 다른 오리진의 앱도 로그아웃에 즉시 반응한다 ([6da7b67](https://github.com/plzhans/hans-app/commit/6da7b67d5fdb8f7555cacf7ac4de4be02fd0917d))
* 자사 소셜 로그인을 쿠키로 끝낸다 ([39c3ba2](https://github.com/plzhans/hans-app/commit/39c3ba272784fab3bc8cfd35fdbd314c95207308))


### 버그 수정

* .env.local 값이 배포 번들에 새던 것을 막는다 ([c3b1113](https://github.com/plzhans/hans-app/commit/c3b1113504928adc5924537803bf9df87735f5da))
* PKCE 없는 인증 요청을 인증웹에서 바로 거절한다 ([f6d321f](https://github.com/plzhans/hans-app/commit/f6d321f5b780d9576311002c4694604779014c0d))
* SPA 하위 경로가 404 로 떨어지던 것을 막는다 ([37d4d91](https://github.com/plzhans/hans-app/commit/37d4d91e84fb91539d885344b951306a0b0156d0))
* VITE_BASE 빈 값이 호스트 끝에 점을 붙이던 것을 막는다 ([f885e98](https://github.com/plzhans/hans-app/commit/f885e98466cad9768af6dbe13f08e04d46205f06))
* 개발 도메인 접두사를 develop 으로 통일한다 ([6cd4320](https://github.com/plzhans/hans-app/commit/6cd43200fc682cb495a032df0d77b96ace41c474))
* 로그아웃에서 인증 요구를 없앤다 ([2578fb2](https://github.com/plzhans/hans-app/commit/2578fb23848bb411b842a8d5b7ee7f812e973daa))
* 로그아웃을 인증웹 한 곳으로 모아 앱 간 무한 왕복을 없앤다 ([01e3abe](https://github.com/plzhans/hans-app/commit/01e3abe0e22ca4ff237d0a73efe66326b7921d92))
* 로그인 상태를 탭·앱 사이에서 제대로 공유한다 ([8c9e5cc](https://github.com/plzhans/hans-app/commit/8c9e5ccf5db970d13090a132d8f1287188056c74))
* 로그인 포털 주소를 환경별로 채운다 ([7c5b83b](https://github.com/plzhans/hans-app/commit/7c5b83b8abf165598ffb1aec51808513fcb23d07))
* 소셜 로그인 CSRF 를 state nonce 로 막는다 ([8aaf752](https://github.com/plzhans/hans-app/commit/8aaf752a263b2464919b7417bf1ac4782760c2f9))
* 자사 소셜 로그인이 인증웹 콜백을 거치던 것을 없앤다 ([5899d9a](https://github.com/plzhans/hans-app/commit/5899d9aad91a3191af2098395ea314ce51a5d4e6))
* 죽어 있던 Sentry DSN 을 교체하고 docs DSN 을 env 로 뺀다 ([dac428b](https://github.com/plzhans/hans-app/commit/dac428b12da52669ea2ac8605a27626744efb687))
* 쿠키로 끝난 소셜 로그인을 콜백에서 실패로 보지 않는다 ([4b0c90f](https://github.com/plzhans/hans-app/commit/4b0c90f6cd0946ed0197a64219c6a1b2945187fd))


### 구조 변경

* 프론트 앱 용어를 인증웹·포털웹으로 통일한다 ([1d0af08](https://github.com/plzhans/hans-app/commit/1d0af08d86713e1d522c2202737c3f1de368cdf5))

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
