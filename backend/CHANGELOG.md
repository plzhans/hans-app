# Changelog

## [0.17.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.16.0...release-backend/v0.17.0) (2026-09-04)


### 기능

* **admin:** 관리자에 병원 목록 조회를 넣는다 ([dcb9951](https://github.com/plzhans/hans-app/commit/dcb99513b33ab4d312eb09e83a9abbc1b8f90570))
* **admin:** 병원 상세·메타·캐시를 추가하고 HIRA·NMC 원본 미러 조회를 넣는다 ([b0d4687](https://github.com/plzhans/hans-app/commit/b0d46872369c3e1b5300b3d8a59d847c61bd51b1))
* **batch:** 단계 단위로 켜고 끌 수 있게 한다 ([758691c](https://github.com/plzhans/hans-app/commit/758691cb5cf5c818964efe6b9ee6cfc77eef12b4))
* **batch:** 잡별 스케줄·실행 이력·분산 락을 넣는다 ([a4fbea4](https://github.com/plzhans/hans-app/commit/a4fbea4a0199bcd00515cbbef3fac98e57db2069))
* **data:** sync_state.provider 를 batch_job 참조 FK로 옮긴다 ([f56ff06](https://github.com/plzhans/hans-app/commit/f56ff06078d6274b69b251803bfa8240f0d64f8b))
* **error:** 계층별 오류 코드 표와 전역 오류 필터를 둔다 ([40954cf](https://github.com/plzhans/hans-app/commit/40954cf2be137ab322abc7b669a2c6068b74448d))
* **frontend:** 콘솔을 console.plzhans.com 으로 옮긴다 ([01cd57a](https://github.com/plzhans/hans-app/commit/01cd57ad08217f4ade9a30c9151464dd2300d083))
* **sentry:** 부팅 실패를 알리고 관리자 콘솔에도 Sentry 를 건다 ([54309d8](https://github.com/plzhans/hans-app/commit/54309d864592fcd32086b9374792836f3d2b7cf3))


### 버그 수정

* **data:** FK 앞에 batch_job 참조 행을 채운다 ([07525b2](https://github.com/plzhans/hans-app/commit/07525b25f410fa0bf5f92957812cdeb5cee00515))
* **llm:** llm_usage 에서 질문 해시를 뺀다 ([6a00507](https://github.com/plzhans/hans-app/commit/6a00507606881e76ffa82e8b936b142428dcc15c))


### 구조 변경

* **log:** 로그·예외를 영어로 쓰고 우리 오류 객체로 옮긴다 ([0b8c1fb](https://github.com/plzhans/hans-app/commit/0b8c1fb7d7e93994aed44a8106f27cfb3e45a458))

## [0.16.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.15.0...release-backend/v0.16.0) (2026-08-14)


### 기능

* **admin:** discovery 문서를 연다 ([91e3bc6](https://github.com/plzhans/hans-app/commit/91e3bc68e630c2c2f7080167037fdcea152b0305))
* **admin:** 관리자 계정 관리·등급·기록·비밀번호 찾기 ([690441c](https://github.com/plzhans/hans-app/commit/690441c1a45f279924c1cb28a2a1217eca46f970))
* **admin:** 관리자 계정·세션을 회원 쪽 구조로 맞춘다 ([f78305d](https://github.com/plzhans/hans-app/commit/f78305db3c7a29fb2446fa199810ef2cd7bbe599))
* **admin:** 관리자 콘솔에 구글 로그인과 연동을 넣는다 ([4281244](https://github.com/plzhans/hans-app/commit/4281244b0c906b77dbaf90eb1b9f4866d92139af))
* **admin:** 관리자 콘솔용 구글 클라이언트 입력란을 넣고 설정 캐시를 안내한다 ([7175a15](https://github.com/plzhans/hans-app/commit/7175a1576765103b09b602cac5799df987af1012))
* **admin:** 로그인 기록에 수단을 남기고 보여준다 ([377a34e](https://github.com/plzhans/hans-app/commit/377a34e93dddb55ab90a0ad82f433d825cd873d3))
* **admin:** 외부 연동 설정에 Redirect URI 를 보여준다 ([f696a6b](https://github.com/plzhans/hans-app/commit/f696a6bcc9fd3aca3c4fe0f16e8f0e6d61eca122))
* **admin:** 정리하기에 관리자 캐시와 전체 로그아웃을 붙인다 ([bd8194c](https://github.com/plzhans/hans-app/commit/bd8194ce5cf094b0670f810b15a6bfe6cdea4a23))
* **admin:** 회원 상세에 앱 탭을 붙이고 등급·언어·시간대를 고친다 ([072a07b](https://github.com/plzhans/hans-app/commit/072a07ba304f6b4577b475eb1a798bebd3ed8e0e))
* **auth:** access token 에 발급 앱을 싣는다 ([17c5446](https://github.com/plzhans/hans-app/commit/17c5446fcc6d2d3404a5c90003cbc03f3e7405e5))
* **auth:** 세션 키를 회원과 묶고 캐시 정리 통로를 연다 ([099163e](https://github.com/plzhans/hans-app/commit/099163e23ddf376ee81519b41659f12e2dc1b016))
* **board:** 게시판 단위 캐시 삭제와 목록 캐시 탭 ([578b7e4](https://github.com/plzhans/hans-app/commit/578b7e46900b64b47d0e58641a30a9411b38a2e8))
* **board:** 목록 캐싱과 await 괄호 금지 규칙 ([2d2a84d](https://github.com/plzhans/hans-app/commit/2d2a84d3c3e5bfd4204d1b163d515ab841135f15))
* **community:** 게시판·게시글 기능 ([084c67c](https://github.com/plzhans/hans-app/commit/084c67cfd6f9713b1677a46b902c345ba319a80c))
* **community:** 게시판·글 소프트 삭제와 복구, 캐싱 탭 ([24b8d74](https://github.com/plzhans/hans-app/commit/24b8d74561c6bbcb54f4daa4862797d4454627d0))
* **community:** 좋아요 스위치와 글의 "게시판 따름" 설정 ([5bb2794](https://github.com/plzhans/hans-app/commit/5bb27948664f3b6cbcb9fae57f66c148e33b3c03))
* **community:** 포털 노출 다듬기와 콘솔 보기/편집 분리 ([e46eb67](https://github.com/plzhans/hans-app/commit/e46eb67189bb819b6421b204c26972c37b04d111))
* **deploy:** 이름이 안 맞는 요청을 받는 기본 서버를 둔다 ([ea52137](https://github.com/plzhans/hans-app/commit/ea521370dd185e2e27ca27244fe8437a060fb4d6))
* **legal:** 약관 주소를 /terms 로 모으고 앱 등록에 API 약관 동의를 받는다 ([e8608d7](https://github.com/plzhans/hans-app/commit/e8608d7f33eadd5159d3858474bcf2876019baed))
* **medifinder:** 로그인을 붙인다 ([6fff062](https://github.com/plzhans/hans-app/commit/6fff06246926855930adac52f48214f086b40a44))
* **swagger:** 문서 대상을 @ApiController 로 선언한다 ([79837b9](https://github.com/plzhans/hans-app/commit/79837b9d13bc6996c38f7270ad2f7c86e6d90237))
* **user:** 로그인 기기 관리와 내 정보 캐시 ([615a0c3](https://github.com/plzhans/hans-app/commit/615a0c3ffd9a4a7132b3d5ced86c2926864422e8))


### 버그 수정

* **api:** swagger CLI 플러그인을 걷어낸다 ([fac1b06](https://github.com/plzhans/hans-app/commit/fac1b066608f770c7e51e91b13c3a47a1fb816a7))
* **api:** 토큰 교환의 프리플라이트를 막지 않는다 ([18af632](https://github.com/plzhans/hans-app/commit/18af632f8b4c9b46be45b5783543a8d7dabf0340))
* **auth:** 검증 안 된 소셜 이메일로 가입을 막지 않는다 ([d7cd688](https://github.com/plzhans/hans-app/commit/d7cd688588c59457c529c408ac044c9a76fa3e34))
* **auth:** 외부 앱으로 소셜 로그인해도 HansApp 에 로그인된다 ([dfd5913](https://github.com/plzhans/hans-app/commit/dfd5913e65cea38812ef15193fd46936fbe4e746))
* **batch:** EventPublisherModule 을 등록한다 ([80d46c1](https://github.com/plzhans/hans-app/commit/80d46c1e9fb921156029a4901d6c1b9d0bfc022c))
* **board:** 글 상세 조회의 반환 타입을 명시한다 ([b6e7092](https://github.com/plzhans/hans-app/commit/b6e7092797cd5d45deb99531ec7550943be87270))
* **config:** develop issuer 를 API 오리진으로 맞춘다 ([b9fbf92](https://github.com/plzhans/hans-app/commit/b9fbf92864fe0399a2d7e2b1ba6dd5c2898b18e0))
* **docs:** auth 태그를 토큰 페이지로 잇는다 ([db17671](https://github.com/plzhans/hans-app/commit/db176719f8487fb4edf8b37a99e708888540027e))
* **openapi:** 스펙을 뽑고 프로세스를 끝낸다 ([041461f](https://github.com/plzhans/hans-app/commit/041461fcf43faf55a05b10851868b59036e5947d))


### 성능

* **oauth:** well-known 응답을 캐시한다 ([6a4fdd0](https://github.com/plzhans/hans-app/commit/6a4fdd02b6f4a3163745ace8f276febf709083f0))


### 구조 변경

* **admin:** 정비 화면의 규모를 갈래마다 따로 센다 ([cfb972a](https://github.com/plzhans/hans-app/commit/cfb972a514270bbb3b772ab1fd3e2c310d52e0c8))
* **api:** CORS 판정을 클라이언트 ID 하나로 좁힌다 ([9ffcea5](https://github.com/plzhans/hans-app/commit/9ffcea5f903450ab108099b4bdc78db27caf603a))
* **page:** Page.map 으로 목록 변환을 조회 자리에 붙인다 ([ca5cf40](https://github.com/plzhans/hans-app/commit/ca5cf40bbb0a71fc8de33e2983fd794162d643e8))


### 문서

* **krdata:** 운영계정 신청 문안과 첨부 화면을 남긴다 ([193dee7](https://github.com/plzhans/hans-app/commit/193dee72c4784a861868de98667306c9f375af3a))
* **oauth:** discovery·JWKS 를 스웨거에 노출한다 ([eacf59b](https://github.com/plzhans/hans-app/commit/eacf59b4828eb6ca6a5847b419260ac5838f555a))

## [0.15.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.14.1...release-backend/v0.15.0) (2026-08-10)


### 기능

* **admin:** 관리자 API 와 콘솔 화면을 만든다 ([ca2c9df](https://github.com/plzhans/hans-app/commit/ca2c9dfb549e31a1a367bb3ccb52e5a68937c9ba))
* **admin:** 앱 승인·거절·차단 #deploy ([f07b527](https://github.com/plzhans/hans-app/commit/f07b527c7c433e91d19655f7bfc12ea832c28c56))
* **admin:** 인증·LLM 로그 조회 화면 ([65a21aa](https://github.com/plzhans/hans-app/commit/65a21aa99115d98026ebb3225a7ff5bfa6ad0aca))
* **admin:** 회원 인증 기록을 관리 콘솔에서 본다 ([c7ced5e](https://github.com/plzhans/hans-app/commit/c7ced5e23f1b6bbfc2bf928d4d2d9f9876277290))
* **auth:** 회원·관리자에 국가·언어·시간대를 둔다 ([21480d5](https://github.com/plzhans/hans-app/commit/21480d56166fc160a3bfad593d27684b8f4e9479))
* **config:** yaml 값을 경로 이름의 환경변수가 덮는다 ([24157ae](https://github.com/plzhans/hans-app/commit/24157aee25b0d9916435520c67b66d8b9ccb6784))
* **deploy:** nginx 설정을 배포가 같이 나른다 #deploy ([03d95d8](https://github.com/plzhans/hans-app/commit/03d95d8e2eb0ec440154f487f06cbc3a62e6a0f0))
* **deploy:** 관리자 콘솔을 배포 구간에 넣는다 ([73c3b1b](https://github.com/plzhans/hans-app/commit/73c3b1b0cfd6ba22a1feb8915635297ea3ef1497))
* **llm:** LLM 설정과 키를 화면에서 관리한다 ([6398443](https://github.com/plzhans/hans-app/commit/6398443055ae5d2f0cd1e487326aa357bb7de400))
* **llm:** 모델을 목록으로 관리한다 ([14d0563](https://github.com/plzhans/hans-app/commit/14d0563c4718cd8b8acdc5600bbf9e1358d342a0))
* **setting:** 서비스 설정을 관리 화면에서 관리한다 ([e9444ec](https://github.com/plzhans/hans-app/commit/e9444ec53af1019fe8685004dd109beb5f046624))
* 관리자 콘솔과 배포, 설정 정본화 ([#41](https://github.com/plzhans/hans-app/issues/41)) #deploy ([edf260c](https://github.com/plzhans/hans-app/commit/edf260ce88d5d616b5b27607afd409889ab456e8))


### 버그 수정

* **admin:** 호스트 이름을 develop-admin 으로 맞추고 API 주소를 비운다 #deploy ([509c073](https://github.com/plzhans/hans-app/commit/509c073049d71a77b93981b8e108ef079559e4b8))
* **http:** IPv4 접속은 IPv4 로 기록한다 #deploy ([021846d](https://github.com/plzhans/hans-app/commit/021846ddc36ff78381ac28b47250f5af067c8e40))


### 구조 변경

* **config:** 설정을 config.yaml 정본 하나로 모은다 ([68c1d0b](https://github.com/plzhans/hans-app/commit/68c1d0ba56aa3e5dae7ebbda27bb0a7c657fb4bd))
* **deploy:** 업그레이드 map 을 shared 로 모은다 #deploy ([994c18d](https://github.com/plzhans/hans-app/commit/994c18dd79b222638dae39e53ad1e7266db536de))
* **mail:** 발송기를 분리하고 설정을 DB 로 옮긴다 ([e16b901](https://github.com/plzhans/hans-app/commit/e16b901568ed8050c2c944e723310261ef0137c7))
* **setting:** OAuth 키를 DB 로 옮기고 설정 파일 폴백을 걷어낸다 ([11b4cab](https://github.com/plzhans/hans-app/commit/11b4cab04431f9ef55bc8091a391142bb3b0661b))
* **setting:** 공공데이터·도로명주소 키를 DB 로 옮긴다 ([ba7149b](https://github.com/plzhans/hans-app/commit/ba7149b912107f619d482ff667fc286662817ed0))
* **setting:** 업무 계층은 DB 만 읽고, 없음과 빈 값을 가른다 ([fb0c6fc](https://github.com/plzhans/hans-app/commit/fb0c6fc616825ee059056c14238e9dd5a177bf7f))

## [0.14.1](https://github.com/plzhans/hans-app/compare/release-backend/v0.14.0...release-backend/v0.14.1) (2026-08-07)


### 버그 수정

* **auth:** 소셜 로그인 실패를 인증웹으로 돌려보낸다 #deploy ([75e0816](https://github.com/plzhans/hans-app/commit/75e0816381ca200f6394ef69d06653500a6a3349))
* **auth:** 소셜 실패를 로그인 화면에서 보여준다 #deploy ([10991ec](https://github.com/plzhans/hans-app/commit/10991ec9a2b9409dae94669fc3e947a5674be7ea))

## [0.14.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.13.0...release-backend/v0.14.0) (2026-08-07)


### 기능

* **ai-search:** LLM 사용량 기록 테이블 ([9df84f6](https://github.com/plzhans/hans-app/commit/9df84f6cf1abf799befe2ddbe4b2b3d12f124260))
* **ai-search:** 대화 문맥 잇기 — 직전 조건과 앞선 대화 ([40da5d6](https://github.com/plzhans/hans-app/commit/40da5d64be5129259dca009186c464397e6c8c61))
* **ai-search:** 사용량을 토큰 단위로 세고 GET /ai/quota 추가 ([3925162](https://github.com/plzhans/hans-app/commit/39251625ea9484470809e2d0d4f11ae81334cce8))
* **ai-search:** 의학 질문 분리 · /test 답변 모드 ([8613e4e](https://github.com/plzhans/hans-app/commit/8613e4e1bfb4f899e597d348eda9ba2e9f416b9f))
* **ai-search:** 자연어 병원 검색 ([d0b1bd3](https://github.com/plzhans/hans-app/commit/d0b1bd39af0cc9621ee6b93ffda31a185f14378b))
* **ai-search:** 채팅 입력을 여러 줄로 ([c699485](https://github.com/plzhans/hans-app/commit/c699485a5795bac3fef07a89c5b2fcf3c3e41517))
* **ai-search:** 하루 사용량 상한 · 추적 id ([ce8d2fe](https://github.com/plzhans/hans-app/commit/ce8d2feb93608c67df3f1291b7a5d67d1c4f8e2d))
* **ai-search:** 화면 이동·새로고침에도 대화 유지 ([ff1e31b](https://github.com/plzhans/hans-app/commit/ff1e31b2f72503511b5d51133d6622f841f93a6e))
* **ai:** GET /ai/capabilities — 사용량과 고를 수 있는 모델 ([79640b6](https://github.com/plzhans/hans-app/commit/79640b6a3f014034ee1c12f5fbf751c014c37d2f))
* **apps:** 앱별 LLM 업체 키 등록 ([8a8ad79](https://github.com/plzhans/hans-app/commit/8a8ad7910221ce35495d6160d764d4093cb77064))
* **auth:** 가입 동의를 서버에서 검증하고 기록 ([4abaf7e](https://github.com/plzhans/hans-app/commit/4abaf7eb36781ddc3140cc35b0123140c881db0b))
* **auth:** 로그인 기기 목록과 개별 로그아웃 ([6f200f1](https://github.com/plzhans/hans-app/commit/6f200f1a8f4589b94eb1ffb6ae9775bb430d7ec4))
* **auth:** 로그인 상태 유지 체크박스 ([33f3689](https://github.com/plzhans/hans-app/commit/33f3689b8b743bcede13fdb165d26d0b53142873))
* **auth:** 마이페이지 열람 - 계정 정보·소셜 연동·동의 내역 ([70ee11a](https://github.com/plzhans/hans-app/commit/70ee11a3a3a9343d3482fa3c94a3057840171d46))
* **auth:** 마이페이지 정보 수정 - 이름·비밀번호 ([3633621](https://github.com/plzhans/hans-app/commit/3633621c4dc72c40ab71b042e529ab9636501c78))
* **auth:** 소셜 로그인에도 "로그인 상태 유지" 반영, 모든 기기 로그아웃 추가 ([4e07a3b](https://github.com/plzhans/hans-app/commit/4e07a3b4006cea8dc51f7c18383eea82526663de))
* **auth:** 소셜 전용 계정에 비밀번호 재설정 안내 메일 ([6c0965d](https://github.com/plzhans/hans-app/commit/6c0965df2c777607f981fe4e9b880dd90804d5a0))
* **batch:** 만료 세션 정리 크론(session-cleanup) ([f6309ca](https://github.com/plzhans/hans-app/commit/f6309caece65e62299bc9fca5d3f109dec249273))
* **batch:** 인증 부산물 정리 크론(auth-cleanup) ([de393c4](https://github.com/plzhans/hans-app/commit/de393c49b4dc2ac32bd103019beab5867d7030b6))
* **event:** 도메인 이벤트 발행 계층과 세션 상한 리스너 ([ab700ee](https://github.com/plzhans/hans-app/commit/ab700ee424636286d854be67490d0f3a2c53046d))
* **event:** 발행·소비 패키지 분리, 큐(BullMQ) 전환 ([c61cabe](https://github.com/plzhans/hans-app/commit/c61cabe9ae7f0bcc1ffe7be78e86648ac02780eb))
* **healthcare:** 자연어 질문을 검색 조건으로 옮기는 AI 검색 ([0111795](https://github.com/plzhans/hans-app/commit/011179505a6df85016bfad88daf826e26ed0c843))


### 버그 수정

* **ai-search:** AiSearchHistoryTurn 를 export 에 추가 #be-deploy ([8bb84c1](https://github.com/plzhans/hans-app/commit/8bb84c168b5b6b7a1f8075da6b6ec176afd98506))
* **ai-search:** 서비스 프롬프트를 api 이미지에 굽는다 #be-deploy ([45c0ca8](https://github.com/plzhans/hans-app/commit/45c0ca80ca66330539b2752ca957ea02b2fe09c2))
* **api:** AI 스펙 누락 보완 ([1fffb5d](https://github.com/plzhans/hans-app/commit/1fffb5de47cc5f2d31771141d8c70f1e76e70f89))
* **auth:** ConsentService 를 모듈 exports 에 추가 ([2c81858](https://github.com/plzhans/hans-app/commit/2c818583bd22bfc3a55bf402addc1a9af96cc02d))
* **auth:** 소셜 콜백에서 이메일·티켓을 fragment 로 옮김 ([3b91f7a](https://github.com/plzhans/hans-app/commit/3b91f7ac1ab38fa0a4da6732869aa1e3d86dd55f))
* **auth:** 쿠키 접두사를 환경 이름에서 유도 ([ee08f13](https://github.com/plzhans/hans-app/commit/ee08f134588a3897025be940d3744d00774cd8fc))
* **config:** ${VAR:기본값} 을 Spring 규칙으로 통일 ([f11d8fa](https://github.com/plzhans/hans-app/commit/f11d8fa3fa8eacc617b844220fe58d014c219cac))
* **config:** yaml 에 bash 문법 ${VAR:-기본값} 이 있으면 부팅 거부 ([39364d3](https://github.com/plzhans/hans-app/commit/39364d3b356360976c6c5e52a0411260ee3799cf))
* **legal:** 오라클 국외이전 반영, 나이 확인 체크 제거, 위치정보 보유 조항 정정 ([6c4df0d](https://github.com/plzhans/hans-app/commit/6c4df0dceb76713ef733b729b29df354c8cb5bae))
* **llm:** zod 를 의존성에 명시 #be-deploy ([7d34cc1](https://github.com/plzhans/hans-app/commit/7d34cc18ba8829fbbca6c4d1c4d527befe3b6e7d))


### 구조 변경

* **auth:** 세션 상한 정리를 application 계층으로 옮김 ([01e5a88](https://github.com/plzhans/hans-app/commit/01e5a8887105c840cea66c0588058e4bab85d260))
* 인증/유저 API 분리, 계정 알림 메일, 앱관리 PC 레이아웃 ([40907ac](https://github.com/plzhans/hans-app/commit/40907ac70ec92cfe1be92620ec677b3fbcad0f3e))


### 문서

* **api:** 스펙 설명문을 명세서 문체로 정리 ([3b8e821](https://github.com/plzhans/hans-app/commit/3b8e8211e937b458dc761282e94aa07542995faa))

## [0.13.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.12.0...release-backend/v0.13.0) (2026-08-05)


### 기능

* **healthcare:** 거리순 정렬과 지도 영역(bbox) 검색 ([f6f0d3f](https://github.com/plzhans/hans-app/commit/f6f0d3ffa5d9d73881e07af372bd28191044b527))
* **healthcare:** 페이지 검색도 ES로 (홈 목록 정렬 통일) ([5b02711](https://github.com/plzhans/hans-app/commit/5b0271105076d2ef57cb193fa71170e9018f7266))
* medifinder 앱 스타일 개편 + 거리·지도 영역 검색 ([75fcbc9](https://github.com/plzhans/hans-app/commit/75fcbc97f2b039155a179ff4cb45dd42058843c5))
* 기본 정렬을 시도 순으로 — sido_rank 색인 필드 ([f62c70d](https://github.com/plzhans/hans-app/commit/f62c70d1b22e7556f248af4c4388424601ddc246))


### 구조 변경

* compose 의 migrate 서비스를 hansapp-cli 로 바꾼다 ([90c4d75](https://github.com/plzhans/hans-app/commit/90c4d7506e41f0c620655c9b07fea507d3800a1a))

## [0.12.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.11.0...release-backend/v0.12.0) (2026-08-04)


### 기능

* 근처 병원 기본 개수를 6개로 늘린다 ([954aac7](https://github.com/plzhans/hans-app/commit/954aac7c3f359df3f7a80e5b42707d288c1937ea))
* 근처의 비슷한 병원을 찾는 API 를 추가한다 ([083d77f](https://github.com/plzhans/hans-app/commit/083d77f6a98399e996402c1e6f91721d81609945))
* 내 위치로 지역을 찾아 검색한다 ([8388f4e](https://github.com/plzhans/hans-app/commit/8388f4e47657b9e64cdafb20029dc7e1eeea7c81))
* 법정동코드를 로컬 DB 에 동기화한다 ([e7abb5e](https://github.com/plzhans/hans-app/commit/e7abb5ec572ea62dc9143ae10223c2891df1c248))
* 병원 이름에서 법인 표기를 뗀다 ([d6ad305](https://github.com/plzhans/hans-app/commit/d6ad30522b28f54d75caa203808eaa5b3db11111))
* 부팅 때 MySQL·Redis·ES 접속을 확인한다 ([a8ca881](https://github.com/plzhans/hans-app/commit/a8ca881f22c0438a09b435ea4db5231225b57f79))
* 브이월드 지오코딩 클라이언트를 추가한다 ([89990f9](https://github.com/plzhans/hans-app/commit/89990f9e62ee37fb51038fe0c56c6339193042a1))
* 지역 영문 이름을 채우고 일본어·중국어를 영어로 폴백한다 ([1bcfd70](https://github.com/plzhans/hans-app/commit/1bcfd70e25162a7e60b59531fa1697832b0496db))
* 진료과목 검색에서 전문의 있는 병원을 위로 올린다 ([6c489e3](https://github.com/plzhans/hans-app/commit/6c489e383af649f8262ba719728cdb7d8f91b6e1))
* 행정안전부 법정동코드 API 클라이언트를 추가한다 ([7029fce](https://github.com/plzhans/hans-app/commit/7029fced4ef9f5c6e210986aa84ce1b0e49317ba))


### 버그 수정

* 소셜 로그인 경로 변수를 스펙에 선언한다 ([d7cb602](https://github.com/plzhans/hans-app/commit/d7cb602cc2dfc52b352addc9340edd47456f3181))
* 약국·NMC 기타를 통합 병원에서 뺀다 ([d4b1946](https://github.com/plzhans/hans-app/commit/d4b1946b5a9ce21b3a15ffd33927bd646c2b8598))
* 인증서 경로에 파일이 없으면 부팅을 멈춘다 ([cf0f536](https://github.com/plzhans/hans-app/commit/cf0f536506d54ad16efbc3ff2c6d756a4f176ac2))


### 구조 변경

* ES 인덱스 접두사를 ELASTICSEARCH_INDEX_PREFIX 로 뺀다 ([a9862eb](https://github.com/plzhans/hans-app/commit/a9862ebf6965e236b81deb5b64207ba34d7f280d))
* 토큰 만료 기본값을 코드로 옮긴다 ([6cf019c](https://github.com/plzhans/hans-app/commit/6cf019c5756574dfc6708923806afd261aa3d541))

## [0.11.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.10.0...release-backend/v0.11.0) (2026-07-31)


### 기능

* redis 를 앱 compose 안으로 넣어 배포가 같이 띄우게 한다 ([769f6ae](https://github.com/plzhans/hans-app/commit/769f6aedbb4a2548be4727cb0020d290db33beb5))


### 구조 변경

* elasticsearch 를 infra/shared 로 올린다 ([0c57d0b](https://github.com/plzhans/hans-app/commit/0c57d0b1f243ca575044275935180367d47c3dea))

## [0.10.0](https://github.com/plzhans/hans-app/compare/release-backend/v0.9.0...release-backend/v0.10.0) (2026-07-31)


### 기능

* 배포 알림을 운영과 프론트로 넓힌다 #deploy ([c9ab041](https://github.com/plzhans/hans-app/commit/c9ab041304c1bad6d94edb5e4e68640adeea9585))


### 버그 수정

* 환경마다 쿠키 이름을 가른다 ([7da3c1a](https://github.com/plzhans/hans-app/commit/7da3c1a76dc0eb382e5d2eadbed5aaaa1a53dd43))


### 구조 변경

* 소셜 콜백 착지를 client_id 기준으로 가른다 ([1e27bd9](https://github.com/plzhans/hans-app/commit/1e27bd9e330593e6fd9df5c11798094fe8faa402))


### 문서

* 배포 슬랙 알림을 문서에 남긴다 ([73ce747](https://github.com/plzhans/hans-app/commit/73ce74797c6db2113011cddba86667dae19c6590))

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
