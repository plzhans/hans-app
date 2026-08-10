import { useSearchParams } from 'react-router-dom';

import type { SettingCategory } from '@/shared/api/settings';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Tabs } from '@/shared/ui/Tabs';
import { SettingGroupList } from '../SettingGroupList';

type Tab = Extract<SettingCategory, 'oauth' | 'integration'>;

const TABS = [
  { value: 'oauth', label: '외부 인증 연동' },
  { value: 'integration', label: '외부 서비스 연동' },
] as const satisfies readonly { value: Tab; label: string }[];

const DESCRIPTION: Record<Tab, string> = {
  oauth: '소셜 로그인 제공자의 Client ID·Secret 입니다.',
  integration: '공공데이터·주소 등 외부 서비스의 인증키입니다.',
};

const DEFAULT_TAB: Tab = 'oauth';

function tabOf(raw: string | null): Tab {
  // 모르는 값이면 기본 탭. 손으로 고친 URL 때문에 빈 화면이 뜨면 안 된다.
  return TABS.some((t) => t.value === raw) ? (raw as Tab) : DEFAULT_TAB;
}

/**
 * 외부 연동 설정. **한 메뉴 안에서 탭으로 가른다.**
 *
 * 로그인 자격증명과 서비스 키는 발급처도 갱신 주기도 다르지만, 둘 다 "바깥에서 받아 온 키"
 * 라 같이 관리한다. 메뉴를 둘로 늘리면 사이드바만 길어진다.
 *
 * **어느 탭인지는 URL 쿼리에 둔다**(회원·앱 목록의 페이지·검색어와 같은 방식). 새로고침해도
 * 보던 탭이 유지되고 링크를 그대로 남에게 보낼 수 있다 — state 로만 들고 있으면 둘 다 안 된다.
 */
export default function IntegrationSettings() {
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));

  const select = (next: Tab): void => {
    // 기본 탭이면 쿼리를 지운다 — /settings/integrations 가 곧 기본 화면이다.
    const query: Record<string, string> =
      next === DEFAULT_TAB ? {} : { tab: next };
    // 탭 전환은 히스토리에 쌓지 않는다. 뒤로가기가 탭 왕복으로 채워지면 화면을 못 빠져나간다.
    setParams(query, { replace: true });
  };

  return (
    <AdminLayout
      title="외부 연동"
      description={DESCRIPTION[tab]}
      breadcrumbs={[{ label: '설정' }, { label: '외부 연동' }]}
    >
      <div className="max-w-4xl">
        <Tabs items={TABS} value={tab} onChange={select} className="mb-4" />
        <SettingGroupList category={tab} />
      </div>
    </AdminLayout>
  );
}
