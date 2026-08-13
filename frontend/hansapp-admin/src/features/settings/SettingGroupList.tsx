import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';

import {
  listSettings,
  type SettingCategory,
  type SettingGroup,
} from '@/shared/api/settings';
import { errorMessage } from '@/shared/api/errorMessage';
import { SettingGroupCard } from './SettingGroupCard';

/**
 * 한 카테고리의 설정 카드들. **레이아웃을 갖지 않는다** — 페이지가 감싼다.
 *
 * SettingsPage 에서 떼어낸 것은 LLM 화면 때문이다. 그쪽은 카탈로그 카드 아래에 접속처
 * 목록을 같이 두어야 해서 페이지를 통째로 재사용할 수가 없다.
 *
 * 무엇을 그릴지는 서버가 준 카탈로그가 정한다. 설정이 하나 늘어도 이 파일은 그대로다.
 */
export function SettingGroupList({ category }: { category: SettingCategory }) {
  const query = useQuery({ queryKey: ['settings'], queryFn: listSettings });

  const groups: SettingGroup[] =
    query.data?.filter((g) => g.category === category) ?? [];

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        {errorMessage(query.error, '설정을 불러오지 못했습니다.')}
      </div>
    );
  }
  if (query.isLoading) {
    return (
      <div className="py-24 text-center text-sm text-gray-400">
        불러오는 중…
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-400">
        이 분류에 설정이 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <CacheNote />
      {groups.map((group) => (
        <SettingGroupCard key={group.id} group={group} />
      ))}
    </div>
  );
}

/**
 * 카드 위에 서는 안내. **저장한 값이 바로 안 먹는 시간이 있다는 것을 미리 말한다.**
 *
 * 값을 읽는 쪽은 DB 사본을 5분간 들고 있다(SettingCache). 저장한 화면(관리자 API)은 즉시
 * 비우지만 값을 실제로 쓰는 다른 서버는 만료를 기다린다 — 그 사이를 모르면 "안 바뀌었다" 로
 * 보고 같은 값을 다시 저장하게 된다.
 *
 * 카드가 하나라도 있을 때만 그린다 — 목록이 비었거나 못 불러온 화면에서는 할 말이 아니다.
 */
function CacheNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
      <Info className="mt-px h-4 w-4 shrink-0" />
      <span>
        저장한 값은 서버가 <b>5분간 캐시</b>합니다. 바꾼 값이 모든 서버에
        반영되기까지 최대 5분 걸립니다.
      </span>
    </p>
  );
}
