import type { LegalDoc } from './types';
import accountTerms from './account-terms.ko.json';
import privacy from './privacy.ko.json';
import apiTerms from './api-terms.ko.json';

export type { LegalDoc, LegalSection, LegalBlock } from './types';

/**
 * HansApp 계정 약관·방침의 본문. **조문은 JSON 에 있고 코드에는 없다.**
 *
 * 조문은 코드가 아니라 문서다 — 개정은 조 단위로 일어나고, 소셜 로그인 심사처럼 밖에 낼 일이
 * 생기면 파일을 그대로 건네야 한다. 여기(.ts)에는 그 문서를 꺼내는 통로만 둔다.
 *
 * [계정 계층과 서비스 계층을 섞지 않는다]
 *
 * 여기 있는 두 문서는 **계정에 관한 것만** 담는다 — 가입·탈퇴·계정 관리·소셜 연동, 그리고 그
 * 과정에서 처리하는 개인정보. 각 서비스가 무엇을 하는지, 그 서비스가 자체로 무엇을 수집하는지는
 * 그 서비스가 자기 문서에 쓴다(medifinder-web/src/features/legal 이 그 예다).
 *
 * 서비스가 늘어날 때마다 계정 문서를 복제하지 않는다. 서비스 문서가 "회원·계정에 관한 사항은
 * HansApp 계정 약관에 따릅니다" 한 줄로 이쪽을 가리키면 된다. 계정 정책을 바꿀 때 고칠 곳도
 * 여기 한 곳뿐이다.
 *
 * [한국어만 둔다]
 * 포털에는 i18n 이 없다. 다국어가 필요한 서비스(medifinder)는 자기 문서를 자기 언어로 갖는다.
 */
export const accountTermsDoc = accountTerms as LegalDoc;
export const privacyDoc = privacy as LegalDoc;

/**
 * API 이용약관. **아직 라우트가 없다 — 일부러 그렇게 뒀다.**
 *
 * 화면에 붙이는 순간 "API 를 유료로 연다" 는 계획이 공개된다. 문서는 미리 써 두되 공개는
 * 개방 시점에 한다. 붙일 때 할 일:
 *   1. `effective` 와 부칙의 날짜를 채운다(지금은 "미정" 이다)
 *   2. pages/ 에 화면을 만들고 App.tsx 에 공개 라우트를 더한다
 *
 * **문서만으로는 열 수 없다.** 그 전에 세 가지가 먼저다:
 *   · data.go.kr 활용신청 내역에서 API 별 공공누리 유형과 제3자 재제공 조건을 확인
 *   · `source='web'`(심평원 홈페이지에서 긁은 의원급 비급여) 을 응답에서 분리 — 이용 조건이
 *     없는 자료라 유료로 넘기면 안 된다
 *   · 사업자등록·통신판매업 신고 여부 판단. 유료화하면 계정·서비스 문서의 "개인이 운영하는
 *     서비스" 가 전부 거짓이 된다(푸터의 운영 주체 표시까지 바뀐다)
 */
export const apiTermsDoc = apiTerms as LegalDoc;
