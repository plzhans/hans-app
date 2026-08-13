import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';

import { listAdmins } from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import {
  ADMIN_ROLE_LABEL,
  ADMIN_ROLE_TONE,
} from '@/shared/lib/adminRoles';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';
import { Tabs } from '@/shared/ui/Tabs';
import { AdminCreateModal } from '../AdminCreateModal';

/** 표 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_130px_110px_120px_150px_150px_32px] gap-4 px-6';

/**
 * 살아 있는 계정과 지운 계정.
 *
 * **한 표에 섞지 않는다.** 이 화면을 여는 질문이 "지금 누가 들어올 수 있나" 인데, 들어올 수
 * 없는 계정이 같은 목록에 있으면 그 답이 흐려진다 — 지운 계정을 보는 것은 되짚을 때뿐이라
 * 성격이 아예 다르다.
 */
type AdminListTab = 'active' | 'deleted';

const TABS = [
  { value: 'active' as const, label: '계정' },
  { value: 'deleted' as const, label: '삭제된 계정' },
];

/**
 * 목록 칸의 시각. 회원·앱 목록과 같은 규칙으로 날짜와 시각을 두 줄로 나눈다.
 */
function DateTimeCell({ iso }: { iso?: string | null }) {
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
 * 관리자 목록.
 *
 * **검색도 페이징도 없다.** 계정이 몇 개뿐이라 나눌 것이 없고, 이 화면을 여는 이유가
 * "지금 누가 콘솔에 들어올 수 있는가" 라서 한 화면에 다 보이는 편이 낫다.
 */
export default function Admins() {
  const me = useAuthStore((s) => s.me);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<AdminListTab>('active');
  const deleted = tab === 'deleted';

  /*
    **탭마다 캐시를 따로 둔다.** 같은 키를 쓰면 탭을 옮길 때 옛 목록이 잠깐 그대로 보이고,
    한쪽에서 계정을 지웠을 때 다른 쪽이 낡은 채로 남는다.
  */
  const query = useQuery({
    queryKey: ['admins', deleted ? 'deleted' : 'active'],
    queryFn: () => listAdmins(deleted),
  });
  const rows = query.data ?? [];

  return (
    <AdminLayout
      title="관리자"
      description="이 콘솔에 로그인할 수 있는 계정입니다."
      breadcrumbs={[{ label: '관리자' }]}
    >
      <Tabs className="mb-5" items={TABS} value={tab} onChange={setTab} />

      {/*
        **추가 버튼은 표 바로 위에 둔다.** 제목 줄(AdminLayout 의 actions)은 빵부스러기가
        앉는 자리라, 거기에 주 버튼을 얹으면 "지금 어디" 를 알려 주는 것과 "무엇을 한다" 가
        한 덩어리로 붙어 버린다. 목록의 총수도 여기서 함께 본다 — 다른 목록은 페이저가
        그 값을 보여 주는데 이 화면에는 페이저가 없다.
      */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          {query.isSuccess ? `전체 ${rows.length}명` : ''}
        </p>
        {/* 지운 계정 탭에서는 추가 버튼을 감춘다 — 여기서 만들 것이 없다. */}
        {!deleted && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            관리자 추가
          </button>
        )}
      </div>

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '관리자 목록을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          {deleted ? '지운 계정이 없습니다.' : '계정이 없습니다.'}
        </div>
      ) : (
        <Table
          columns={COLUMNS}
          head={[
            'id',
            '이메일',
            '이름',
            '등급',
            '상태',
            '마지막 로그인',
            // 지운 계정 목록에서 궁금한 것은 언제 지웠나다. 생성일은 상세에 있다.
            deleted ? '삭제일' : '생성일',
            '',
          ]}
          minWidth="min-w-[980px]"
        >
          {rows.map((admin) => (
            <Link
              key={admin.id}
              to={`/admins/${admin.id}`}
              className={cn(
                'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
                COLUMNS,
                // 로그인이 막힌 계정은 흐리게 — 목록에 섞여 있어도 한눈에 갈린다.
                (admin.status !== 'ACTIVE' || admin.deletedAt) && 'opacity-60',
              )}
            >
              <span className="font-mono text-sm text-gray-400">
                {admin.id}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-gray-900">
                  {admin.email}
                </span>
                {/* 지금 이 화면을 보고 있는 계정. 삭제가 막히는 이유이기도 하다. */}
                {admin.id === me?.id && <Badge tone="blue">나</Badge>}
              </span>
              <span className="truncate text-sm text-gray-600">
                {admin.name ?? '—'}
              </span>
              {/* 등급이 상태보다 앞이다 — 목록을 여는 이유가 "누가 어디까지 할 수 있나" 라서. */}
              <span>
                <Badge tone={ADMIN_ROLE_TONE[admin.role]}>
                  {ADMIN_ROLE_LABEL[admin.role]}
                </Badge>
              </span>
              <span className="flex items-center gap-1.5">
                {/*
                  **지운 계정은 상태 칸에 그렇게 적는다.** 지운 계정에는 활성·중지가 아무
                  뜻이 없다 — 어느 쪽이든 로그인이 막혀 있다.
                */}
                {admin.deletedAt ? (
                  <Badge tone="red">삭제됨</Badge>
                ) : (
                  <>
                    <Badge tone={admin.status === 'ACTIVE' ? 'green' : 'gray'}>
                      {admin.status === 'ACTIVE' ? '활성' : '중지'}
                    </Badge>
                    {admin.mustChangePassword && (
                      <Badge tone="amber">변경 대기</Badge>
                    )}
                  </>
                )}
              </span>
              <DateTimeCell iso={admin.lastLoginAt} />
              <DateTimeCell iso={deleted ? admin.deletedAt : admin.createdAt} />
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
          ))}
        </Table>
      )}

      {creating && <AdminCreateModal onClose={() => setCreating(false)} />}
    </AdminLayout>
  );
}
