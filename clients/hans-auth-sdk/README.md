# @hansapp/auth-sdk

hans-auth 로그인을 브라우저 앱에 붙이는 클라이언트 SDK다.
OAuth 2.0 인가 코드 흐름에 PKCE(RFC 7636)를 적용하며 토큰 보관과 갱신, 탭 사이 세션 동기화를 담당한다.

`client_secret` 을 쓰지 않는 public client 라 번들에 노출돼도 되는 값만 다룬다.

## 설치

```bash
npm install @hansapp/auth-sdk
```

의존성이 없다. 저장소는 웹 표준 API(localStorage·쿠키·sessionStorage)를 쓴다.

## 시작하기

```ts
import { createAuthClient } from '@hansapp/auth-sdk';

export const authClient = createAuthClient({
  clientId: 'cl_your_client_id',
  storageKey: 'yourapp.auth',
});
```

주소는 기본값이 있다.
로컬이나 개발 환경을 볼 때만 덮어쓴다.

```ts
createAuthClient({
  clientId: 'cl_your_client_id',
  apiBaseUrl: 'http://127.0.0.1:3000',
  authWebUrl: 'http://127.0.0.1:5273',
});
```

로그인 버튼에서 `login()` 을 부르면 로그인 화면으로 이동한다.

```ts
await authClient.login();
```

콜백 경로에 해당하는 화면에서 `handleCallback()` 으로 코드를 교환한다.

```ts
const result = await authClient.handleCallback();
if (result.ok) {
  // 로그인 완료
} else {
  // result.error — 'no_code' | 'no_verifier' | 'email_exists' | 'pending' ...
}
```

## 설정

| 항목 | 필수 | 설명 |
| --- | --- | --- |
| `clientId` | 예 | 발급받은 공개 클라이언트 ID |
| `authWebUrl` | 아니오 | 로그인 UI 주소. 기본 `https://auth.plzhans.com` |
| `apiBaseUrl` | 아니오 | 인증 API 주소. 기본 `https://api.plzhans.com` |
| `callbackPath` | 아니오 | 코드를 받을 경로. 기본 `/auth/callback` |
| `storageKey` | 아니오 | 저장 키 접두사. 기본 `hansapp.auth` |
| `persistence` | 아니오 | 토큰 보관 범위. 기본 `'device'` |
| `storage` | 아니오 | 저장소 구현. 기본은 웹 표준 |

`storageKey` 는 앱마다 다르게 준다.
한 오리진에 여러 앱이 뜨면 서로의 세션을 덮어쓴다.

### 토큰 보관 범위

| 값 | 저장소 | 사라지는 시점 |
| --- | --- | --- |
| `'device'` | localStorage | 지우기 전까지 남는다 |
| `'browser'` | 세션 쿠키 | 브라우저를 닫을 때. 창이 열려 있는 동안 모든 탭이 공유한다 |
| `'tab'` | sessionStorage | 탭을 닫을 때. 탭마다 따로 논다 |

## API

| 메서드 | 설명 |
| --- | --- |
| `login(redirectUri?)` | 로그인 화면으로 이동한다 |
| `handleCallback(search?, hash?)` | 콜백에서 코드를 토큰으로 교환한다 |
| `isAuthenticated()` | 로그인 상태인지 |
| `checkAccessToken()` | 저장된 토큰을 JWKS 로 검증한다. 서버를 부르지 않는다 |
| `getAccessToken()` | 저장된 access token |
| `getFreshAccessToken(minTtlSec?)` | 남은 수명이 모자라면 갱신해서 돌려준다. 기본 300초 |
| `fetchWithAuth(pathOrUrl, init?)` | 토큰을 붙여 요청하고 만료 시 갱신 후 재시도한다 |
| `logout({ revokeSession? })` | 로그아웃한다. `revokeSession` 이면 서버 세션도 끊는다 |
| `forget()` | 저장된 토큰만 지운다 |
| `onSessionChange(handler)` | 다른 탭의 세션 변화를 구독한다. 반환값을 부르면 해제된다 |

## API 호출에 붙이기

`fetchWithAuth` 가 토큰 부착과 갱신을 맡는다.
첫 인자가 `/` 로 시작하면 `apiBaseUrl` 을 앞에 붙인다.

```ts
const res = await authClient.fetchWithAuth('/users/me');
```

`fetch` 를 주입받는 API 클라이언트를 쓴다면 이 메서드를 그대로 넘기면 된다.

```ts
configure({ fetch: (url, init) => authClient.fetchWithAuth(url, init) });
```

## Capacitor 앱

네이티브에서는 어댑터를 넘겨야 한다.
넘기지 않으면 웹뷰 저장소로 떨어져서 앱 데이터가 비워질 때 로그인이 함께 사라진다.

```ts
import { Preferences } from '@capacitor/preferences';
import { CapacitorCookies } from '@capacitor/core';
import { capacitorStorage } from '@hansapp/auth-sdk/capacitor';

createAuthClient({
  // ...
  storage: capacitorStorage({ Preferences, CapacitorCookies }),
});
```

SDK 는 `@capacitor/*` 를 의존하지 않는다.
쓰는 쪽이 설치한 것을 넘겨받아 쓴다.

### 직접 만들기

`StateStore` 를 구현하면 어떤 저장소든 붙일 수 있다.

```ts
import type { PlatformStorage, StateStore } from '@hansapp/auth-sdk';
```

`StateStore` 는 `get`·`set`·`remove`·`getAllKeys` 네 개다.
`PlatformStorage` 는 `local`(기기 보관·PKCE), `session`(브라우저 범위), `tab`(선택)로 나뉜다.

## 요구 사항

브라우저 전용이다.
`crypto.subtle`, `BroadcastChannel`, `navigator.locks` 를 쓴다.

## 라이선스

MIT
