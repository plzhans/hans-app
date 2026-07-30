# 릴리스 — 자동 버저닝

버전은 **손으로 올리지 않는다.** `package.json` 을 고치거나 태그를 직접 붙이는 일이 없다.
`main` 에 쌓인 커밋 메시지를 **release-please 봇**이 읽어 다음 버전을 정하고, 사람은 "지금
낼까" 만 결정한다.

핵심은 하나다 — **커밋만 규약대로 쌓으면, 릴리스는 PR 하나를 머지하는 것으로 끝난다.**

---

## 버전은 커밋 타입이 정한다

봇은 지난 릴리스 이후의 커밋 타입을 모아 올림 폭을 계산한다. [Conventional Commits](https://www.conventionalcommits.org/ko/)
의 semver 규칙 그대로다.

| 커밋 | 올림 | 예 |
| --- | --- | --- |
| `fix:` | **patch** — `0.1.0 → 0.1.1` | `fix(auth): 쿠키 만료를 바로잡는다` |
| `feat:` | **minor** — `0.1.0 → 0.2.0` | `feat(address): 영문 변환을 더한다` |
| `feat!:` · 본문에 `BREAKING CHANGE:` | **major** — `0.1.0 → 1.0.0` | `feat(auth)!: 토큰 응답 형식을 바꾼다` |
| `docs`·`refactor`·`perf`·`ci`·`build`·`chore`·`test` | 버전 안 올림 | 이것만 쌓이면 릴리스 PR 이 안 생긴다 |

여러 타입이 섞이면 **가장 큰 올림**이 이긴다 — `fix` 열 개와 `feat` 하나면 minor 다.
`perf` 는 CHANGELOG 에는 실리지만(성능 항목) 버전은 안 올린다.

> 못 박아야 할 때: 커밋 본문에 `Release-As: 1.5.0` 을 적으면 계산을 무시하고 그 버전으로
> 낸다.

---

## 푸시가 일어나면 벌어지는 일

`main` 에 푸시가 일어날 때마다 `.github/workflows/release.yml` 이 돈다. 그 안의
`release-please-action` 이 매번 하는 일은 **버전을 계산해 Release PR 을 최신으로 맞추는
것**이고, 릴리스를 바로 내지는 않는다.

```
main 에 push
   │
   ▼
release.yml 실행 → release-please 봇
   │
   ├─ 지난 릴리스 태그 이후의 커밋을 읽는다
   ├─ 버전을 계산한다 (위 표)
   │
   └─ 올릴 게 있으면 ──► "Release PR" 을 열거나, 이미 있으면 갱신한다
      올릴 게 없으면 ──► 아무 PR 도 만들지 않고 끝난다
```

봇이 여는 **Release PR** 한 개에는 이 릴리스에 들어갈 결과물이 미리 담겨 있다.

- 제목: `chore: release main`
- 올라갈 판의 `package.json` 버전을 새 값으로 올린 diff (backend·frontend 중 올릴 것만)
- 그 판의 `CHANGELOG.md` 에 이번 버전의 변경 목록 초안 (기능·버그 수정·성능·구조 변경·문서 순)

이 PR 은 **한 번 열리면 계속 살아 있다.** `main` 에 커밋이 더 쌓이면 봇이 같은 PR 을
다시 갱신한다 — 버전 숫자와 CHANGELOG 가 그때그때 다시 계산된다. 그래서 "다음 릴리스에
무엇이 들어가는지" 를 항상 이 PR 하나로 미리 볼 수 있다.

---

## 릴리스를 내는 절차

1. **규약대로 커밋해 `main` 에 올린다.** `feat:`/`fix:` 가 섞여 있으면 봇이 Release PR 을
   열어 둔다. (버전 커밋을 손으로 만들 필요는 없다 — 봇이 만든다.)
2. **Release PR 을 확인한다.** 다음 버전 숫자와 CHANGELOG 초안이 맞는지 본다. 아직 낼
   때가 아니면 그냥 둔다 — 커밋을 더 쌓으면 PR 이 알아서 갱신된다.
3. **낼 준비가 되면 Release PR 을 머지한다.** 이 머지가 곧 릴리스다.
4. 머지되는 순간 봇이 이어서 만든다 — 여기서 사람이 할 일은 없다. **올릴 게 있는 판만**
   해당된다.
   - 그 판의 `package.json` 버전과 `CHANGELOG.md` 를 `main` 에 커밋
   - `release-backend/v0.2.0` · `release-frontend/v0.3.0` 태그
   - 그 태그로 GitHub 릴리스

**태그를 손으로 붙이지 않는다.** 4단계를 사람이 하면 버전·CHANGELOG·태그가 어긋난다 —
전부 봇이 한 실행 안에서 만들게 둔다.

---

## 버전은 backend·frontend 둘로 나뉜다

판은 두 개다. 서로 영향을 주지 않는다.

| 판 | 태그 | CHANGELOG | 버전이 오르는 조건 |
| --- | --- | --- | --- |
| `backend` | `release-backend/v0.2.0` | `backend/CHANGELOG.md` | `backend/` 아래를 건드린 커밋 |
| `frontend` | `release-frontend/v0.3.0` | `frontend/CHANGELOG.md` | `frontend/` 아래를 건드린 커밋 |

봇은 **커밋 메시지의 scope 가 아니라 그 커밋이 실제로 바꾼 파일 경로**로 판을 가른다.
`feat(auth):` 라고 적어도 `frontend/` 만 고쳤으면 frontend 만 오른다. 그래서 scope 를
정확히 달 의무는 없고, 대신 **커밋을 판 경계에 맞춰 쪼개는 것**이 규율이 된다 — 한 커밋이
양쪽을 건드리면 양쪽 다 오르고 양쪽 CHANGELOG 에 다 실린다. (그게 맞는 커밋이면 그대로 두면
된다. 실제로 그런 변경이 있다.)

프론트 넷(`hansapp-web`·`hansapp-auth`·`hansapp-docs`·`medifinder-web`)은 **더 쪼개지
않는다.** 쿠키 SSO 와 공유 스펙으로 실제로 엮여 있어서, 나눠봐야 늘 같이 오르는 번호가
넷이 될 뿐이다. 앱마다의 `package.json` 은 `extra-files` 로 frontend 버전에 맞춰 같이
갱신된다 — 각 앱이 자기 `package.json` 의 version 을 빌드 신원(`__APP_RELEASE__`,
build-info)에 박기 때문이다. backend 앱 셋도 같은 이유로 같이 갱신된다.

> 나눌 때가 오면: `frontend/auth-sdk` 를 npm 에 퍼블리시하게 되는 날이다. 외부가 보는
> 버전은 자기 것이어야 한다. 그전까지는 둘로 충분하다.

### Release PR 은 하나다

판이 둘이어도 PR 은 하나로 묶어서 연다(`separate-pull-requests: false`). 그 PR 을 머지하면
그 시점에 올릴 게 있는 판만 릴리스된다 — backend 만 바뀌었으면 `release-backend/v0.2.0`
하나만 생긴다. **머지 한 번 = 릴리스 한 묶음**이라 배포를 걸기도 쉽다.

## 릴리스와 배포는 분리돼 있다

이 워크플로는 **버전·CHANGELOG·태그·릴리스까지만** 만든다. 실제 앱 빌드·배포는 따로 맡는다.
"버전을 찍는 일" 과 "그 버전을 배포하는 일" 을 나눠 둔 것이다.

| 대상 | 배포처 |
| --- | --- |
| backend | 서버 (배포 스크립트) |
| frontend (정적 사이트) | **Cloudflare Workers** (정적 자산만 담은 Worker) |

프론트는 Cloudflare Workers 에 올린다. 그러려면 **Cloudflare API 토큰과 Account ID 를
GitHub Secrets/Variables 에 넣어 두는 준비가 한 번 필요하다** — 토큰 발급부터 커스텀 도메인
연결까지 [cloudflare.md](cloudflare.md) 에 단계별로 정리해 뒀다.

사이트 하나가 **환경마다 Worker 하나다**(`dev-hansapp-docs` · `prod-hansapp-docs`).
develop 도 자기 커스텀 도메인이 있어야 쿠키 SSO 와 OAuth 콜백이 살아 있기 때문인데,
그 근거도 [cloudflare.md](cloudflare.md) 에 적어 뒀다.

판을 `backend`·`frontend` 로 나눈 이름은 **배포 대상 경로와 같다.** 봇이 "이번에 릴리스된
판" 을 경로 목록으로 알려주므로(`paths_released`), 운영 배포는 그 목록을 그대로 받아
돌리면 된다 — 태그 이름을 파싱해 경로로 되돌리는 변환표를 어디에도 두지 않는다.

> 태그 push 로는 아무것도 트리거되지 않는다. 봇이 기본 `GITHUB_TOKEN` 으로 태그를 만들기
> 때문에 그 push 는 다른 워크플로를 깨우지 않는다(무한 루프 방지). 릴리스 실행 안에서
> 이어 도는 것은 **빌드 확인까지**이고, 배포는 배포일에 사람이 따로 돌린다.

### 움직이는 태그

버전을 외우지 않고 배포하려고 판마다 두 개의 별칭을 둔다. Actions 의 `Use workflow from`
드롭다운에 뜨므로 거기서 고른다.

| | backend | frontend |
| --- | --- | --- |
| 최신 릴리스 (배포 후보) | `staging` | `release-frontend/staging` |
| 지금 운영에 뜬 것 | `latest` | `release-frontend/latest` |

**backend 만 접두사가 없다.** 프론트가 뒤늦게 합류하면서 겹치지 않게 접두사를 붙였고,
이미 쓰이던 이름을 바꾸지 않았다. 비대칭이지만 이 표를 보면 된다.

`staging` 은 릴리스가 옮기고 `latest` 는 운영 배포가 옮긴다. **둘을 비교하면 만들어 뒀지만
아직 안 올린 것이 있는지 바로 보인다.**

> 릴리스를 병합하고 곧바로 배포를 누르면 `staging` 이 아직 직전 릴리스를 가리키는 짧은
> 창이 있다(태그 이동에 수십 초). 그래서 운영 배포의 `plan` 이 **고른 버전과 최신 릴리스를
> 나란히 찍는다** — 막지는 않는다. 옛 버전 배포는 롤백이라 정당하기 때문이다.

---

봇이 Release PR·태그를 만들려면 저장소 쪽 권한 설정이 한 번 필요하다 —
[github.md](github.md) 의 "Actions Workflow 권한 설정" 참고. 커밋 규약과 그 강제는
[DEVELOP.md](../DEVELOP.md) · [husky.md](husky.md) 를 본다.
