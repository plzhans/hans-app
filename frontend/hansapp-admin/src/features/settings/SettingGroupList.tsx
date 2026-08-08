import { useQuery } from '@tanstack/react-query';

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
      {groups.map((group) => (
        <SettingGroupCard key={group.id} group={group} />
      ))}
    </div>
  );
}
