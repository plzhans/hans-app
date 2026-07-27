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

- 제목: `chore: release 0.2.0`
- `package.json` 의 `version` 을 새 값으로 올린 diff
- `CHANGELOG.md` 에 이번 버전의 변경 목록 초안 (기능·버그 수정·성능·구조 변경·문서 순)

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
4. 머지되는 순간 봇이 이어서 만든다 — 여기서 사람이 할 일은 없다.
   - `package.json` 버전과 `CHANGELOG.md` 를 `main` 에 커밋 (`chore: release 0.2.0`)
   - `release/v0.2.0` 태그
   - 그 태그로 GitHub 릴리스

**태그를 손으로 붙이지 않는다.** 4단계를 사람이 하면 버전·CHANGELOG·태그가 어긋난다 —
전부 봇이 한 실행 안에서 만들게 둔다.

---

## 저장소 전체가 하나의 버전이다

backend·frontend 앱이 여러 개지만 판을 나누지 않고 루트 `package.json` 버전 하나로 묶는다
(`release-please-config.json` 의 단일 패키지 `.`). 태그는 `release/vX.Y.Z`, CHANGELOG 는
루트 한 벌이다.

## 릴리스와 배포는 분리돼 있다

이 워크플로는 **버전·CHANGELOG·태그·릴리스까지만** 만든다. 실제 앱 빌드·배포는
`be-build-test.yml` · `fe-*.yml` 이 따로 맡는다. "버전을 찍는 일" 과 "그 버전을 배포하는
일" 을 나눠 둔 것이다.

---

봇이 Release PR·태그를 만들려면 저장소 쪽 권한 설정이 한 번 필요하다 —
[github.md](github.md) 의 "Actions Workflow 권한 설정" 참고. 커밋 규약과 그 강제는
[DEVELOP.md](../DEVELOP.md) · [husky.md](husky.md) 를 본다.
