import { useQuery } from '@tanstack/react-query';

import {
  listSettings,
  type SettingCategory,
  type SettingGroup,
} from '@/shared/api/settings';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { SettingGroupCard } from '../SettingGroupCard';

interface Props {
  category: SettingCategory;
  title: string;
  description: string;
  /** 사이트맵의 마지막 조각. */
  crumb: string;
}

/**
 * 설정 화면. **메일과 외부 연동이 같은 컴포넌트를 쓴다** — 다른 것은 어느 카테고리를
 * 거르느냐뿐이다.
 *
 * 무엇을 그릴지는 서버가 준 카탈로그가 정한다. 그래서 설정이 하나 늘어도 이 파일은
 * 그대로다 — 백엔드 카탈로그에 한 줄 더하면 화면에 나타난다.
 */
export default function SettingsPage({
  category,
  title,
  description,
  crumb,
}: Props) {
  const query = useQuery({ queryKey: ['settings'], queryFn: listSettings });

  const groups: SettingGroup[] =
    query.data?.filter((g) => g.category === category) ?? [];

  return (
    <AdminLayout
      title={title}
      description={description}
      breadcrumbs={[{ label: '설정' }, { label: crumb }]}
    >
      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '설정을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-400">
          이 분류에 설정이 없습니다.
        </div>
      ) : (
        <div className="max-w-4xl space-y-2.5">
          {groups.map((group) => (
            <SettingGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
