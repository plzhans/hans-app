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
 * 카테고리 하나를 그대로 펼치는 설정 화면.
 *
 * 화면이 카탈로그 목록 하나로 끝나지 않는 곳은 이걸 쓰지 않고 제 페이지를 갖는다 —
 * LLM 은 카드 아래에 접속처 목록이 붙고(LlmSettings), 외부 연동은 탭으로 갈린다
 * (IntegrationSettings). 대신 카드 렌더링은 셋 다 SettingGroupList 로 공유한다.
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
