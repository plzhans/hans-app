import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import { getUser } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { languageLabel } from '@/shared/lib/timeZone';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { UserEditModal } from '../UserEditModal';
import { UserTabs } from '../components/UserTabs';
import { STATUS_LABEL, STATUS_TONE } from '../statusTone';

export default function UserDetail() {
  const { id } = useParams();
  const userId = Number(id);
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    // id 가 숫자가 아니면(주소를 손으로 고친 경우) 서버를 부르지 않는다.
    enabled: Number.isFinite(userId),
  });

  const user = query.data;

  return (
    <AdminLayout
      title={user?.email ?? '회원 상세'}
      breadcrumbs={[
        { label: '회원', to: '/users' },
        { label: user ? `#${user.id}` : '상세' },
      ]}
    >
      <BackLink to="/users" />

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '회원 정보를 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading || !user ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : (
        <div className="space-y-6">
          <UserTabs userId={user.id} current="overview" />

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[user.status]}>
              {STATUS_LABEL[user.status]}
            </Badge>
            {!user.emailVerified && <Badge tone="amber">이메일 미인증</Badge>}
            {user.role === 'ADMIN' && <Badge tone="blue">ADMIN</Badge>}
          </div>

          {/*
            **수정 버튼은 계정 머리에 둔다.** 고칠 값(이름)이 바로 아래에 있어, 무엇이
            바뀌는지 보면서 누르게 된다(관리자 상세와 같은 배치).
          */}
          <Section
            title="계정"
            actions={
              <Button
                type="button"
                variant="outline"
                className="h-9 w-auto px-3"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" />
                수정
              </Button>
            }
          >
            <Field label="id">
              <span className="font-mono">{user.id}</span>
            </Field>
            <Field label="이메일">
              <span className="break-all">{user.email}</span>
            </Field>
            <Field label="이메일 인증">
              {user.emailVerified ? (
                '인증됨'
              ) : (
                <span className="text-amber-600">미인증</span>
              )}
            </Field>
            <Field label="이름">{user.name ?? '—'}</Field>
            <Field label="등급">{user.tier}</Field>
            <Field label="가입 수단">{user.joinType}</Field>
            <Field label="이메일 로그인">
              {/* 서버는 해시를 내보내지 않는다. 가능 여부만 온다. */}
              {user.hasPassword ? '가능' : '불가 (소셜 전용)'}
            </Field>
            {/*
              **표시 설정도 계정 정보다**(관리자 상세와 같은 배치). 정한 적이 없으면 값이
              비는데, 그때 무엇을 따르는지까지 적어 둔다 — 빈칸만 보이면 "안 나온 것" 과
              "안 정한 것" 이 구별되지 않는다.
            */}
            <Field label="언어">
              {user.language ? (
                languageLabel(user.language)
              ) : (
                <span className="text-gray-400">
                  미설정 (요청 헤더를 따름)
                </span>
              )}
            </Field>
            <Field label="시간대">
              {user.timeZone ?? (
                <span className="text-gray-400">미설정</span>
              )}
            </Field>
            <Field label="가입일">{formatDateTime(user.createdAt)}</Field>
            <Field label="최종 수정">{formatDateTime(user.updatedAt)}</Field>
            {user.withdrawnAt && (
              <Field label="탈퇴일">{formatDateTime(user.withdrawnAt)}</Field>
            )}
            {/*
              **활동 섹션을 따로 두지 않는다.** 앱 수는 이 계정을 볼 때 같이 읽는 값이라,
              카드를 갈라 두면 같은 계정을 두 상자에서 훑게 된다. 하나하나는 탭에 있다.

              **세션 수는 여기 적지 않는다.** 기기 탭이 그 답을 온전히 들고 있는데, 개요에
              숫자만 한 줄 더 두면 탭과 어긋날 자리만 늘어난다.
            */}
            <Field label="참여 중인 앱">
              {/* 다음에 묻는 것은 "무슨 앱이냐" 다. 목록은 앱 탭이 그린다. */}
              <Link
                to={`/users/${user.id}/apps`}
                className="underline decoration-gray-300 underline-offset-2 transition hover:text-primary"
              >
                {user.appCount}개
              </Link>
            </Field>
          </Section>

          <Section title="소셜 연동">
            {user.oauths.length === 0 ? (
              <p className="col-span-full text-sm text-gray-400">
                연동된 소셜 계정이 없습니다.
              </p>
            ) : (
              user.oauths.map((o) => (
                <Field key={o.provider} label={o.provider}>
                  {o.email ?? '—'}
                  <span className="ml-2 text-xs text-gray-400">
                    {formatDateTime(o.connectedAt)} 연동
                  </span>
                </Field>
              ))
            )}
          </Section>

        </div>
      )}

      {editing && user && (
        <UserEditModal user={user} onClose={() => setEditing(false)} />
      )}
    </AdminLayout>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  /** 제목 줄 오른쪽에 놓을 버튼들(선택). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-800">{children}</dd>
    </div>
  );
}
