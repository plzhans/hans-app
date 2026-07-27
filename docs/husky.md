# Husky — git 훅

## 왜 쓰나

규약을 문서에만 적어 두면 곧 어긋난다. 커밋·체크아웃 같은 순간에 훅을 걸어 두면 사람이
기억하지 않아도 강제된다. 이 저장소에서 훅이 하는 일은 두 가지다.

- **커밋 메시지 규약 검사** — Conventional Commits 를 어기면 커밋이 아예 안 된다.
- **워크스페이스별 자동 처리** — 브랜치를 바꾸거나 pull 했을 때 그 워크스페이스가 필요한
  일(의존성 재설치 등)을 알아서 하도록 위임한다.

## 구성과 동작

훅은 `pnpm install` 이 걸어 준다(루트 `package.json` 의 `"prepare": "husky"`). **클론만 한
상태에는 훅이 없으니, 받으면 먼저 `pnpm install` 을 한 번 돌린다.**

훅 스크립트는 루트 `.husky/` 에 있고, 성격에 따라 두 갈래로 나뉜다.

### 워크스페이스로 위임하는 훅

`pre-commit` · `post-checkout` · `post-merge` 는 루트가 직접 일하지 않는다. **어느
워크스페이스가 바뀌었는지만 보고**, 그 워크스페이스의 같은 이름 훅으로 넘긴다.

```sh
# .husky/pre-commit (요지)
for ws in backend frontend; do
  echo "$CHANGED" | grep -q "^$ws/" || continue      # 그 워크스페이스가 안 바뀌면 건너뜀
  [ -f "$ws/.husky/pre-commit" ] || continue          # 훅이 있을 때만
  ( cd "$ws" && sh .husky/pre-commit "$@" ) || exit $?
done
```

**무엇을 할지는 각 워크스페이스가 소유한다.** `frontend/.husky/pre-commit` 을 새로 만들면
루트를 건드리지 않아도 자동으로 끼어든다. backend·frontend 가 서로 다른 도구를 써도
루트가 알 필요가 없다.

### 루트 공통 훅

`commit-msg` 는 위임하지 않는다. **커밋 메시지는 워크스페이스별이 아니라 저장소 공통**이라,
루트에서 바로 commitlint 를 돌린다.

```sh
# .husky/commit-msg
pnpm exec commitlint --edit "$1"
```

규칙은 루트 `commitlint.config.js` 에 있다. 규약 설명은 [DEVELOP.md](../DEVELOP.md) 의
"커밋 규약" 참고.
