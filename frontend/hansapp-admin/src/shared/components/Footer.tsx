import { APP_ENV, APP_RELEASE } from '@/shared/config/env';

/**
 * 관리 화면 하단 띠.
 *
 * **버전을 숨기지 않는다.** 포털 푸터는 저작권 표시를 다섯 번 눌러야 산출물 버전이 나오는데,
 * 그건 방문자에게 의미 없는 값을 평소에 안 보이게 하려는 것이다. 여기는 사정이 반대다 —
 * 보는 사람이 운영자이고, "지금 뜬 화면이 어느 빌드인가" 는 배포 직후 가장 먼저 확인하는 값이다.
 * 숨겨 두면 그때마다 개발자도구를 열어야 한다.
 *
 * **약관·개인정보처리방침 링크는 두지 않는다.** 그 고지는 서비스를 쓰는 이용자에게 하는
 * 것이라 대상이 다르고, 관리 화면은 로그인한 운영자만 들어온다.
 *
 * 서버 버전은 아직 못 보여 준다 — 관리자 API 에 `/version` 이 없다. 생기면 포털 푸터처럼
 * 화면(admin)과 서버(api)를 나란히 놓으면 된다.
 */
export function Footer() {
  return (
    /*
      **위쪽 여백을 주지 않는다.** 레이아웃이 세로 flex 이고 본문이 flex-1 이라 짧은 화면에서도
      바닥에 붙는데, 여기에 margin 을 더하면 그만큼 넘쳐 내용이 없는데도 스크롤이 생긴다.
    */
    <footer className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-gray-500">
        <p>
          <span className="font-bold text-gray-700">HansApp</span>
          <span className="ml-2">관리자</span>
        </p>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-gray-400">
            <span title="이 화면(프론트) 산출물">admin v{APP_RELEASE}</span>
            {' · '}
            <span title="실행 환경">{APP_ENV}</span>
          </span>
          <span className="text-gray-400">© 2026 plzhans.com</span>
        </p>
      </div>
    </footer>
  );
}
