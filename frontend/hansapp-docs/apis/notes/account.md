로그인한 사용자의 정보를 조회합니다. **access token 으로 호출합니다** —
토큰 발급은 [토큰](/apis/oauth), 로그인 흐름은 [공통 › 로그인 연동](/common#login-integration) 을 참고하세요.

`Authorization: Bearer <accessToken>` 이며, 서비스 키(`sk_...`)로는 호출할 수 없습니다.
서비스 키는 앱을 식별할 뿐 사용자를 가리키지 않기 때문입니다.

::: tip 계정 관리는 계정 페이지에서 합니다
비밀번호 변경·기기 로그아웃·회원 탈퇴 같은 계정 관리는 API 로 열려 있지 않습니다.
사용자를 [plzhans.com](https://plzhans.com) 계정 화면으로 보내세요.
:::
