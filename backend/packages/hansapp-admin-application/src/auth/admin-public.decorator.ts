import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_PUBLIC_KEY = 'isAdminPublic';

/**
 * 전역 관리자 가드를 우회한다(로그인·토큰 갱신·로그아웃·헬스체크).
 *
 * 공개 API 의 `@Public()` 과 **메타데이터 키가 다르다.** 두 가드가 한 프로세스에 같이
 * 뜰 일은 없지만, 키를 공유하면 어느 쪽 데코레이터를 붙여도 통과해서 실수가 드러나지 않는다.
 */
export const AdminPublic = () => SetMetadata(IS_ADMIN_PUBLIC_KEY, true);
