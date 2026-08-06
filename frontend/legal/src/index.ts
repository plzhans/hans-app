import type { LegalDoc } from './types';
import accountTerms from './account-terms.ko.json';
import privacy from './privacy.ko.json';
import apiTerms from './api-terms.ko.json';

export type { LegalDoc, LegalSection, LegalBlock } from './types';
export { LegalDocumentView } from './LegalDocumentView';

/**
 * HansApp 계정 약관·방침의 본문. **조문은 JSON 에 있고 코드에는 없다.**
 *
 * [왜 앱이 아니라 패키지에 있나]
 *
 * 같은 조문을 **포털(문서 페이지)과 인증웹(가입 화면의 동의 레이어)이 함께** 보여준다.
 * 앱마다 복사해 두면 개정할 때 한쪽만 고치는 일이 반드시 생기는데, 화면 문구라면 어색한 정도로
 * 끝나지만 약관은 **어느 쪽에 동의했는지가 달라진다.** 그래서 한 벌만 둔다.
 *
 * 서비스별 문서(medifinder 의 이용약관·위치약관 등)는 여기 두지 않는다. 그것들은 그 서비스
 * 하나만 쓰는 글이고 언어 구성도 다르다 — 계정 계층과 서비스 계층을 섞지 않는 규칙 그대로다.
 *
 * [문서를 고칠 때]
 *
 * 조문은 코드가 아니라 문서다. 소셜 로그인 심사처럼 밖에 낼 일이 생기면 JSON 파일을 그대로
 * 건넨다. 개정하면 `effective` 와 부칙 날짜를 함께 고치고, 시행 7일 전(이용자에게 불리한
 * 변경이면 30일 전) 공지한다.
 */
export const accountTermsDoc = accountTerms as LegalDoc;
export const privacyDoc = privacy as LegalDoc;

/**
 * API 이용약관. **아직 어느 앱도 화면에 붙이지 않았다 — 일부러 그렇게 뒀다.**
 *
 * 화면에 올리는 순간 "API 를 유료로 연다" 는 계획이 공개된다. 문서는 미리 써 두되 공개는
 * 개방 시점에 한다. 붙일 때 `effective` 와 부칙의 날짜를 먼저 채운다(지금은 "미정" 이다).
 *
 * **문서만으로는 열 수 없다.** 그 전에 세 가지가 먼저다:
 *   · data.go.kr 활용신청 내역에서 API 별 공공누리 유형과 제3자 재제공 조건을 확인
 *   · `source='web'`(심평원 홈페이지에서 긁은 의원급 비급여) 을 응답에서 분리 — 이용 조건이
 *     없는 자료라 유료로 넘기면 안 된다
 *   · 사업자등록·통신판매업 신고 여부 판단. 유료화하면 계정·서비스 문서의 "개인이 운영하는
 *     서비스" 가 전부 거짓이 된다(푸터의 운영 주체 표시까지 바뀐다)
 */
export const apiTermsDoc = apiTerms as LegalDoc;
