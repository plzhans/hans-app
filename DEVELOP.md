


---

## 커밋 규약

[Conventional Commits](https://www.conventionalcommits.org/ko/) 를 따른다. 형식은
`type(scope): 한국어 설명` 이고, 타입은 도구가 읽어야 하므로 영어로 고정한다.

```
feat(address): 영문 주소 변환 API 를 더한다

본문에는 왜 그렇게 했는지를 적는다. 무엇을 했는지는 diff 가 이미 말한다.
```

| 타입 | 언제 | 예시 |
| --- | --- | --- |
| `feat` | 기능 추가 | `feat(healthcare): 병원 상세 조회를 join 1쿼리로 바꾼다` |
| `fix` | 버그 수정 | `fix(auth): 리프레시 토큰 쿠키 만료를 바로잡는다` |
| `docs` | 문서만 | `docs: DEVELOP 에 커밋 규약을 적는다` |
| `refactor` | 동작은 그대로, 구조만 | `refactor(hira): 스크랩 호출을 리포지토리로 뺀다` |
| `perf` | 성능 | `perf(address): 코드표를 부팅 때 인메모리로 올린다` |
| `ci` | 워크플로 | `ci: openapi 스펙 검사를 PR 에서만 돌린다` |
| `build` | 빌드 설정 | `build: prisma generate 를 postinstall 에 건다` |
| `chore` | 그 밖의 관리 | `chore(deps): husky 버전을 올린다` |
| `test` · `revert` | 테스트 · 되돌리기 | |

`scope` 는 선택이다. 이 저장소에서 쓰는 것: `backend` · `frontend` · `auth` ·
`address` · `healthcare` · `hira` · `deps`.

**호환성이 깨지면 `!` 를 붙인다** — `feat(auth)!: 토큰 응답 형식을 바꾼다`. 도구가 이걸
major 버전 신호로 읽는다.

### 어기면 커밋이 안 된다

`commitlint` 가 `.husky/commit-msg` 에서 검사한다. 규약을 문서에만 적어 두면 곧 어긋나므로
막아 둔다. 규칙은 `commitlint.config.js` 에 있고, 한국어 제목이라 대소문자 검사는 꺼 두었다.

훅은 `pnpm install` 이 걸어 준다(`prepare` 스크립트). 클론만 한 상태에서는 훅이 없으니
**받으면 먼저 `pnpm install` 을 한 번 돌린다** — 어차피 그것 없이는 개발이 안 된다.

---

## 릴리스 — 버전 관리

버전을 손으로 올리지 않는다. **release-please** 가 커밋 메시지를 읽어 자동으로 매긴다
(`.github/workflows/release.yml`).

```
커밋(feat:/fix:) → 봇이 "다음 버전은 이것" 이라는 Release PR 을 열거나 갱신
                 → 그 PR 을 머지하면 봇이 버전·CHANGELOG·태그·릴리스를 만든다
```

버전은 커밋 타입이 정한다 — `fix` 는 patch, `feat` 는 minor, `!` 가 붙으면 major
([커밋 규약](#커밋-규약) 참고). 그래서 `package.json` 을 손으로 고칠 일이 없고, 태그와
버전이 어긋날 자리도 없다. 특정 버전으로 못 박아야 하면 커밋 본문에 `Release-As: 1.5.0`
을 적는다.

**저장소 전체가 하나의 버전이다.** backend·frontend 앱이 여러 개지만 판을 나누지 않고
루트 `package.json` 의 버전 하나로 묶는다(`release-please-config.json` 의 단일 패키지 `.`).
태그는 `release/vX.Y.Z`, Release PR 제목은 `chore: release X.Y.Z`, 변경 목록은 루트
`CHANGELOG.md` 한 벌이다.

**릴리스와 배포는 분리돼 있다.** 이 워크플로는 버전·CHANGELOG·태그·릴리스까지만 만든다.
앱별 빌드·배포는 `be-build-test.yml` · `fe-*.yml` 이 따로 맡는다.

`chore(release): …` 커밋은 봇이 만든다. 관리 작업이라 `chore` 이고, 그래야 변경 목록에서도
빠진다 — 어떤 버전의 변경 목록에 "그 버전을 릴리스함" 이 들어가면 이상하다.