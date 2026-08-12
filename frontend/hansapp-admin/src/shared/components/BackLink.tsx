import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * 상세 화면에서 목록으로 돌아가는 링크. **본문 맨 위에 둔다.**
 *
 * 제목 줄(`AdminLayout` 의 `actions`)에 두면 바로 옆 사이트맵과 자리가 겹친다 — 같은
 * 곳으로 가는 길이 한 뼘 안에 둘이 되고, 정작 상세를 보다 돌아가려는 사람은 화면 위로
 * 눈을 올려야 한다. 본문에 두면 탭·내용과 같은 흐름에서 눌린다.
 *
 * 아래 여백을 컴포넌트가 들고 있다. 놓이는 자리가 한 군데뿐이라 화면마다 붙이면 값만
 * 어긋난다.
 */
export function BackLink({
  to,
  label = '목록',
}: {
  to: string;
  /** 돌아갈 곳의 이름. 기본은 "목록". */
  label?: string;
}) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-primary"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
