# Changelog

## [0.9.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.8.0...release-backend/v0.9.0) (2026-07-31)


### 기능

* SENTRY_ENABLED 로 Sentry 를 끌 수 있게 한다 ([5e42478](https://github.com/plzhans/hans-app/commit/5e42478102c98f5a8fcdab0f51486a9b142709ee))
* 기동 알림을 채널에도 내보내고 종료를 거기에 매단다 #deploy ([8f5fe21](https://github.com/plzhans/hans-app/commit/8f5fe218de1b95b964352dbefd4e4249736bbf49))
* 서버 기동 알림을 배포 스레드에 단다 #deploy ([7bbdc7c](https://github.com/plzhans/hans-app/commit/7bbdc7c8b8a075bf0d672aebb1b09a3c2f139b8e))
* 슬랙 기동·종료 알림을 Block Kit 으로 그린다 ([19bb13d](https://github.com/plzhans/hans-app/commit/19bb13d8a634f2e28c49a290f3006c6b4205775b))
* 자사 소셜 로그인을 쿠키로 끝낸다 ([39c3ba2](https://github.com/plzhans/hans-app/commit/39c3ba272784fab3bc8cfd35fdbd314c95207308))


### 버그 수정

* SPA 하위 경로가 404 로 떨어지던 것을 막는다 ([37d4d91](https://github.com/plzhans/hans-app/commit/37d4d91e84fb91539d885344b951306a0b0156d0))
* VITE_BASE 빈 값이 호스트 끝에 점을 붙이던 것을 막는다 ([f885e98](https://github.com/plzhans/hans-app/commit/f885e98466cad9768af6dbe13f08e04d46205f06))
* 로그아웃에서 인증 요구를 없앤다 ([2578fb2](https://github.com/plzhans/hans-app/commit/2578fb23848bb411b842a8d5b7ee7f812e973daa))
* 새 refresh 쿠키를 심을 때 옛 path 쿠키를 지운다 ([87a9f67](https://github.com/plzhans/hans-app/commit/87a9f6707e1a91add2e61d7f1a9a408bbd20cdbc))
* 소셜 로그인 CSRF 를 state nonce 로 막는다 ([8aaf752](https://github.com/plzhans/hans-app/commit/8aaf752a263b2464919b7417bf1ac4782760c2f9))


### 구조 변경

* 로그인 완결 처리를 한 곳으로 모은다 ([a98ef6a](https://github.com/plzhans/hans-app/commit/a98ef6ab4a8afb1048a577bd17ae5525da549ba8))
* 프론트 앱 용어를 인증웹·포털웹으로 통일한다 ([1d0af08](https://github.com/plzhans/hans-app/commit/1d0af08d86713e1d522c2202737c3f1de368cdf5))

## [0.8.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.5...release-backend/v0.8.0) (2026-07-30)


### 기능

* 운영 Swagger 를 IP 허용목록으로 연다 ([2d9b2f2](https://github.com/plzhans/hans-app/commit/2d9b2f23a568aacdccad019d796b13c7d89d8e95))
* 운영 Swagger 를 IP 허용목록으로 연다 #deploy ([33883e0](https://github.com/plzhans/hans-app/commit/33883e0b4b1c624b01d057b117d238f71e03fdea))


### 버그 수정

* --target 없이 빌드하면 prebuilt 가 걸리던 것을 막는다 ([878ac51](https://github.com/plzhans/hans-app/commit/878ac51760a5362a56467ad27572400314f13f8b))
* develop 이미지를 도커 밖에서 빌드한다 ([514eb9d](https://github.com/plzhans/hans-app/commit/514eb9df1597a3962803fa887e56a1f71c711a59))


### 구조 변경

* 도커 스테이지 이름을 with-build 로 바꾼다 ([d8eec7e](https://github.com/plzhans/hans-app/commit/d8eec7e22a37926feaff72e9d3503afad2d94ade))


### 문서

* 맥에서 prebuilt 를 못 쓰는 이유를 적는다 ([bc13aeb](https://github.com/plzhans/hans-app/commit/bc13aeb30a6f0a4c4ab7e6e1209dd2a72ab75989))

## [0.7.5](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.4...release-backend/v0.7.5) (2026-07-30)


### 버그 수정

* 컨테이너를 배포 계정과 같은 uid 로 돌린다 ([3245adf](https://github.com/plzhans/hans-app/commit/3245adf73966f652e4f0648f81a47467c252d30c))

## [0.7.4](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.3...release-backend/v0.7.4) (2026-07-30)


### 버그 수정

* 마이그레이션 스키마를 디렉터리로 넘긴다 ([e43c901](https://github.com/plzhans/hans-app/commit/e43c901281c10d9c8e8d810791503783e7a35e6b))

## [0.7.3](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.2...release-backend/v0.7.3) (2026-07-30)


### 버그 수정

* 비밀번호 특수문자로 접속 URL 이 깨지는 것을 막는다 ([a405ad2](https://github.com/plzhans/hans-app/commit/a405ad26a7e3ec15a8d75d99282be316984c631a))

## [0.7.2](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.1...release-backend/v0.7.2) (2026-07-30)


### 버그 수정

* 마이그레이션이 yaml 도 올린다 ([d814ac0](https://github.com/plzhans/hans-app/commit/d814ac009dbb892053c74feefff5854f14b07e87))

## [0.7.1](https://github.com/plzhans/hans-app/compare/release-backend/v0.7.0...release-backend/v0.7.1) (2026-07-30)


### 버그 수정

* production 배포에서 버전 입력을 없앤다 ([7de1ca6](https://github.com/plzhans/hans-app/commit/7de1ca6751ed636985be4b7adf68f36cda6f931e))

## [0.7.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.5...release-backend/v0.7.0) (2026-07-30)


### 기능

* 로컬 redis 를 살리고 production 배포를 main 워크플로로 되돌린다 ([c08853a](https://github.com/plzhans/hans-app/commit/c08853a1b6a9dcbf7cbad22cfb21178d3fe9efeb))


### 구조 변경

* 배포 도구를 backend 밖으로 옮긴다 ([ef4eb90](https://github.com/plzhans/hans-app/commit/ef4eb90792277d9cc9150302509c7436a96236dd))

## [0.6.5](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.4...release-backend/v0.6.5) (2026-07-30)


### 버그 수정

* 마이그레이션 이미지를 CLI 로 만든다 ([8327216](https://github.com/plzhans/hans-app/commit/8327216a75128682c1705d623a2f663a1c2443e5))

## [0.6.4](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.3...release-backend/v0.6.4) (2026-07-30)


### 버그 수정

* env 를 서버로 나를 때 $ 를 이스케이프한다 ([3f330bd](https://github.com/plzhans/hans-app/commit/3f330bd48d79fd96cf58c805594c491a5e35892b))
* env_file 을 format raw 로 읽는다 ([2fb0afd](https://github.com/plzhans/hans-app/commit/2fb0afd2f96a76f7538c11b3d7f83c9f07f5ab1f))

## [0.6.3](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.2...release-backend/v0.6.3) (2026-07-30)


### 구조 변경

* production 배포를 완전히 분리한다 ([96b8e9b](https://github.com/plzhans/hans-app/commit/96b8e9b7e4e279ad1e377bc9ea12f6d8583b7bdb))

## [0.6.2](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.1...release-backend/v0.6.2) (2026-07-30)


### 버그 수정

* 마이그레이션이 필요한 파일을 스스로 올린다 ([a51f333](https://github.com/plzhans/hans-app/commit/a51f33309f24f6047dc401338d74c47f0639e297))

## [0.6.1](https://github.com/plzhans/hans-app/compare/release-backend/v0.6.0...release-backend/v0.6.1) (2026-07-30)


### 버그 수정

* 마이그레이션이 compose 를 직접 올린다 ([20ee4f1](https://github.com/plzhans/hans-app/commit/20ee4f1afe74763d452399c00e2f8ec12bbd804e))

## [0.6.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.5.0...release-backend/v0.6.0) (2026-07-30)


### 기능

* 마이그레이션을 전용 이미지로 분리한다 ([417a074](https://github.com/plzhans/hans-app/commit/417a074fddef6028efa1cd7a5a34b8680bc06016))
* 배포할 때 외울 것을 없앤다 ([d762a8d](https://github.com/plzhans/hans-app/commit/d762a8d9d3b863b9ddd75eec5e3f16d38281042c))


### 버그 수정

* age 키가 잘못 들어갔을 때 무엇이 잘못됐는지 알려준다 ([df5c073](https://github.com/plzhans/hans-app/commit/df5c073fc4d8dc343fecd9a5fe920b1af4284135))
* 인증서 경로를 설정 기준으로도 찾는다 ([e862a98](https://github.com/plzhans/hans-app/commit/e862a985203da64a7924e85f5f979ddc667b1be1))

## [0.5.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.4.0...release-backend/v0.5.0) (2026-07-30)


### 기능

* 로컬에서 이미지를 굽고 올리는 build.sh 를 만든다 ([203d4e1](https://github.com/plzhans/hans-app/commit/203d4e18dc996618c4d19d981eefc1732cb81af6))

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
