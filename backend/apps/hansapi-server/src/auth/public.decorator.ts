import { SetMetadata } from '@nestjs/common';

/** 전역 AuthGuard 를 우회(인증 없이 허용)하는 라우트에 붙인다. 예: 헬스체크. */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
