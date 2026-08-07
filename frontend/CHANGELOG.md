# Changelog

## [0.6.0](https://github.com/plzhans/hans-app/compare/release-frontend/v0.5.0...release-frontend/v0.6.0) (2026-08-07)


### 기능

* **ai-search:** 모델 이름을 표준 표기로, 목록은 서버에서 ([c4957b7](https://github.com/plzhans/hans-app/commit/c4957b721520374e0fa344dcea577ac0b7048cb0))
* **ai-search:** 의학 질문 분리 · /test 답변 모드 ([8613e4e](https://github.com/plzhans/hans-app/commit/8613e4e1bfb4f899e597d348eda9ba2e9f416b9f))
* **ai-search:** 자연어 병원 검색 ([d0b1bd3](https://github.com/plzhans/hans-app/commit/d0b1bd39af0cc9621ee6b93ffda31a185f14378b))
* **ai-search:** 채팅 입력을 여러 줄로 ([c699485](https://github.com/plzhans/hans-app/commit/c699485a5795bac3fef07a89c5b2fcf3c3e41517))
* **ai-search:** 채팅이 앞선 대화를 물고 간다 ([0d45f14](https://github.com/plzhans/hans-app/commit/0d45f14f4fe285dfce7fc91f39b402f5e5186935))
* **ai-search:** 채팅창에 사용량 표시와 복사 버튼 추가 ([bf6a3d9](https://github.com/plzhans/hans-app/commit/bf6a3d92514ed59305b62d225da64c5824d68524))
* **ai-search:** 하루 사용량 상한 · 추적 id ([ce8d2fe](https://github.com/plzhans/hans-app/commit/ce8d2feb93608c67df3f1291b7a5d67d1c4f8e2d))
* **ai-search:** 화면 이동·새로고침에도 대화 유지 ([ff1e31b](https://github.com/plzhans/hans-app/commit/ff1e31b2f72503511b5d51133d6622f841f93a6e))
* **apps:** 앱별 LLM 업체 키 등록 ([8a8ad79](https://github.com/plzhans/hans-app/commit/8a8ad7910221ce35495d6160d764d4093cb77064))
* **auth:** 가입 동의를 서버에서 검증하고 기록 ([4abaf7e](https://github.com/plzhans/hans-app/commit/4abaf7eb36781ddc3140cc35b0123140c881db0b))
* **auth:** 로그인 기기 목록과 개별 로그아웃 ([6f200f1](https://github.com/plzhans/hans-app/commit/6f200f1a8f4589b94eb1ffb6ae9775bb430d7ec4))
* **auth:** 로그인 상태 유지 체크박스 ([33f3689](https://github.com/plzhans/hans-app/commit/33f3689b8b743bcede13fdb165d26d0b53142873))
* **auth:** 마이페이지 열람 - 계정 정보·소셜 연동·동의 내역 ([70ee11a](https://github.com/plzhans/hans-app/commit/70ee11a3a3a9343d3482fa3c94a3057840171d46))
* **auth:** 마이페이지 정보 수정 - 이름·비밀번호 ([3633621](https://github.com/plzhans/hans-app/commit/3633621c4dc72c40ab71b042e529ab9636501c78))
* **auth:** 마이페이지 회원 탈퇴 ([56edee3](https://github.com/plzhans/hans-app/commit/56edee319c5165b57945085675e390814deff71b))
* **auth:** 마이페이지에 소셜 계정 연동 추가·해제 ([b84a514](https://github.com/plzhans/hans-app/commit/b84a5149d0d0d412dde0b9cefc8aa1248083b71a))
* **auth:** 비밀번호 찾기 입력창 자동 포커스 ([5c08d06](https://github.com/plzhans/hans-app/commit/5c08d065f1aa1a9c9696f0294bf3e55490680682))
* **auth:** 소셜 가입도 동의 화면을 거치게 ([bef5ff2](https://github.com/plzhans/hans-app/commit/bef5ff218428a811f9cf0be1ffd61fe2fb53ac9c))
* **auth:** 소셜 로그인에도 "로그인 상태 유지" 반영, 모든 기기 로그아웃 추가 ([4e07a3b](https://github.com/plzhans/hans-app/commit/4e07a3b4006cea8dc51f7c18383eea82526663de))
* **auth:** 탈퇴 전 재확인 단계 추가 ([52d15b0](https://github.com/plzhans/hans-app/commit/52d15b01b41939714b1f6bccd05641b176ff95a0))
* **docs:** AI·MCP 문서 추가, 문서 구조 정리 ([46b12d8](https://github.com/plzhans/hans-app/commit/46b12d8c7a35dd9b1226603204e3b895a8daa825))
* **hansapp-web:** HansApp 계정 약관·개인정보처리방침 추가 ([f553480](https://github.com/plzhans/hans-app/commit/f5534803f71e01e90d7ac4f8f8642731f257f7f8))
* **healthcare:** 자연어 질문을 검색 조건으로 옮기는 AI 검색 ([0111795](https://github.com/plzhans/hans-app/commit/011179505a6df85016bfad88daf826e26ed0c843))
* **legal:** 약관을 공유 패키지로 빼고 가입 화면에 동의 레이어 추가 ([e37dfe7](https://github.com/plzhans/hans-app/commit/e37dfe75f4b08089de704a94c28fc0268165b05d))
* **medifinder:** 약관에 HansApp API 경계 조항 추가 ([077b8c8](https://github.com/plzhans/hans-app/commit/077b8c8f070faba57b8599fc2110f6530aed95dd))
* **medifinder:** 이용약관·개인정보처리방침·위치기반서비스 약관 추가 ([cabae48](https://github.com/plzhans/hans-app/commit/cabae48c349b5609b5434564408d6a8ace0f9cf6))
* **web:** 앱 관리를 사용자 메뉴로 이동 ([79c7f3e](https://github.com/plzhans/hans-app/commit/79c7f3ed684caa28cf2aba901172cc02077dc125))
* **web:** 푸터 저작권 다섯 번 누르면 산출물 버전 표시 ([79d6cd4](https://github.com/plzhans/hans-app/commit/79d6cd451e765b9a0650289ea96b6dd572c6bb15))
* **web:** 헤더 로그인 영역을 사용자 메뉴로 ([9734706](https://github.com/plzhans/hans-app/commit/9734706d757d4b94eb6c5d2de46351844336fed4))


### 버그 수정

* **ai-search:** 창을 다시 열면 대화가 맨 위에서 시작하던 문제 ([d4e464b](https://github.com/plzhans/hans-app/commit/d4e464bca61276b2631e0153fc0e0c2ed59fc67a))
* **api:** 본문 없는 응답(202 등)에서 JSON 파싱 오류 ([224336d](https://github.com/plzhans/hans-app/commit/224336d2c0e076daee9dbf5166a75581bf21d231))
* **auth-sdk:** pending 을 fragment 에서 읽도록 ([1204889](https://github.com/plzhans/hans-app/commit/1204889f63e1dcd16608b6141e1e63f89a46850b))
* **auth:** 교차 오리진 요청에 쿠키가 오가지 않던 문제 ([82cdcb5](https://github.com/plzhans/hans-app/commit/82cdcb5e1ccb2816e5250f8e9c3cd0c800bc4150))
* **auth:** 단계 전환 시 입력값이 남는 문제 ([7fa46d4](https://github.com/plzhans/hans-app/commit/7fa46d4fd0639058270eab0ff018a088236ebdba))
* **auth:** 마지막 로그인 수단 안내를 실제 가능한 길로 ([b5ebcf1](https://github.com/plzhans/hans-app/commit/b5ebcf1d514dafdcc30e888607dbba2221d70539))
* **auth:** 소셜 로그인 실패를 인증웹으로 돌려보낸다 #deploy ([75e0816](https://github.com/plzhans/hans-app/commit/75e0816381ca200f6394ef69d06653500a6a3349))
* **auth:** 소셜 실패를 로그인 화면에서 보여준다 #deploy ([10991ec](https://github.com/plzhans/hans-app/commit/10991ec9a2b9409dae94669fc3e947a5674be7ea))
* **auth:** 소셜 연동 목록 아이콘을 브랜드 배지로 ([6909a7d](https://github.com/plzhans/hans-app/commit/6909a7d7040f4ebbd92603ff1ce23380c0d77e3e))
* **auth:** 소셜 콜백에서 이메일·티켓을 fragment 로 옮김 ([3b91f7a](https://github.com/plzhans/hans-app/commit/3b91f7ac1ab38fa0a4da6732869aa1e3d86dd55f))
* **clinic:** 넓은 화면 상세 앱바를 스크롤한 뒤에 내린다 ([3279a25](https://github.com/plzhans/hans-app/commit/3279a2564c32083b62e44a22d38123b9358c5411))
* **legal:** 연락처·연령 확인 문구 정정, jsDelivr 국외이전 추가 ([af98f4d](https://github.com/plzhans/hans-app/commit/af98f4dd64c61346b4f76edcd6a9644be72637ce))
* **legal:** 오라클 국외이전 반영, 나이 확인 체크 제거, 위치정보 보유 조항 정정 ([6c4df0d](https://github.com/plzhans/hans-app/commit/6c4df0dceb76713ef733b729b29df354c8cb5bae))
* **medifinder:** Sentry 로 나가는 URL 에서 좌표 지움 ([29724e9](https://github.com/plzhans/hans-app/commit/29724e9a0e7f1803dd202fdaa3bb725c994f13be))
* **medifinder:** 조회 실패를 빈 결과로 보여주던 문제 ([05e9554](https://github.com/plzhans/hans-app/commit/05e9554f9193fe27b7fd2565a5c8b3cc168219bd))
* **web:** 로그인 리다이렉트 뒤로가기 덫 제거, 부팅 화면 추가 ([3331d48](https://github.com/plzhans/hans-app/commit/3331d48bf35ca677d3dcc9a515e6180fc0f53a91))


### 구조 변경

* **auth:** 정보 수정을 별도 화면(/me/edit)으로 분리 ([5a18d58](https://github.com/plzhans/hans-app/commit/5a18d589005a5482eef2c548c2caa13558caec56))
* **auth:** 정보 수정을 한 폼·한 저장 버튼으로 ([616ff78](https://github.com/plzhans/hans-app/commit/616ff7838114a83d81d0f0e45c4bdc74c313882b))
* **medifinder:** ai-search 타입을 생성 코드로 교체 ([f980a25](https://github.com/plzhans/hans-app/commit/f980a252c31ed9999f6a2e9edf3edd998ca04fb6))
* 인증/유저 API 분리, 계정 알림 메일, 앱관리 PC 레이아웃 ([40907ac](https://github.com/plzhans/hans-app/commit/40907ac70ec92cfe1be92620ec677b3fbcad0f3e))


### 문서

* **legal:** 국외이전 표 앞에 설명 추가, 메일 발송 사업자 기재 ([a9e9513](https://github.com/plzhans/hans-app/commit/a9e951305ea696e132b87fbd105137be2afc14ef))

## [0.5.0](https://github.com/plzhans/hans-app/compare/release-frontend/v0.4.0...release-frontend/v0.5.0) (2026-08-05)


### 기능

* medifinder 앱 스타일 개편 + 거리·지도 영역 검색 ([75fcbc9](https://github.com/plzhans/hans-app/commit/75fcbc97f2b039155a179ff4cb45dd42058843c5))
* medifinder 화면을 앱 스타일로 개편 ([f9dfa20](https://github.com/plzhans/hans-app/commit/f9dfa201d78e59e98389c079f583ae364189c455))
* **search:** 가까운 순 정렬 ([4b19740](https://github.com/plzhans/hans-app/commit/4b1974068c2d95503e7cef569c4f8e7fa6a7c3c0))
* **search:** 지도 영역 검색(bbox) ([cf14d82](https://github.com/plzhans/hans-app/commit/cf14d826174257a5ca7ae9a125a09d5a12355e04))
* 검색에 지도 보기 추가 ([cb6462d](https://github.com/plzhans/hans-app/commit/cb6462d0973f02d86026a56e7a38e9911cabc9e6))
* 내 위치를 지역 채우기와 공유 스위치로 나눈다 ([3753f90](https://github.com/plzhans/hans-app/commit/3753f905814bda404e9077ed4fc901c902cb0289))


### 버그 수정

* **search:** 조회 실패 시 빈 결과 문구가 함께 뜨던 것 ([4a42385](https://github.com/plzhans/hans-app/commit/4a42385be6856bc532c5e70fe0bfa0c71290ba63))
* 검색 필터 안의 어긋난 표현을 맞춘다 ([d358a33](https://github.com/plzhans/hans-app/commit/d358a33b7f7e269691d1ba95fa49009fff84045a))


### 구조 변경

* 검색 화면을 상태·조건·결과로 나눈다 ([ab116a7](https://github.com/plzhans/hans-app/commit/ab116a7efdaf14274d7f25b40313e1fe618423e5))

## [0.4.0](https://github.com/plzhans/hans-app/compare/release-frontend/v0.3.1...release-frontend/v0.4.0) (2026-08-04)


### 기능

* 근처 병원 기본 개수를 6개로 늘린다 ([954aac7](https://github.com/plzhans/hans-app/commit/954aac7c3f359df3f7a80e5b42707d288c1937ea))
* 근처의 비슷한 병원을 지도에서 함께 본다 ([570c316](https://github.com/plzhans/hans-app/commit/570c3165af7d1ae41a71049b984c53321b0108a3))
* 내 위치로 지역을 찾아 검색한다 ([8388f4e](https://github.com/plzhans/hans-app/commit/8388f4e47657b9e64cdafb20029dc7e1eeea7c81))
* 병원 상세 하단에 근처의 비슷한 병원을 보여준다 ([51999d8](https://github.com/plzhans/hans-app/commit/51999d8e44bee1a1ff4ab35d5e99ccbac8e3ab7f))
* 병원 헤더에 법인명을 보여준다 ([b5ec2fc](https://github.com/plzhans/hans-app/commit/b5ec2fcc1e04ffe1c85138326f86551f8cdd4faf))


### 버그 수정

* 시도·시군구 셀렉트의 '전체' 가 번역된다 ([07187d4](https://github.com/plzhans/hans-app/commit/07187d45d3a5178bb65586c047db39d8c0ba1134))
* 위치를 Capacitor 플러그인으로 받는다 ([b56ae46](https://github.com/plzhans/hans-app/commit/b56ae4640c3ed290736c654d3052e17c74c54cb7))
* 주소 줄에서 병원 이름 중복을 없앤다 ([610f497](https://github.com/plzhans/hans-app/commit/610f4975ea9796055862b2370b8d0ad81e8b3c93))
* 홈에서 내 위치를 잡아도 바로 이동하지 않는다 ([a61be2f](https://github.com/plzhans/hans-app/commit/a61be2f4dbf066759655e0d9eb2031dc10c6a869))


### 구조 변경

* 근처 병원 순위를 A~E 색 표식으로 바꾼다 ([9908442](https://github.com/plzhans/hans-app/commit/99084423776894d047a7d9402053666fee7dcc9b))


### 문서

* 문서 기본 테마를 다크로 바꾼다 ([679b67e](https://github.com/plzhans/hans-app/commit/679b67e100486ff77c5418574bf4c8500a81a05d))
* 소개 페이지를 사이트 전체 기준으로 고쳐 쓴다 ([29fa22d](https://github.com/plzhans/hans-app/commit/29fa22ddff7f846942d9cb2206e46807d470c3ae))
* 인증·앱 관리 API 를 문서에서 감춘다 ([bd64f70](https://github.com/plzhans/hans-app/commit/bd64f708a6549dcb467ba01f78d146e5582d4381))

## [0.3.1](https://github.com/plzhans/hans-app/compare/release-frontend/v0.3.0...release-frontend/v0.3.1) (2026-07-31)


### 버그 수정

* 포털 상단 링크가 develop 에서도 운영으로 가던 것을 고친다 ([d5b6279](https://github.com/plzhans/hans-app/commit/d5b6279cb4b927b2002e6962970e68c014b48d11))
* 환경마다 쿠키 이름을 가른다 ([7da3c1a](https://github.com/plzhans/hans-app/commit/7da3c1a76dc0eb382e5d2eadbed5aaaa1a53dd43))


### 구조 변경

* access token 저장을 쿠키 이름 규칙에 맞춘다 ([5377d45](https://github.com/plzhans/hans-app/commit/5377d4558f2f3a347a53e46e58e779f5fd2ab3e4))
* 소셜 콜백 착지를 client_id 기준으로 가른다 ([1e27bd9](https://github.com/plzhans/hans-app/commit/1e27bd9e330593e6fd9df5c11798094fe8faa402))


### 문서

* .env.local 이 모든 환경에 딸려간다고 파일에 적는다 ([dbd901c](https://github.com/plzhans/hans-app/commit/dbd901cef24ac93db7abf5630b24389087887b82))
* 인증 포털을 인증웹으로 바로잡는다 ([1891c77](https://github.com/plzhans/hans-app/commit/1891c778bdd1cd4b840ff503097e1f7effba4d6f))

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
