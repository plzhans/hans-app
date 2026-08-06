import { Link } from 'react-router-dom';

/**
 * 하단 고지.
 *
 * **개인정보처리방침만 굵게 둔다.** 취향이 아니라 요건이다 — 개인정보 보호법은 처리방침을
 * 정보주체가 쉽게 확인할 수 있도록 다른 고지사항과 **구분하여** 표시하도록 요구한다. 어느
 * 사이트나 푸터에서 그것만 굵은 이유가 이것이다.
 *
 * **운영정책 같은 문서는 두지 않는다.** 커뮤니티 규칙이 필요한 건 이용자가 글을 남기는
 * 서비스인데 여기는 그런 게 없다 — 없는 문서를 링크에 세워 두면 빈 페이지만 는다.
 *
 * 사업자 정보(상호·대표·사업자등록번호·통신판매업신고번호) 블록도 없다. 개인이 운영하는
 * 무료 서비스라 표시 의무가 있는 항목이 아니다. 유료화하면 그때 이 자리에 생긴다.
 */
export function Footer() {
  return (
    /*
      **위쪽 여백을 주지 않는다.** 페이지 껍데기가 세로 flex 이고 본문이 flex-1 이라 짧은
      화면에서도 푸터가 바닥에 붙는데, 여기에 margin 을 더하면 그만큼 화면을 넘겨
      내용이 없는데도 스크롤바가 생긴다. 본문과의 간격은 main 의 아래 패딩이 맡는다.
    */
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-gray-400">
        {/* 왼쪽 브랜드, 오른쪽 링크. 좁으면 링크가 다음 줄로 내려간다. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p>
            <span className="font-bold text-gray-500">HansApp</span>
            <span className="ml-2">직접 만든 서비스들을 한 곳에서</span>
          </p>

          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/terms" className="text-gray-500 underline hover:text-gray-900">
              이용약관
            </Link>
            <Dot />
            <Link
              to="/privacy"
              className="font-bold text-gray-600 underline hover:text-gray-900"
            >
              개인정보처리방침
            </Link>
          </nav>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-gray-100 pt-4">
          <p>개인이 운영하는 서비스입니다.</p>
          <p>© {'2026'} plzhans.com</p>
        </div>
      </div>
    </footer>
  );
}

/** 항목 사이 구분점. 읽어 줄 내용이 없으니 스크린 리더에서는 숨긴다. */
function Dot() {
  return (
    <span aria-hidden className="text-gray-300">
      ·
    </span>
  );
}
