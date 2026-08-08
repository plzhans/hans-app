import type { SettingCategory } from '@/shared/api/settings';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { SettingGroupList } from '../SettingGroupList';

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
 * LLM 은 이걸 쓰지 않는다. 카탈로그 카드 아래에 접속처 목록이 붙어서 제 페이지가 필요하다
 * (LlmSettings 참고) — 대신 카드 렌더링은 SettingGroupList 로 공유한다.
 */
export default function SettingsPage({
  category,
  title,
  description,
  crumb,
}: Props) {
  return (
    <AdminLayout
      title={title}
      description={description}
      breadcrumbs={[{ label: '설정' }, { label: crumb }]}
    >
      <div className="max-w-4xl">
        <SettingGroupList category={category} />
      </div>
    </AdminLayout>
  );
}
