# 인증 (Authentication)

모든 API 요청에는 발급받은 **API 키**가 필요합니다. API 키를 HTTP `Authorization` 헤더에 **Bearer 토큰**으로 담아 보냅니다.

## 요청 헤더

```
Authorization: Bearer <API_KEY>
```

- `<API_KEY>` 자리에 발급받은 키를 넣습니다.
- 모든 엔드포인트에 공통으로 적용됩니다.

## 예시

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.plzhans.com/data-go-kr/hira/hospitals?name=서울"
```

```js
await fetch('https://api.plzhans.com/data-go-kr/hira/hospitals?name=서울', {
  headers: { Authorization: 'Bearer YOUR_API_KEY' },
});
```

::: warning
API 키는 외부에 노출되지 않도록 주의하세요. 클라이언트(브라우저)에 직접 넣기보다 서버에서 프록시하는 것을 권장합니다.
:::

::: tip
문서의 각 API 페이지에서 **Try it** 을 사용할 때도 상단/요청 패널의 토큰 입력란에 API 키를 넣으면 인증된 요청으로 테스트할 수 있습니다.
:::
