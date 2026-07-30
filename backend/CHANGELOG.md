# Changelog

## [0.4.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.3.0...release-backend/v0.4.0) (2026-07-30)


### 기능

* 오리진 포트를 공개 인터페이스에 연다 ([0a3bedf](https://github.com/plzhans/hans-app/commit/0a3bedf92bd902426b6501c30d97dccc368202d1))


### 버그 수정

* 파일명이 kid 와 달라도 서명 키를 쓴다 ([e426d43](https://github.com/plzhans/hans-app/commit/e426d4309bcd0b72420941c9241d4a683b0ce4ba))

## [0.3.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.2.0...release-backend/v0.3.0) (2026-07-29)


### 기능

* dev/prod Redis 인스턴스를 분리한다 ([34e870e](https://github.com/plzhans/hans-app/commit/34e870e117abe47896ba9df8128eef41c22e2721))
* 오리진 TLS 를 앱에서 종단하고 GHCR 임시 로그인으로 이미지를 받는다 ([26a320f](https://github.com/plzhans/hans-app/commit/26a320f0bcbceb22fa3e3bce9b78a744bd8ded93))


### 버그 수정

* redis·elasticsearch 바인드를 .env 로 빼고 redis.conf 를 실제로 읽게 한다 ([0ce015b](https://github.com/plzhans/hans-app/commit/0ce015b6adb6a0eda555e9c0bbe8feb4d6e6d2e0))
* 빈 파일을 암호화해 원본을 덮지 않게 한다 ([1545769](https://github.com/plzhans/hans-app/commit/15457698c4769bfa7d8c378db20d6d65dadb4b09))


### 구조 변경

* 엘라스틱서치 약어를 풀어 쓴다 ([d94746a](https://github.com/plzhans/hans-app/commit/d94746a0db7928274fce84409b892ac021f90f1f))
* 컨테이너에서 환경 개념을 걷어낸다 ([b515006](https://github.com/plzhans/hans-app/commit/b515006a9051349939c275500933119e39c2a0d8))

## [0.2.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.1.0...release-backend/v0.2.0) (2026-07-28)


### 기능

* auth·mail·otp 비밀 아닌 설정을 ConfigSource getX 로 이전 ([d669fdd](https://github.com/plzhans/hans-app/commit/d669fdd00f1c0c4aea3f7e62259c2382ccf97db7))
* batch·krdata·juso 비밀 아닌 설정을 ConfigSource getX 로 이전 ([8938b00](https://github.com/plzhans/hans-app/commit/8938b00844cafc1e2bcf9293f7c62016be0bcd31))
* search 설정을 ConfigSource getX 로 이전 + 루트를 createConfigSource 로 ([ac07087](https://github.com/plzhans/hans-app/commit/ac07087a550a26a819344603c8e9b00cb3b9670b))
* Sentry 환경·릴리스 연동 + 서버 부팅 완료 로그 ([f9defda](https://github.com/plzhans/hans-app/commit/f9defdac872c1f94b138fa7f0920f7216a7ed94e))
* 부팅 시 설정 요약을 한 줄씩 로그로 남기는 logConfigSummary 추가 ([8f1d6fb](https://github.com/plzhans/hans-app/commit/8f1d6fb541b1d816bdb124bbe47e4845012305e8))
* 설정을 config/&lt;환경&gt;.yaml + ConfigSource 경로 게터로 도입 ([33d60ca](https://github.com/plzhans/hans-app/commit/33d60ca844a430110655fabc57a5e67973c59dec))


### 버그 수정

* **auth:** AccessCache 를 AuthModule exports 에 추가 — SocialAuthGuard DI 해결 ([57aac84](https://github.com/plzhans/hans-app/commit/57aac8402b612c738fa9b469c3f4dc9f1a27850e))


### 구조 변경

* hansapi 접두사를 hansapp 으로 통일한다 ([a3fb17a](https://github.com/plzhans/hans-app/commit/a3fb17aae08f5af1be048afdaf2215d6e44ec847))
* hansapp-api-server 를 hansapp-api 로 줄인다 ([c9af9d5](https://github.com/plzhans/hans-app/commit/c9af9d57d8fc6978e54d2557b90d82c9ff0c34b5))
* 설정 yaml 섹션명을 apps-* 로 맞춘다 ([301feb1](https://github.com/plzhans/hans-app/commit/301feb1b27fe72f36ef685bcc8d839e147a4901c))
* 설정 주입 타입을 ConfigSource 로 통일하고 asConfigSource 제거 ([076a4ea](https://github.com/plzhans/hans-app/commit/076a4eab12e5b247b60478388a2900fbde507657))
* 환경별 yaml 자기완결화 + env 파일 규칙 정리 + DB 변수 rename ([82e2592](https://github.com/plzhans/hans-app/commit/82e2592bcb0278abc57656735662258978134520))
