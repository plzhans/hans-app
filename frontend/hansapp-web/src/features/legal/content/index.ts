/**
 * 약관 본문은 **@hansapp/legal 에 있다.** 포털과 인증웹(가입 화면의 동의 레이어)이 같은 조문을
 * 보여주므로 한 벌만 두고 양쪽이 읽는다 — 앱마다 복사하면 개정할 때 한쪽만 고치게 되고,
 * 약관은 그 순간 "어느 쪽에 동의했는지" 가 달라진다.
 *
 * 이 파일은 화면 코드가 패키지 경로를 직접 알지 않게 감싸는 통로다.
 */
export {
  accountTermsDoc,
  privacyDoc,
  apiTermsDoc,
  LegalDocumentView,
} from '@hansapp/legal';
export type { LegalDoc, LegalSection, LegalBlock } from '@hansapp/legal';
