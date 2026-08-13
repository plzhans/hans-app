import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import { getUser, listUserApps, type UserApp } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { cn } from '@/shared/lib/cn';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';
import {
  DISPLAY_LABEL,
  DISPLAY_TONE,
  displayStatus,
  type AppDisplayStatus,
} from '@/features/apps/appStatus';
import { UserTabs } from '../components/UserTabs';

/** 표 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_88px_88px_150px_150px_32px] gap-4 px-6';

/**
 * 앱을 묶는 단위. **화면이 이 차례로 그린다.**
 *
 * 승인 흐름의 세 값(작성 중·심사 중·거절)을 「승인 대기」 하나로 묶는다 — 회원을 볼 때
 * 필요한 것은 "이 사람 앱이 지금 열려 있나" 이고, 어디까지 갔는지는 줄의 상태 뱃지가
 * 그대로 말해 준다. 그 구분까지 표를 갈라 놓으면 한두 줄짜리 상자가 넷이 된다.
 *
 * **중지(차단)를 따로 둔다.** 승인은 받았지만 지금 막혀 있는 것이라 「승인됨」 에 섞으면
 * 제목이 거짓말이 되고, 삭제도 대기도 아니다.
 */
const GROUPS: { title: string; of: AppDisplayStatus[] }[] = [
  { title: '승인됨', of: ['ACTIVE'] },
  { title: '승인 대기', of: ['DRAFT', 'REVIEWING', 'REJECTED'] },
  { title: '중지', of: ['DISABLED'] },
  { title: '삭제됨', of: ['DELETED'] },
];

/** 목록 칸의 시각. 날짜·시각을 두 줄로 나눈다(앱·회원 목록과 같은 규칙). */
function DateTimeCell({ iso }: { iso: string }) {
  const parts = splitDateTime(iso);
  if (!parts) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span className="text-sm text-gray-500">
      {parts.date}
      <span className="block text-xs text-gray-400">{parts.time}</span>
    </span>
  );
}

/**
 * 회원이 소유·참여하는 앱.
 *
 * **줄을 누르면 앱 상세로 간다.** 여기서 답할 것은 "무엇을 몇 개 들고 있나" 까지고,
 * 키·클라이언트·심사 이력은 앱 쪽 화면이 이미 다 그린다 — 같은 것을 여기 또 그리면
 * 둘 중 한쪽만 고쳐지는 날이 온다.
 *
 * **상태로 묶어 그린다**(GROUPS). 한 표에 섞어 놓으면 지금 쓰는 앱과 지워진 앱을 줄마다
 * 뱃지를 읽어 갈라야 하는데, 이 화면에서 묻는 것이 대개 "쓰는 게 몇 개냐" 다.
 *
 * **삭제된 앱도 나온다.** 멤버 행이 남아 있는 한 개요의 앱 수에도 잡히므로, 여기서 빼면
 * 수와 줄 수가 어긋난다.
 *
 * 페이지를 나누지 않는다 — 앱은 등급별 생성 한도가 있어 한 사람이 가진 수가 적다.
 */
export default function UserApps() {
  const { id } = useParams();
  const userId = Number(id);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  const appQuery = useQuery({
    queryKey: ['user-apps', userId],
    queryFn: () => listUserApps(userId),
    enabled: Number.isFinite(userId),
  });

  const apps = appQuery.data;

  return (
    <AdminLayout
      title={userQuery.data?.email ?? '회원 상세'}
      breadcrumbs={[
        { label: '회원', to: '/users' },
        { label: userQuery.data ? `#${userId}` : '상세' },
      ]}
    >
      <BackLink to="/users" />

      <UserTabs userId={userId} current="app" />

      {appQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(appQuery.error, '앱 목록을 불러오지 못했습니다.')}
        </div>
      ) : appQuery.isLoading || !apps ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : apps.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          소유하거나 참여 중인 앱이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const rows = apps.filter((app) =>
              group.of.includes(displayStatus(app)),
            );
            // **빈 묶음은 아예 안 그린다.** 대부분의 회원은 한두 묶음만 채운다.
            if (rows.length === 0) return null;

            return (
              <section key={group.title}>
                <h2 className="mb-2 text-sm font-semibold text-gray-900">
                  {group.title}
                  <span className="ml-1.5 font-normal text-gray-400">
                    {rows.length}
                  </span>
                </h2>
                <Table
                  columns={COLUMNS}
                  head={['id', '앱 이름', '상태', '역할', '참여일', '등록일', '']}
                  minWidth="min-w-[820px]"
                >
                  {rows.map((app) => (
                    <AppRow key={app.id} app={app} />
                  ))}
                </Table>
              </section>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

/** 앱 한 줄. 누르면 앱 상세로 간다. */
function AppRow({ app }: { app: UserApp }) {
  const display = displayStatus(app);

  return (
    <Link
      to={`/apps/${app.id}`}
      className={cn(
        'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
        COLUMNS,
        // 삭제된 앱은 흐리게 — 묶음이 갈려 있어도 살아 있는 앱과 무게가 달라야 한다.
        app.deletedAt && 'opacity-60',
      )}
    >
      <span className="font-mono text-sm text-gray-400">{app.id}</span>
      <span className="truncate font-medium text-gray-900">{app.name}</span>
      {/*
        **묶음 제목이 있어도 상태를 적는다.** 「승인 대기」 안에서 작성 중·심사 중·거절이
        갈리고, 그 구분이 다음에 할 일(기다린다·심사한다·사유를 본다)을 정한다.
      */}
      <span>
        <Badge tone={DISPLAY_TONE[display]}>{DISPLAY_LABEL[display]}</Badge>
      </span>
      {/*
        **OWNER·ADMIN·MEMBER 를 그대로 적는다.** 앱 상세의 멤버 표와 같은 표기라,
        한쪽만 번역해 두면 같은 값이 두 화면에서 달리 보인다.
      */}
      <span className="text-sm text-gray-600">{app.role}</span>
      <DateTimeCell iso={app.joinedAt} />
      <DateTimeCell iso={app.createdAt} />
      <ChevronRight className="h-4 w-4 text-gray-300" />
    </Link>
  );
}
