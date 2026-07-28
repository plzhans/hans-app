import { SetMetadata } from '@nestjs/common';

/** 1st-party 전용 라우트 표시 메타데이터 키. */
export const FIRST_PARTY_ONLY_KEY = 'firstPartyOnly';

/**
 * **1st-party(포털) 오리진에서만** 부를 수 있는 라우트에 붙인다.
 *
 * 대상은 client_id 로 인증하지 않는 흐름 — 로그인·가입·토큰 교환처럼 **refresh 쿠키**를
 * 세팅/사용하는 것들이다. 여긴 대조할 client_id 가 없으므로 client 별 origins 대신
 * 서비스 루트 도메인(APP_ROOT_DOMAIN) 범위로 검사한다.
 *
 * @Public() 라우트에도 적용된다(인증은 건너뛰되 오리진은 본다).
 * Origin 헤더가 없는 요청(서버·curl·네이티브)은 CORS 대상이 아니므로 통과시킨다.
 */
export const FirstPartyOnly = () => SetMetadata(FIRST_PARTY_ONLY_KEY, true);
