# 회원 연동이 열릴 때 문서를 어떻게 고치는가

지금 게시된 세 문서는 **회원가입이 없다는 사실 위에 서 있다.** 로그인 UI 가 열리는 순간
개인정보처리방침 머리말·제1조·제3조·제10조·제11조·제13조가 한꺼번에 거짓이 된다.

그때 다시 조사하고 다시 쓰지 않도록, **무엇이 실제로 저장되는지**와 **어느 조를 어떤 문장으로
바꾸는지**를 미리 적어 둔다. 릴리스할 때 이 파일의 문장을 JSON 에 옮기면 끝난다.

---

## 1. 회원 연동이 실제로 저장하는 것

근거: `backend/packages/hansapp-data/prisma/main/auth.prisma`. 추측이 아니라 스키마다.

| 테이블 | 저장하는 것 | 방침에 어떻게 쓰나 |
|---|---|---|
| `User` | 이메일(필수·유일), 이메일 검증 여부, 비밀번호 **bcrypt 해시**(이메일 가입만), 표시 이름(선택), 계정 상태·권한·등급, 최초 가입 수단, 가입·수정·탈퇴 시각 | 회원 정보 |
| `UserOAuth` | 소셜 제공자(구글·네이버·카카오·라인), 제공자가 준 고유 식별자, 제공자가 준 이메일 | 소셜 연동 정보 |
| `UserTokenSession` | 세션 식별자, 토큰 해시, **접속 기기의 User-Agent 와 IP 주소**, 만료 시각 | 로그인 세션 — **계정과 묶인 IP 라서 지금의 접속 기록과 성격이 다르다** |
| `UserAuthCode` | 소셜 콜백 릴레이용 1회용 코드(약 30초) | 보유 기간이 워낙 짧아 별도 항목으로 쓰지 않아도 되지만, 쓰려면 "로그인 처리용 임시 코드" |
| `EmailVerification` | 이메일과 인증코드 **모두 HMAC 해시만**. 원문은 저장하지 않음 | "이메일 인증 코드(원문을 저장하지 않고 해시만 보관)" |
| `UserWithdrawal` | 탈퇴한 회원의 이메일·이름·원 회원번호, 탈퇴 시각, **파기 예정 시각 = 탈퇴 + 30일** | 탈퇴 기록. 보유 근거는 재가입 차단 |

세 가지는 그대로 참이라 안 고쳐도 된다:

- 민감정보(진료 이력·건강 상태)는 여전히 수집하지 않는다
- 고유식별정보(주민등록번호 등)도 수집하지 않는다
- 행태정보·맞춤형 광고도 없다

### 계정은 HansApp 계정이다 — 위탁도 제3자 제공도 아니다

`.env.production` 을 보면 인증은 `auth.plzhans.com` / `api.plzhans.com` 이다. 계정 DB 는
hansapp 것이고 medifinder 는 거기 등록된 앱 클라이언트다. **plzhans 도 같은 운영자의 서비스이므로
개인정보처리자가 동일하다** — 처리위탁 조항도, 제3자 제공 조항도 필요 없다.

대신 그 사실을 방침에 밝힌다. 머리말에 한 문단을 넣는다.

- ko

  > MediFinder 의 계정은 운영자가 함께 운영하는 HansApp 계정입니다. 한 번 가입하면 운영자가
  > 운영하는 다른 서비스에도 같은 계정으로 로그인할 수 있으며, 계정 정보는 서비스별로 나뉘어
  > 있지 않고 하나로 관리됩니다. 계정 정보를 처리하는 주체는 이 방침의 운영자와 같습니다.

- en

  > MediFinder accounts are shared accounts operated by the Operator. A single sign-up allows
  > signing in to the Operator's other services with the same account; account information is
  > managed as one record rather than separately per service. The party processing account
  > information is the same Operator named in this policy.

이용약관 제2조의 "계정" 정의에도 같은 사실을 한 문장 붙인다.

> 6. "계정"이란 회원을 식별하기 위하여 운영자가 부여한 이용자 식별 수단을 말하며, 운영자가
>    운영하는 다른 서비스와 공유됩니다.

### ⚠ 진짜 구멍 — 가입 화면에 동의 절차가 없다

가입은 `frontend/hansapp-auth` 의 `Signup.tsx` 에서 일어나는데, 그 화면에 **약관 동의도,
개인정보 수집·이용 동의도, 만 14세 이상 확인도 없다.** 확인해 보면 그런 낱말 자체가 파일에
등장하지 않는다.

문서를 medifinder 쪽에서 아무리 잘 써 둬도, **동의를 받는 화면이 그 문서를 보여주지 않으면
법적으로 동의를 받은 것이 아니다.** 회원 연동을 열기 전에 hansapp-auth 쪽을 먼저 손봐야 한다.

- 이메일 가입: 폼 안, 제출 버튼 위에 동의 체크(약관·개인정보 수집이용 분리)와 만 14세 확인.
- 소셜 가입: **버튼을 누르기 전이 아니라 돌아온 뒤 `pending` 단계에서.** 버튼 앞에 두면
  로그인하려는 기존 회원까지 매번 동의 화면을 보게 되고, 제공자의 동의창은 "정보를 준다" 는
  동의지 우리 약관 동의가 아니다. `pending` 티켓이 15분이라 시간도 넉넉하다 —
  카카오·네이버·라인은 이미 그 구간에서 이메일 인증 코드를 기다리고 있다.
- 구글만 지금 `pending` 을 받자마자 `socialRegister` 로 직행한다. 거기에 화면이 하나 필요하다.
- 서버도 같이 막는다. `signup`·`socialRegister` 가 동의 여부를 받아 없으면 거절하고,
  **언제 어느 버전에 동의했는지 기록한다**(입증 책임이 처리자에게 있다).

링크할 문서는 **HansApp 계정 약관·방침**이다(`frontend/hansapp-web/src/features/legal`,
plzhans.com/terms/service · /terms/privacy). medifinder 문서를 링크하면 "다른 서비스의 약관에 동의하고
가입" 하는 모양이 된다.

---

## 2. 개인정보처리방침 — 고칠 자리

### 머리말 두 번째 문단 — 통째로 교체

- 지금: "서비스는 회원가입 절차가 없습니다. …"
- 바꿀 것(ko):

  > 서비스는 회원가입 없이 이용할 수 있습니다. 검색과 열람에는 계정이 필요하지 않으며,
  > 회원가입은 이용자가 선택한 경우에만 이루어집니다. 진료 이력이나 건강 상태 같은
  > 민감정보는 회원 여부와 관계없이 수집하지 않습니다.

- 바꿀 것(en):

  > The Service can be used without signing up. Searching and browsing require no account;
  > membership is created only if the user chooses to. Sensitive information such as treatment
  > history or health status is never collected, whether or not the user is a member.

### 제1조① 표 — 행 두 개 추가

| 구분 | 항목 | 수집 방법 |
|---|---|---|
| 회원 정보 | 이메일 주소, 표시 이름, 비밀번호(단방향 암호화하여 보관), 소셜 로그인으로 가입한 경우 제공자 이름과 제공자가 준 식별자 | 이용자가 회원가입하거나 소셜 계정을 연동할 때 입력하거나 제공자로부터 전달받습니다. |
| 로그인 세션 | 세션 식별자, 접속 기기의 브라우저·운영체제 종류(User-Agent), IP 주소 | 로그인할 때 자동으로 생성되며, 로그인 기기 목록 표시와 개별 로그아웃에 사용합니다. |

en:

| Category | Items | How it is collected |
|---|---|---|
| Membership information | Email address, display name, password (stored as a one-way hash), and for social sign-up the provider name and the identifier it supplies | Entered by the user at sign-up or account linking, or supplied by the social provider. |
| Login sessions | Session identifier, browser and operating system type (User-Agent), IP address | Created automatically at login; used to list signed-in devices and to sign out individual devices. |

### 제1조② — 교체

- 지금: "이름·생년월일·연락처 등 회원 정보, 진료 이력이나 … 수집하지 않습니다."
- 바꿀 것(ko):

  > ② 서비스는 진료 이력이나 건강 상태 등 민감정보와 주민등록번호 등 고유식별정보를 수집하지
  > 않습니다. 회원가입에는 이메일 주소만 필요하며, 생년월일·성별·연락처는 받지 않습니다.

- en:

  > (2) The Service does not collect sensitive information such as treatment history or health
  > status, or unique identifiers such as resident registration numbers. Sign-up requires only an
  > email address; date of birth, gender, and phone number are not collected.

### 제2조 — 목적에 한 줄 추가

> 5. 회원 정보와 로그인 세션: 회원 식별과 로그인 유지, 로그인 기기 관리, 부정 이용 방지, 문의 처리

> 5. Membership information and login sessions: identifying members, keeping them signed in,
>    managing signed-in devices, preventing abuse, and handling enquiries

### 제3조 표 — 행 세 개 추가

| 구분 | 보유 기간 |
|---|---|
| 회원 정보 | 회원 탈퇴 시까지 |
| 로그인 세션 | 세션 만료 또는 로그아웃 시 즉시 파기 |
| 탈퇴 기록(이메일, 이름) | 탈퇴일부터 30일. 같은 이메일의 즉시 재가입을 막기 위한 것이며, 30일이 지나면 회원 정보와 함께 완전히 삭제합니다. |

| Category | Retention period |
|---|---|
| Membership information | Until the member withdraws |
| Login sessions | Destroyed as soon as the session expires or the member signs out |
| Withdrawal records (email, name) | 30 days from withdrawal, to prevent immediate re-registration with the same address; deleted in full together with the membership record thereafter |

### 제5조 위탁 — 고치지 않는다

계정은 같은 운영자의 HansApp 계정이라 처리자가 동일하다(1절). 인증을 위탁으로 올리지 않는다.
표는 지금 그대로 두고, HansApp 계정 사실은 머리말에서 밝힌다.

### 제10조③ — 교체

- 지금: "서비스는 이용자를 식별할 수 있는 정보를 보유하지 않으므로 …"
- 바꿀 것(ko):

  > ③ 회원은 로그인한 상태에서 계정 설정을 통해 직접 열람·정정·삭제할 수 있습니다.
  > 회원이 아닌 이용자의 접속 기록이나 오류 진단 정보에 대해서는 서비스가 이용자를 식별할 수
  > 있는 정보를 보유하지 않으므로, 그 대상을 특정할 수 있는 정보(예: 접속 일시와 IP 주소)를
  > 함께 알려 주셔야 합니다.

- en:

  > (3) Members can view, correct, and delete their information directly in account settings while
  > signed in. For access logs and error diagnostics of non-members, the Service holds no
  > identifying information, so a request must include details that allow the records to be
  > identified (for example the time of access and the IP address).

### 제11조② — 로컬 저장소 목록에 한 줄 추가

> medifinder.auth — 로그인 상태를 유지하기 위한 토큰

이 줄을 넣는 순간 **"서버로 전송되지 않습니다" 가 거짓이 된다.** 인증 토큰은 API 요청마다
서버로 간다. 제11조②의 마지막 문장을 이렇게 고친다:

> 이 값은 이용자의 단말기에 저장됩니다. 위치 사용 여부는 서버로 전송되지 않으며, 로그인 토큰은
> 회원 요청을 처리하기 위해 서버로 전송됩니다.

### 관심 병원(찜·자주 가는 병원)을 만들면 — 행 하나 더

병원 좌표와 명칭 자체는 공공기관이 공개한 시설 정보라 개인정보가 아니다. **그런데 계정에 묶이는
순간 성격이 바뀐다** — "이 사람이 어느 의료기관에 관심이 있다" 는 정보가 되고, 진료 사실은
아니지만 그렇게 읽힐 소지가 있다. 의료기관이라 특히 조심할 값어치가 있다.

제1조① 표에 한 행:

| 관심 병원 | 회원이 저장한 의료기관의 식별자, 저장 시각 | 회원이 “찜” 등으로 직접 저장할 때 |

| Saved institutions | Identifiers of medical institutions saved by the member, and the time saved | Saved directly by the member |

제2조 목적:

> 6. 관심 병원: 회원이 저장한 의료기관을 다시 찾아볼 수 있게 하는 것

제3조 보유 기간:

> 관심 병원 — 회원이 삭제할 때까지. 탈퇴하면 회원 정보와 함께 파기합니다.

그리고 **다음 세 가지를 방침에 명시해 둘 것.** 안 적으면 나중에 추천·통계에 쓰고 싶어질 때
근거가 없다(목적 외 이용이 된다).

- 저장한 의료기관은 **추천·통계·광고에 이용하지 않는다.** 쓰려면 그때 별도 동의를 받는다.
- 제3자에게 제공하지 않는다.
- 저장은 회원의 선택이며 **진료를 받은 사실을 뜻하지 않는다** — 제1조② 의 "민감정보를 수집하지
  않습니다" 가 오해되지 않도록 한 문장 덧붙인다.

  > 회원이 저장한 의료기관 목록은 회원의 관심을 나타내는 것이며, 그 기관에서 진료를 받았다는
  > 사실을 뜻하지 않습니다. 운영자는 진료 이력을 수집하지 않습니다.

⚠ **검색 이력을 저장하기 시작하면 같은 문제가 더 크게 온다.** "최근 본 병원" 을 서버에 쌓으면
그것이 곧 관심 병력 목록이 된다. 단말기(로컬 저장소)에만 두면 이 절이 필요 없다 — 되도록
그쪽을 택할 것.

### 제13조 (만 14세 미만) — 교체

- 지금: "회원가입 절차가 없고 만 14세 미만 아동을 대상으로 개인정보를 수집하지 않습니다."
- 바꿀 것(ko):

  > ① 서비스는 만 14세 미만 아동의 회원가입을 받지 않습니다.
  > ② 운영자는 본인확인 절차를 두지 않으므로 이용자의 나이를 직접 확인하지 못합니다.
  > 회원가입 시 이용자가 만 14세 이상임을 스스로 확인하여 동의하도록 하고 있습니다.
  > ③ 만 14세 미만 아동이 가입한 사실을 알게 된 경우 지체 없이 해당 계정과 그 개인정보를
  > 삭제합니다.

- en:

  > (1) The Service does not accept sign-ups from children under the age of 14.
  > (2) The Operator does not run identity verification and therefore cannot directly confirm a
  > user's age. At sign-up, users are asked to confirm for themselves that they are 14 or older.
  > (3) If the Operator learns that a child under 14 has signed up, the account and its personal
  > information are deleted without delay.

**"확인합니다" 로 쓰지 말 것.** 우리가 검증한다는 뜻이 되는데 실제로는 이용자의 자기 선언을
믿는 것뿐이다. 본인인증도 없고, 소셜 로그인에서 생년월일을 요청하지도 않는다(요청하면 동의
항목이 늘고 제공자 심사도 무거워진다). 자기 선언은 법이 허용하는 방식이지만, 하지 않는 일을
한다고 적으면 그 문장 자체가 거짓이 된다.

---

## 3. 이용약관 — 두 줄이면 끝난다

**계정 조항을 여기 쓰지 않는다.** 이용계약의 성립, 계정 관리, 탈퇴, 계정 정지는 전부
HansApp 계정 이용약관(`frontend/hansapp-web/src/features/legal`)에 있다. medifinder 가 그것을
베껴 오면 두 문서가 갈라지고, 서비스가 늘 때마다 같은 조를 n 벌 관리하게 된다.

medifinder 약관에 더할 것은 둘뿐이다.

- **제2조(정의)** 에 한 호 추가

  > 5. "계정"이란 운영자가 운영하는 여러 서비스에 하나로 로그인할 수 있도록 제공하는
  >    HansApp 계정을 말합니다.

- **신설 (계정과 회원)**

  > ① 서비스는 회원가입 없이 이용할 수 있습니다. 계정이 필요한 기능을 이용하려면 HansApp
  > 계정으로 로그인해야 합니다.
  > ② 계정의 생성, 관리, 해지 등 계정에 관한 사항은 HansApp 계정 이용약관에 따릅니다.
  > ③ 계정의 이용이 정지되면 서비스의 계정 기능도 함께 이용할 수 없습니다.

en:

  > 5. "Account" means the HansApp account provided by the Operator for signing in to several
  >    of the Operator's services with a single credential.

  > (1) The Service can be used without an account. Signing in with a HansApp account is required
  > only for features that need one.
  > (2) Creation, management, and termination of the account are governed by the HansApp Account
  > Terms of Service.
  > (3) If the account is suspended, the account-based features of the Service become unavailable.

**제13조(이용의 제한)** 은 그대로 둔다 — 접속 차단은 medifinder 가 하고, 계정 정지는 HansApp 이
한다. 둘은 다른 조치라서 한 조에 섞지 않는다.

## 4. 위치기반서비스 이용약관 — 고칠 자리

- **제2조①** — "서비스에는 회원가입 절차가 없으므로 별도의 이용자 등록 절차는 없습니다" 를 뺀다.
  위치 기능은 회원 여부와 무관하게 동작하므로, 효력 발생 시점(위치 기능 실행 + 권한 허용)은 그대로 둔다.
- **제10조⑤** — 회원은 계정으로 특정할 수 있으므로, 제10조③(방침)과 같은 방식으로 두 갈래로 쓴다.
- **제11조(만 14세 미만)** — 회원가입에서 연령을 확인하게 되면, 위치정보법 제25조에 따라
  만 14세 미만 회원에게는 법정대리인 동의가 필요하다. 지금처럼 "대상으로 하지 않는다" 로 유지하려면
  가입 자체를 막아야 한다(제3절의 ⚠ 와 같은 조건).

---

## 5. 문서 밖에서 같이 해야 하는 것

- [x] ~~HansApp 계정 약관·개인정보처리방침을 plzhans 쪽에 만든다~~ →
      `frontend/hansapp-web/src/features/legal` (plzhans.com/terms/service · /terms/privacy). 다만 **문의 이메일
      주소가 아직 비어 있다** — 게시 전에 채울 것.
- [ ] **`frontend/hansapp-auth` 의 가입 화면을 손본다**(1절 ⚠). 동의 절차가 없는 지금 상태로는
      문서를 아무리 잘 써 둬도 동의를 받은 것이 되지 않는다.
- [ ] 가입 화면에 **약관 동의**와 **개인정보 수집·이용 동의**를 분리해 받는다(필수/선택 구분).
- [ ] 가입 화면에 **만 14세 이상 확인**을 넣는다. 없으면 방침 제13조를 쓸 수 없다.
- [ ] 계정 설정에 **열람·정정·삭제·탈퇴**를 실제로 만든다. 방침 제10조가 그것을 약속한다.
- [ ] `UserTokenSession` 이 IP 를 저장하므로 **로그인 기기 목록** 화면이 있어야 이용자가 그 사실을
      확인하고 지울 수 있다.
- [ ] 세 문서의 `effective` 와 부칙 날짜를 바꾸고, 시행 7일 전(불리한 변경이면 30일 전) 공지한다.
