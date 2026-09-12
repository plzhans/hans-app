# Pretendard 1.3.9 (dynamic subset)

`https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/` 에서 그대로 받아 둔 것이다.
`subset.css` 는 상류 파일과 바이트 단위로 같다 — 손대지 말 것.
sha256 `2973bcae80262dcb630cfb793fbf6af29bd986c769ee54953fb3e5b3e32323ca`

폰트는 `index.html` 이 `/assets/fonts/pretendard-1.3.9/subset.css` 로 직접 건다.

## 폴더 이름에 버전이 붙는 이유

`public/_headers` 의 `/assets/*` 가 `immutable` 캐시를 건다.
조각 파일 이름에는 내용 해시가 없어서, 경로에 버전이 없으면 업그레이드해도
브라우저가 낡은 폰트를 계속 쓴다.

## 버전 올리기

새 버전 폴더를 만들고 받는다. `1.3.9` 자리를 바꾸면 된다.

```sh
V=1.3.9
D="public/assets/fonts/pretendard-$V"
mkdir -p "$D/woff2-dynamic-subset"
B="https://cdn.jsdelivr.net/npm/pretendard@$V/dist"
curl -sS -o "$D/subset.css"  "$B/web/variable/pretendardvariable-dynamic-subset.css"
curl -sS -o "$D/LICENSE.txt" "$B/LICENSE.txt"
seq 0 91 | xargs -P 12 -I{} curl -sS \
  -o "$D/woff2-dynamic-subset/PretendardVariable.subset.{}.woff2" \
  "$B/web/variable/woff2-dynamic-subset/PretendardVariable.subset.{}.woff2"
```

조각 개수는 버전마다 다를 수 있다. `subset.css` 의 `@font-face` 개수와 맞는지 확인한다.

```sh
grep -c '@font-face' "$D/subset.css"
ls "$D/woff2-dynamic-subset" | wc -l
```

받은 뒤 `index.html` 의 stylesheet 경로와 preload 경로를 새 버전으로 바꾸고,
확인이 끝나면 옛 버전 폴더를 지운다.

## preload 대상

`index.html` 은 `subset.91` 하나만 preload 한다.
조각 번호는 빈도순이라 91 이 라틴 문자·숫자와 가장 흔한 한글을 함께 담는다.
ko·en·ja·zh 네 로케일이 모두 이 조각을 쓴다(다른 조각은 로케일마다 갈린다).

버전을 올리면 번호가 달라질 수 있다. 아래로 다시 확인한다.

```sh
grep -B1 'unicode-range:.*U+41-' "$D/subset.css" | grep -o 'subset\.[0-9]*'
```

`unicode-range` 는 앞의 0 을 떼고 적힌다 — `U+0041` 이 아니라 `U+41-4e` 다.

## 라이선스

SIL Open Font License 1.1. `LICENSE.txt` 를 같이 둔다 — 지우지 말 것.
