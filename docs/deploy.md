# 백엔드 배포

## 한 줄 요약

**버전이 붙는 것은 이미지뿐이다.** 배포 스크립트·compose·설정은 항상 main 것을 쓴다.

```
이미지            v0.5.0        고정 — 이것이 "무엇을 배포했나"
scripts/deploy/   main 최신     배포 도구. 릴리스의 일부가 아니다
compose·config    main 최신     서버와 이미지 사이의 계약
```

배포 도구를 릴리스에 묶으면 나중에 고친 버그가 옛 태그에서 되살아난다. 도구는 계속
나아지는 물건이라 고정할 이유가 없다. 설정이 이미지와 어긋날 위험은 **같은 이미지를
develop 에 먼저 올려보는 것**으로 막는다.

> 그래서 develop 은 실행 ref 를 고를 일이 없다 — 항상 main 이다. production 만 릴리스
> 태그를 골라 그 조합 전체를 되짚는다.

---

## 전체 흐름

**`main.yml` 은 develop 에 관한 전부다.** production 으로 가는 길이 없다.
프론트와 백엔드가 한 실행 안에서 나란히 돈다.

```
main                          main 푸시 · PR · 수동
├─ plan                       변경 경로로 대상을 가른다
├─ first_notify               슬랙 카드 게시 → ts 를 아래로 흘린다
│
├─ fe_build ─────┐            fe-build.yml 호출 → dist 아티팩트
├─ be_build ─────┤            도커 밖에서 install → build → lint → out.tar.zst
│                │
├─ ══ gate ══════┘            **승인 1번.** fe·be 둘 다 여기서 풀린다
│
├─ docker-image-push          산출물을 COPY 만 → :develop · :develop-<sha>
├─ be_deploy                  be-deploy-develop.yml 호출
├─ fe_deploy                  fe-deploy-develop.yml 호출
└─ report                     always() — 스레드에 최종 결과
```

**관문 앞에서는 아무 흔적도 남기지 않는다.** 빌드만 하고 아티팩트는 하루면 사라진다.
이미지를 굽는 것과 서버를 건드리는 것은 전부 관문 뒤라, 승인하지 않고 버려도 손해가 없다.

배포 자체는 별도 워크플로가 갖는다. **어디서 부르든 같은 동작이라** 사람이 직접 돌릴 수도
있다 — 그때가 곧 "설정만 배포" 다.

```
be-deploy-develop.yml    workflow_call(main.yml) · workflow_dispatch(단독)
├─ gate                  관문. main.yml 에서 이미 승인했으면 그냥 통과한다
└─ deploy                scripts/deploy/ 의 단계들을 순서대로 부른다
```

**검사와 빌드가 한 잡이다.** 둘 다 같은 install·같은 컴파일을 필요로 하는데, 나누면
워크스페이스 install 과 tsc 를 두 번 돌리게 된다 — 이 파이프라인에서 제일 비싼 두 단계다.

**평소 푸시는 `verify · build` 에서 멈춘다.** CI 로서 볼 것은 "빌드가 깨지지 않는가" 뿐이라
안 쓸 이미지를 매번 레지스트리에 올리지 않는다.

커밋 메시지에 `#deploy` 나 `#be-deploy` 가 있으면 `image` 부터 이어진다. 없으면 나중에
이 워크플로를 수동 실행(`stage=deploy`)하면 되고, **그 실행이 자기 이미지를 스스로 굽는다** —
미리 만들어 둘 필요가 없다.

**`verify` 는 PR 로 들어온 것을 다시 검사하지 않는다.** PR 에서 이미 돌았고, 그때 본 것이
"병합했을 때의 상태" 이기 때문이다(GitHub 이 base 와 합쳐 만든 커밋). 병합 커밋(부모가 둘
이상)이면 건너뛴다.

main 에 **직접 푸시**한 것은 검사한 적이 없으므로 반드시 돈다 — 그쪽이 이 잡의 요점이다.

**연달아 밀어 넣으면 앞의 실행은 취소된다.** 마지막 푸시만 보면 되기 때문이다. 다만 배포까지
가는 실행은 끊지 않는다 — 중간에 죽으면 서버가 반쯤 갱신된 채로 남는다.

그래서 동시성 그룹을 둘로 가른다. **취소는 같은 그룹 안에서만 일어나므로 이것이 유일한 방법이다.**

```
main-ci-<ref>   검사만 하는 실행. 새 푸시가 앞의 것을 취소한다
main-deploy     배포까지 가는 실행. 취소하지 않고 서로 줄을 선다
```

서버를 건드리는 쪽은 **한 겹 더** 잠근다. WireGuard 피어는 같은 키로 두 곳에서 붙을 수
없어서, 배포 워크플로 자체가 `be-server-develop` 그룹을 갖는다.

> `cancel-in-progress` 는 **"내가 취소당할까" 가 아니라 "내가 남을 취소할까"** 다. 새로 들어온
> 실행 기준으로 평가되기 때문에, 한 그룹에 섞어 두면 평범한 푸시가 배포 중인 실행을 죽인다.

---

## 슬랙 알림

**배포 하나가 스레드 하나다.** 채널에는 카드 한 장만 남고 진행 상황은 그 밑에 쌓인다.
be·fe·develop·production 이 모두 같은 채널에 뜨므로 제목에 무엇의 배포인지가 들어간다.

```
🚀  백엔드 develop 배포 시작
    └ `edffafe`  fix: 쿠키로 끝난 소셜 로그인을…
      요청 plzhans  ·  실행 로그
    └ 빌드하는 중
    └ 도커 이미지를 굽는 중
    └ DB 스키마를 반영하는 중
    └ 서버에 반영하는 중
    └ 🛑 hansapp-api 종료 · 가동 2시간          앱이 스스로
    └ ✅ 백엔드 배포 완료
    └ 🚀 hansapp-api 시작 · 0.8.0+edffafe      앱이 스스로 · 채널에도 뜬다
```

### 알림은 배포를 막지 않는다

토큰이 없거나 슬랙이 죽어 있으면 `first_notify` 가 빈 ts 를 내보내고, 그것을 보는 쪽이
전부 조용히 지나간다. 카드 조립이 실패해도 그 스텝은 `continue-on-error` 라 잡은 성공한다 —
**슬랙 설정 하나 때문에 배포가 막히면 안 된다.**

로컬 배포(`scripts/deploy/deploy.sh`)에는 토큰이 없으므로 아무것도 안 보낸다. 그때는 경고도
찍지 않는다 — CI 안에서만 "설정이 빠졌다" 고 알린다.

### 관문

`gate` 잡은 **하는 일이 없다 — 존재하는 것이 일이다.** `develop-deploy` environment 의
보호 규칙(승인자)이 여기 걸리고, 이미지 굽기와 배포가 전부 여기에 매달려 있다.

```
plan ─┬─ fe_build ─┐
      ├─ be_build ─┴─ gate ─┬─ docker-image-push → be_deploy
      └─ first_notify       └─ fe_deploy
```

- **시크릿이 없는 빈 환경이다.** 잡은 environment 를 하나만 가질 수 있는데, 실제 배포
  잡은 SSH 키·Cloudflare 토큰이 있는 `develop` 을 써야 한다. 관문을 거기 걸면 시크릿을
  복제해야 하고 두 벌이 어긋날 자리가 생긴다. 관문만 따로 떼면 그 문제가 사라진다.
- **승인은 (실행 × 환경) 단위로 기억된다.** `be-deploy-develop.yml`·`fe-deploy-develop.yml`
  도 같은 환경으로 관문을 하나씩 갖지만, 같은 실행 안에서는 **클릭이 한 번이다.**
- **이미지 굽기 앞에 둔다.** 뒤에 두면 승인하지 않을 것을 굽게 된다.
- **`#deploy` 마커를 없애지 않은 이유.** 관문과 역할이 겹쳐 보이지만, 마커를 빼면 매
  푸시마다 승인 대기 중인 노란 실행이 쌓인다(30일 매달린다). 마커는 "이건 배포할
  커밋이다" 는 표시이고, 관문은 "지금 나가도 되나" 의 최종 확인이다.

> **지금은 승인자가 설정돼 있지 않다.** 환경만 만들어 두고 보호 규칙은 비워 뒀으므로
> 관문이 그냥 통과한다. 켜려면 Settings → Environments → `develop-deploy` →
> Required reviewers. environment 승인은 PR 리뷰와 달리 **자기가 자기 걸 승인할 수 있다.**

### 채널로 내보내는 것

`chat.update` 로 카드를 고치는 대신 **답글을 채널에도 띄운다**(`reply_broadcast`). 스레드를
열지 않아도 보여야 하는 **결론에만** 쓴다 — 전부 띄우면 스레드로 묶은 의미가 없다.

| | 채널로 |
| --- | --- |
| develop 백엔드 | 실패·취소만. 성공은 앱 기동 알림이 이미 뜬다 |
| develop 프론트 | 성공도. 기동 알림을 보내는 앱이 없다 |
| production | 성공도. 나갔다는 사실 자체가 걸려야 한다 |

### 앱이 스레드에 답글을 단다

`docker compose up` 때 스레드 ts 를 넘기면 앱이 기동 알림을 그 스레드에 붙인다. 스레드의
마지막 줄이 CI 의 추측이 아니라 **앱 본인의 말**(버전·sha 포함)이 된다.

```
main.yml first_notify → ts
  → be-deploy-develop.yml 의 slack_thread 입력
    → stage/app-start.sh 가 `docker compose up` 앞에 붙임 (서버 .env 에는 안 남긴다)
      → compose 의 api 서비스 environment (batch·migrate 는 제외)
        → config.<환경>.yaml 의 slack.deployThreadTimestamp
```

**값은 컨테이너에 구워진다.** 재부팅이나 크래시 재시작에서도 살아남으므로, 사흘 뒤에 그냥
재시작한 프로세스가 옛 스레드에 답글을 달 수 있다. 그래서 앱이 **ts 의 나이를 보고 10분이
넘으면 무시한다** — 슬랙 ts 자체가 epoch 라 배포 시각을 따로 넘길 필요가 없다.

### 설정

| | 어디에 |
| --- | --- |
| `SLACK_BOT_TOKEN` | `develop`·`production` **environment secret**. 환경마다 다른 슬랙 앱이다 |
| `SLACK_CHANNEL` | 같은 environment 의 variable |

봇에 `chat:write` 스코프가 있어야 하고 채널에 초대돼 있어야 한다. 초대가 안 돼 있으면
`not_in_channel` 로 조용히 실패한다(배포는 정상 진행).

> **채널은 id(`C…`) 를 권한다.** 지금은 이름이라 채널명을 바꾸면 첫 게시가 깨진다.
> 카드를 고치거나 답글을 다는 쪽은 첫 게시 응답에서 받은 id 를 쓰므로 이미 안전하다.

### 함정

**`chat.update` 는 채널 이름을 받지 않는다. id 만 받는다.** `chat.postMessage` 는 `#이름` 을
해석해 주기 때문에 첫 게시만 되고 갱신은 `channel_not_found` 로 거절당한다.

그래서 슬랙 전송은 `first_notify` 를 빼고 전부 `ci-slack-send.sh` 를 쓴다.
`slackapi/slack-github-action` 은 `errors` 기본값이 `false` 라 **거절당해도 로그에 한 줄도
남기지 않고 잡이 초록으로 끝난다** — 실제로 이것 때문에 두 번의 배포 동안 카드가 안 바뀌는
것을 못 보고 지나쳤다. 액션이 필요한 곳은 ts 를 output 으로 받아야 하는 첫 게시뿐이다.

### 왜 도커 밖에서 빌드하나

develop 은 자주 도는데, 도커 안에서 워크스페이스를 통째로 설치·빌드하면 매번 몇 분이 든다.
러너에서 한 번 만들고 이미지는 `COPY` 만 하면(`--target prebuilt`) 몇 초로 끝난다.

**arm64 러너에서 만든다.** 배포 서버가 arm64 이고 prisma 쿼리 엔진은 플랫폼별 네이티브
바이너리라, 빌드 호스트의 아키텍처가 그대로 산출물에 남는다. 검사도 같은 자리에서 한다 —
x86 에서 검사하고 arm 에서 다시 만들면 같은 컴파일을 두 번 하게 된다.

> 나중에 amd64 이미지도 필요해지면 **그때만** 같은 잡을 x86 러너로 한 벌 더 돌리고
> buildx 로 합친다. 검사는 arm 쪽에서 이미 끝나 있으므로 그쪽은 산출물만 만들면 된다.

한 잡이 세 벌을 만든다. 앱마다 잡을 나누면 제일 비싼 단계인 워크스페이스 install 을
그만큼 반복하게 된다.

```
out/hansapp-api    --prod
out/hansapp-batch  --prod
out/hansapp-cli    --prod 아님 — prisma(devDependency)가 있어야 마이그레이션이 돈다
```

> `.dockerignore` 가 `dist`·`node_modules` 를 자르므로 `out/` 만 예외로 되돌려 뒀다.
> 그게 없으면 `COPY` 가 성공하면서 **빈 디렉터리를 담는다** — 이미지는 만들어지고
> 컨테이너만 안 뜬다.

**릴리스도 같은 방식이다.** `be-image.yml` 이 arm64 러너에서 산출물을 만들고 이미지는
COPY 만 한다. 다른 점은 검사를 하지 않는다는 것뿐이다 — 릴리스 PR 에서 이미 돌았고,
여기는 "그 버전이 빌드되는지" 만 확인하는 자리다.

Dockerfile 의 `--target with-build`(도커 안에서 빌드)는 남겨 뒀다. 로컬에서 `docker build`
한 번으로 이미지를 만들고 싶을 때 쓰는 길이다.

---

## 마이그레이션

**앱을 멈춘 채로 돌린다.** 스키마를 바꾸는 동안 옛 코드가 새 스키마 위에서 돌면 깨진다 —
컬럼을 지우거나 이름을 바꾸는 변경이 특히 그렇다.

```
config-upload  →  docker-image-pull  →  app-stop  ┐
                                        db-migrate │ 다운타임
                                        app-start  ┘
```

이미지를 **앱이 살아 있는 동안** 받는 이유가 이것이다 — 받는 시간만큼 다운타임이 짧아진다.

> **develop 은 공용 서버라 다운타임을 감수한다.** 무중단이 필요해지면 스키마 변경을
> 하위호환으로만 하는(expand-contract) 규율로 바꾸고 `app-stop` 을 뺀다. 지금은 그 규율이
> 없으므로 멈추는 쪽이 안전하다.

**실패해도 앱은 다시 띄운다.** `app-start` 가 `always()` 라, 마이그레이션이 깨져도 서버가
내려간 채로 남지 않는다 — 공용 서버가 죽어 있으면 다른 사람들이 전부 막힌다. 대신 잡은
빨간불로 끝나고 "새 코드가 옛 스키마 위에 있다" 고 알린다.

```bash
scripts/deploy/deploy-develop.sh                  # 전체
scripts/deploy/deploy-develop.sh --skip-migrate   # 이미 돌렸거나 스키마 변경이 없을 때
scripts/deploy/deploy-develop.sh --config-only    # 설정만 (이미지·스키마 건너뜀)

APP_ENV=develop scripts/deploy/stage/db-migrate.sh   # 스키마만 따로
```

`migrate deploy` 는 적용할 것이 없으면 그냥 통과하므로(멱등) 매번 돌려도 무해하다.

### 어디서 도는가

**배포 대상 서버에서 컨테이너로 한 번 돌고 죽는다.**

```
ssh → docker compose run --rm migrate → 끝나면 컨테이너 삭제
```

배포하는 쪽(CI 러너·맥)에서 prisma 를 돌리지 않는 이유가 셋이다.

- CI 러너에는 `node_modules` 가 없어 매번 설치해야 한다
- `prisma` 는 devDependency 라 런타임 이미지에 없다
- **DB 가 사설망에 있다.** 서버에서 돌리면 이미 그 안이라 VPN 을 탈 이유가 없다

### 왜 전용 이미지인가

`hansapp-cli` 에만 prisma CLI 와 스키마·마이그레이션 파일이 들어 있다. 운영 이미지에
그것들이 있으면 **스키마를 바꿀 수 있는 도구가 서비스 컨테이너에 상주**하게 되고, 앱 DB
계정에 DDL 권한을 주게 된다.

앱 부팅 때 마이그레이션을 돌리는 방법도 흔하지만 쓰지 않는다. 그러면 스키마가 깨질 때
앱까지 같이 죽는다 — 마이그레이션이 실패해도 **옛 컨테이너가 계속 서비스하는 편이 낫다.**

> k3s 로 옮기면 이 이미지를 Job 이 그대로 띄운다. 바뀌는 것은 "무엇이 이 컨테이너를
> 띄우는가" 뿐이다.

### 되돌릴 수 없다

`migrate deploy` 에는 down 이 없다. 이미지는 태그만 바꿔 롤백되지만 **스키마는 그렇지
않다.** 그래서 컬럼 삭제·이름 변경은 두 번에 나눈다.

```
1) 코드에서 그 컬럼을 안 쓰게 만들어 배포
2) 다음 릴리스에서 실제로 삭제
```

한 번에 지우면 배포 순간(마이그레이션 → 새 코드 사이)에 옛 코드가 없는 컬럼을 본다.
추가는 안전하다.

---

## develop

### 자동 — 커밋 메시지에 `#deploy`

```bash
git commit -m "fix: 검색 정렬을 고친다 #deploy"
git push
```

`#be-deploy` 도 같다 — 백엔드만 올리고 싶을 때 쓴다.

```
main
├─ fe_build · be_build   ✅
├─ gate                  ✅  승인 (지금은 규칙이 없어 그냥 통과)
├─ docker-image-push     ✅
├─ be_deploy             ✅
└─ fe_deploy             ✅
```

마커가 없으면 빌드까지만 초록이고 나머지는 회색으로 남는다.
나중에 올리고 싶으면 수동 실행(`stage=deploy`)이 그때 굽고 배포까지 간다.

**opt-out 이 아니라 opt-in 이다.** develop 은 같이 쓰는 서버라, 협업하려고 아직 완성되지
않은 코드를 main 에 먼저 합치는 일이 있다. 합쳤다는 이유만으로 공용 서버가 바뀌면 안 된다.
빠뜨렸을 때의 대가도 다르다 — opt-in 을 잊으면 배포가 안 될 뿐이지만, opt-out 을 잊으면
남들이 쓰는 서버가 깨진다.

### 수동

```
Actions → main - develop 배포 → Run workflow
  Use workflow from:  main
  stage:              deploy      ← 굽고 올린다 (verify = 검사만)
```

설정만 바꿨거나 재기동만 하고 싶으면 배포 워크플로를 직접 돌린다. **빌드도 이미지도 없이
1분 안쪽으로 끝난다** — 설정은 이미지에 안 들어가고 compose 가 마운트하기 때문이다.

```
Actions → be - deploy - develop → Run workflow
  config_only:   ✔   (기본)
  skip_migrate:  ✔   (기본)
```

**환경을 고르는 자리가 없다.** 둘 다 production 으로 가는 길이 아예 없어서, 잘못 골라
운영이 나가는 실수가 성립하지 않는다 — 주의로 막을 수 있는 종류가 아니라 설계로 막았다.

**고른 ref 를 그 자리에서 빌드한다.** production 처럼 미리 구운 이미지를 당기는 것이
아니라 커밋에서 바로 만들기 때문에, ref 가 곧 배포 대상이다.

개발 서버는 항상 `:develop` 만 바라본다. 그 태그가 계속 움직이므로 배포는 반드시 `pull`
부터 한다 — 안 그러면 서버에 캐시된 옛 이미지가 그대로 다시 뜬다.

> **그럼 지금 뭐가 떠 있나.** 태그로는 알 수 없고 앱이 답한다 —
> 산출물에 `dist/build-info.json` 이 들어 있어 sha·branch 를 갖고 있다.

로컬도 같다. **CI 와 같은 스크립트를 같은 순서로 지나간다.**

```bash
scripts/deploy/deploy-develop.sh
```

---

## production

### ① 이미지는 릴리스가 만든다

```
릴리스 PR 병합
  → release        태그 release-backend/v0.5.0 · CHANGELOG
  → verify-backend v0.5.0 이미지를 구워 GHCR 에 올림
```

**여기서 배포하지 않는다.** 릴리스는 "이 버전이 배포 가능하다" 는 보장까지만 만든다.
배포일에 가서야 "이 버전 빌드 안 되네" 를 아는 것은 늦으므로, 굽는 것은 릴리스 시점에
끝내 둔다. 배포는 당기기만 하므로 배포일에 다시 구울 일이 없다 — 확인한 것과 올린 것이
같은 빌드다.

### ② 배포는 배포일에 사람이 누른다

```
Actions → be - deploy - PRODUCTION → Run workflow
  Use workflow from:  staging                   ← 최신 릴리스
                      release-backend/v0.6.4     ← 롤백
```

**입력칸이 없다. ref 가 곧 대상이다.** 고른 태그의 커밋에서 manifest 를 읽어 버전을
확정하고, 그 이미지를 당긴다. 태그가 아니면 첫 잡에서 거부한다 — 브랜치로 배포하면
무엇을 배포했는지 남지 않기 때문이다(main 은 계속 움직인다).

`plan` 이 고른 버전과 최신 릴리스를 나란히 찍는다. 막지는 않는다 — 옛 버전 배포는
롤백이라 정당하다.

> **대가가 있다.** 옛 태그를 고르면 GitHub 이 그 시점의 워크플로 파일로 실행한다. 나중에
> 넣은 검사와 단계가 거기엔 없다. 롤백은 원래 "그때 그 조합" 을 되돌리는 일이라 그게
> 맞는 동작이지만, 배포 절차를 고쳤다면 새 릴리스를 내는 편이 낫다.

```
워크플로 · 배포 스크립트   main       도구는 계속 나아지는 물건이다
설정 · compose · 이미지    그 릴리스   배포되는 것은 묶을 때로 고정한다
```

그래서 배포 도구는 `backend/` 밖(`scripts/deploy/`)에 둔다. 안에 두면 릴리스에 묶여
옛 태그가 옛 스크립트를 갖게 되고, `.github/**` 를 backend 에 넣으면 프론트 CI 를 고쳐도
백엔드 버전이 오른다.

```
plan      ref 에서 버전 확정 · 이미지가 올라올 때까지 기다린다. 굽지 않는다
migrate   스키마 반영. 실패하면 배포하지 않는다
deploy    서버에 올린다
promote   latest 태그를 이 커밋으로 옮긴다
```

**`plan` 이 이미지를 기다린다(최대 10분).** 릴리스를 병합하고 바로 배포를 누르는 것이
자연스러운 흐름인데 그때 빌드가 아직 돌고 있다 — 사람이 그 타이밍을 재고 있을 이유가 없다.
10분이 지나면 빌드가 실패한 것이므로 무엇이 없는지 알리고 멈춘다.

> **워크플로를 고쳤을 때는 `feat`·`fix` 로 커밋한다.** 배포는 릴리스 태그의 워크플로로
> 도는데, `.github` 은 릴리스 대상이 아니라 `backend/` 아래 변경이 함께 있어야 태그가
> 갱신된다. 그마저 `chore` 면 release-please 가 "사용자에게 보이는 변경 없음" 으로 넘겨
> 릴리스가 나지 않는다.

### 태그의 뜻

**git 태그** — Actions 의 ref 드롭다운에 뜬다. 이것으로 고른다.

| | | |
| --- | --- | --- |
| `staging` | 최신 릴리스 | 릴리스가 옮긴다 |
| `latest` | 지금 운영에 떠 있는 것 | 배포가 성공해야 옮겨진다 |
| `release-backend/v0.6.4` | 그 릴리스 | 고정. 안 움직인다 |

둘을 비교하면 **만들어 뒀지만 아직 안 올린 것**이 있는지 바로 보인다.

**도커 태그** — 서버가 당기는 이름.

| | |
| --- | --- |
| `v0.6.4` | **서버 `.env` 에 기록되는 값** |
| `latest` | 배포된 것. 사람이 보는 이정표이지 배포에 쓰지 않는다 |

움직이는 이름으로 배포하면 서버가 "지금 무엇이 떠 있나" 에 답하지 못하고 되돌릴 대상도
사라진다. 그래서 고르는 것은 움직이는 이름(`staging`)으로 하되, 서버에 적히는 것은 항상
고정된 버전이다.

**릴리스 태그를 통째로 체크아웃한다.** 이미지뿐 아니라 설정·compose·배포 스크립트까지 그
시점 것을 쓴다 — 릴리스는 "이 조합을 배포한다" 는 선언이므로 조합 전체가 고정돼야 한다.
대가로, 배포 스크립트를 고쳐도 옛 태그에는 없다. 그 수정이 필요하면 새 릴리스를 낸다.

**릴리스와 배포는 다른 실행이다.** 릴리스가 후보를 만들어 두고, 배포일에 이것을 돌린다.
그 사이가 며칠 벌어지는 것이 정상이고 그동안 main 에는 커밋이 쌓인다 — 릴리스 실행에
배포를 매달면 그 실행을 며칠씩 대기 상태로 붙잡게 된다.

`image` 가 굽지 않는 이유는, 배포일에 main 으로 다시 구워 같은 태그를 붙이면 **그 이름이
거짓말이 되기 때문이다.** v0.6.2 는 릴리스 커밋으로 구운 것이어야 한다.

```bash
scripts/deploy/deploy.sh production v0.5.0
```

로컬에서는 태그를 인자로 받는다. **생략을 막아 두었다** — 기본값으로 올라가면 서버에
무엇이 떠 있는지 아무도 답할 수 없게 되고, 되돌릴 이전 태그도 남지 않는다.

### 롤백

같은 자리에서 태그만 바꾼다. 재빌드가 없다.

```bash
scripts/deploy/deploy.sh production v0.4.0
```

---

## 이미지를 직접 굽기

평소에는 CI 가 굽는다. 급할 때만 쓴다 — 커밋 없이 지금 작업 트리를 그대로 굽는다.

```bash
scripts/deploy/build.sh develop                  # 셋 다
scripts/deploy/build.sh develop hansapp-api      # 하나만
```

푸시에는 `write:packages` 가 필요하다.

```bash
gh auth refresh -h github.com -s write:packages
```

**작업 트리가 더러우면 `<환경>-<sha>` 태그를 붙이지 않는다.** 그 이름은 "이 이미지는 그
커밋이다" 라는 약속인데, 커밋 안 한 변경이 섞이면 거짓이 된다. 움직이는 태그만 올린다.

---

## 배포가 실제로 하는 일

**단계마다 스크립트가 하나다.** 이름만 읽어도 지금 서버를 건드리는 중인지 알 수 있다.

```
wireguard.sh up          터널. **인프라지 배포 절차가 아니다** — 로컬은 안 부른다
stage/
  ssh-connect.sh         키·known_hosts → ssh_config 한 장. 이후 전부 -F 로 그것만 본다
  config-bundle.sh       .enc 를 풀어 번들로. **서버를 건드리지 않는다**
  config-upload.sh       전송 · 원자적 교체 · .env 생성(uid 는 서버가 답한다)
  docker-image-pull.sh   GHCR 로그인 → pull → 로그아웃. 앱은 아직 살아 있다
  app-stop.sh            api·batch 만. redis 는 남긴다
  db-migrate.sh
  app-start.sh           --force-recreate
  secret-cleanup.sh      평문·키 삭제
wireguard.sh down
```

각 단계는 **혼자 돌 수 있다.** 앞 단계가 `.deploy-work/<환경>/` 에 남긴 것을 읽고, 자기
몫만 하고, 다음을 위해 남긴다.

```bash
APP_ENV=develop scripts/deploy/stage/config-bundle.sh   # 뭐가 나갈지만 확인. VPN 없이
ls -R .deploy-work/develop/bundle

APP_ENV=develop scripts/deploy/stage/app-start.sh       # 재기동만
```

> **평문이 디스크에 남는다.** 예전에는 한 스크립트가 `mktemp -d` 로 잡고 트랩으로 지웠지만,
> 단계를 나누면 그럴 수 없다 — 다음 단계가 그것을 읽어야 하기 때문이다. 그래서 지우는 것이
> `secret-cleanup.sh` 의 명시적인 일이 되었고 CI 는 `always()` 로 부른다.
> **개별 단계만 돌렸다면 직접 불러야 한다.**

### `--force-recreate` 가 반드시 필요하다

compose 는 **서비스 정의가 바뀌어야** 컨테이너를 다시 만든다. 그런데 앱 설정은 bind mount
라 경로가 그대로다.

```
./config/config.develop.yaml:/app/config/config.yaml:ro
```

파일 내용을 갈아끼워도 정의는 그대로라 컨테이너가 재생성되지 않고, 앱은 부팅 때 읽어둔
옛 설정을 계속 들고 돈다 — **파일은 바뀌었는데 동작은 안 바뀌는** 제일 헷갈리는 실패다.

지금까지 안 터진 것은 우연에 가깝다. `api` 만 `SLACK_DEPLOY_THREAD_TIMESTAMP` 를
environment 로 받는데 그 값이 배포마다 달라서 매번 재생성됐다. 그런데 그건 `x-common` 이
아니라 `api` 에만 있어서 **`batch` 는 해당이 없다.**

서버에는 이렇게 남는다.

```
~/app/hansapp-<환경>/
  .env                      IMAGE_TAG · APP_UID · APP_GID   ← 지금 무엇이 어떤 uid 로 떠 있나
  docker-compose.yml
  config/
    config.<환경>.yaml      600  배포 계정        컨테이너가 직접 읽는다
    .env.<환경>             600  배포 계정        도커가 읽어 주입한다(env_file)
    <환경>/                 600  배포 계정        jwt · TLS 키
```

**전부 배포 계정 소유의 0600 이다.** 컨테이너가 그 계정과 같은 uid 로 돌기 때문이다 —
이미지를 `--build-arg APP_UID=` 로 굽고 compose 가 `user:` 로 같은 값을 넘긴다. 기본은
1001(Oracle Cloud 의 첫 로그인 계정)이고, 배포가 서버에서 `id -u` 를 읽어 `.env` 에 적는다.

> 예전에는 이미지 유저가 10001 이라 배포가 `sudo chown` 으로 비밀 파일을 컨테이너 uid 에
> 넘기고 yaml 만 644 로 열어 뒀다. 파일마다 권한이 다른 이유를 매번 설명해야 했고 sudo 도
> 필요했다. 번호를 맞추면 그 전부가 사라진다.

> **서버의 `.env` 에는 `$` 가 `$$` 로 적혀 있다.** compose 가 env_file 값을 보간해서,
> 비밀번호에 `$` 가 있으면 그 뒤를 변수 이름으로 읽고 지우기 때문이다 — 운영
> `DATABASE_URL` 이 그렇게 잘려 `invalid port number` 로 죽은 적이 있다. compose 가
> 보간 단계에서 `$$` 를 `$` 하나로 되돌리므로 컨테이너에는 온전한 값이 도착한다.
>
> `format: raw` 로 보간을 끌 수도 있지만 그것은 **따옴표도 안 벗긴다.** 우리 env 는 값이
> 따옴표로 감싸여 있어 `DATABASE_URL` 이 `"mysql://…"` 가 되고 prisma 가 거부한다.
>
> **그래서 서버 파일을 열면 실제 값과 달라 보인다.** 비밀번호 확인은 레포의 `.enc` 를
> 복호화해서 하는 것이 정본이다 — `backend/env-decrypt.sh`.

### 비밀번호의 특수문자

두 가지를 지킨다.

```
1. 비밀번호에 쓸 수 있는 문자를 제한하지 않는다
2. .env 에는 실제 비밀번호가 그대로 적힌다
```

그런데 접속 URL 은 `@` `#` `/` `?` 가 구분자인 포맷이라 둘이 부딪힌다. RFC 3986 이
자격증명 구간(userinfo)에 허용하는 문자는 정해져 있고, 우리 운영 비밀번호의 `#` 가 거기
걸린다 — `#` 는 프래그먼트 시작이라 파서가 그 앞에서 URL 을 끊는다.

```
mysql://user:ab#cd@10.0.0.111:3306/prod    →  host=user, port='ab'
                                           →  invalid port number in database URL
```

**저장은 사람 기준, 전달은 파서 기준으로 나눈다.** 파일은 원문 그대로 두고, 설정을 읽는
순간 `ConfigSource.getUrl` 이 자격증명 구간만 퍼센트 인코딩해 넘긴다
(`hansapp-common/src/connection-url.ts`). 경계는 **마지막 `@`**(호스트에는 `@` 가 못
들어간다)와 **첫 `:`** 로 잡으므로 비밀번호에 `@` `#` `$` `&` 가 몇 개 있든 정확하다.
`/` `?` 만은 지원하지 않는다 — 대부분의 DB 도구가 함께 걸려 넘어지므로 쓰지 않는 편이 낫다.

그래서 URL 설정은 `getString` 이 아니라 **`getUrl` 로 읽어야 한다.** 그리고
`prisma migrate` 를 `dotenv` 로 직접 부르면 이 지점을 우회하므로, 로컬 마이그레이션도
`hansapp-cli db …` 를 거친다(`@hansapp/data` 의 `prisma:migrate:*` 가 그렇게 돼 있다).

---

## 컨테이너 안

**이미지는 자기가 어느 환경인지 모른다.** 환경별 파일을 환경 이름 없는 자리에 마운트한다.

```
/app/
  hansapp-api/dist/main.js     이름이 남아 있어 컨테이너 안에서 자기가 뭔지 보인다
  config/
    config.yaml                ← config.<환경>.yaml
    secrets/                   ← config/<환경>/
```

`APP_ENV` 는 `.env` 에 들어 있고 도커가 환경변수로 주입한다. compose 가 따로 넘기지 않는다.

**기본값이 없어 빠뜨리면 부팅을 거부한다.** Redis 키 네임스페이스와 Elasticsearch 인덱스
별칭이 이 값에서 파생되는데(둘 다 환경들이 한 대를 공유한다), 잘못 떨어지면 엉뚱한 환경의
데이터를 건드린다. 안 뜨는 편이 조용히 잘못된 곳에 쓰는 것보다 낫다.

---

오리진 TLS·Cloudflare 설정은 [cloudflare.md](cloudflare.md), 릴리스 절차는
[release.md](release.md), 비밀 파일 암복호화는 [sops.md](sops.md) 를 본다.
