import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import { getApp } from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Table } from '@/shared/ui/Table';
import { AppClientModal } from '../AppClientModal';
import {
  AppModerationModal,
  type ModerationAction,
} from '../AppModerationModal';
import { DISPLAY_LABEL, DISPLAY_TONE, displayStatus } from '../appStatus';
import { formatDateTime } from '@/shared/lib/formatDateTime';

// 표 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다.
const MEMBER_COLUMNS = 'grid-cols-[72px_minmax(0,1fr)_100px_150px] gap-4 px-6';
const KEY_COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_180px_80px_150px_150px] gap-4 px-6';
const CLIENT_COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_90px_120px_80px_150px_32px] gap-4 px-6';

export default function AppDetail() {
  /*
    **모달을 URL 이 연다.** `/apps/:id/clients/:clientId` 도 이 화면으로 라우팅되고,
    clientId 가 있으면 모달을 띄운다. 그래서 브라우저 뒤로가기로 닫히고 링크 공유도 된다 —
    useState 로 열면 둘 다 안 된다.
  */
  const { id, clientId } = useParams();
  const navigate = useNavigate();
  const appId = Number(id);
  const openClientId = clientId ? Number(clientId) : null;

  /*
    조치 모달은 URL 이 아니라 state 로 연다. 클라이언트 상세와 달리 **공유할 화면이 아니라
    한 번 하고 끝나는 행위**라, 링크로 열리면 뒤로가기로 승인·차단 창이 되살아난다.
  */
  const [action, setAction] = useState<ModerationAction | null>(null);

  const query = useQuery({
    queryKey: ['app', appId],
    queryFn: () => getApp(appId),
    enabled: Number.isFinite(appId),
  });

  const app = query.data;
  const display = app ? displayStatus(app) : null;
  /*
    지금 이 앱에 취할 수 있는 조치. **지워진 앱은 대상이 아니다** — 소유자가 지운 것을
    운영자가 되살리는 것은 다른 이야기다.

      PENDING  : 승인 / 거절. 작성 중(심사 요청 전)이어도 승인은 열어 둔다 —
                 운영자가 먼저 켜 줘야 할 때가 있고 CLI 도 그렇게 동작한다.
      ACTIVE   : 차단
      DISABLED : 차단 해제
  */
  const actions: ModerationAction[] =
    !app || app.deletedAt
      ? []
      : app.status === 'PENDING'
        ? ['approve', 'reject']
        : app.status === 'ACTIVE'
          ? ['block']
          : ['unblock'];
  // 없는 id 로 들어오면(주소를 고쳤거나 방금 지워졌거나) 모달을 띄우지 않는다.
  const openClient =
    openClientId === null
      ? undefined
      : app?.clients.find((c) => c.id === openClientId);

  return (
    <AdminLayout
      title={app?.name ?? '앱 상세'}
      breadcrumbs={[
        { label: '앱', to: '/apps' },
        { label: app ? `#${app.id}` : '상세' },
      ]}
    >
      <BackLink to="/apps" />

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '앱 정보를 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading || !app || !display ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : (
        <div className="space-y-6">
          {/* 거절 사유는 운영자가 남기고 사용자에게 노출되는 값이라 눈에 띄게 둔다. */}
          {app.rejectionReason && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="font-semibold">거절 사유</span>
              <p className="mt-1 whitespace-pre-line">{app.rejectionReason}</p>
            </div>
          )}

          {/*
            **조치 버튼은 기본정보 머리에 둔다.** 누를지 말지는 바로 아래 상태를 보고
            정하는 것이라, 상태에서 멀어질수록 눈이 왔다 갔다 한다.
          */}
          <Section
            title="앱"
            actions={actions.map((a) => (
              <ActionButton key={a} action={a} onClick={() => setAction(a)} />
            ))}
          >
            <Field label="id">
              <span className="font-mono">{app.id}</span>
            </Field>
            <Field label="상태">
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge tone={DISPLAY_TONE[display]}>
                  {DISPLAY_LABEL[display]}
                </Badge>
                {app.deletedAt && <Badge tone="gray">삭제됨</Badge>}
              </span>
            </Field>
            <Field label="이름">{app.name}</Field>
            <Field label="소유자">
              {app.owner ? (
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">
                    #{app.owner.id}
                  </span>
                  <Link
                    to={`/users/${app.owner.id}`}
                    className="text-primary hover:underline"
                  >
                    {app.owner.email}
                  </Link>
                </span>
              ) : (
                <span className="text-gray-400">— (탈퇴했거나 없음)</span>
              )}
            </Field>
            <Field label="키 발급 상한">{app.apiKeyLimit}개</Field>
            <Field label="심사 요청">
              {formatDateTime(app.reviewRequestedAt)}
            </Field>
            <Field label="등록일">{formatDateTime(app.createdAt)}</Field>
            <Field label="최종 수정">{formatDateTime(app.updatedAt)}</Field>
            {app.deletedAt && (
              <Field label="삭제일">{formatDateTime(app.deletedAt)}</Field>
            )}
          </Section>

          <Panel title={`멤버 (${app.members.length})`}>
            {app.members.length === 0 ? (
              <Empty>멤버가 없습니다.</Empty>
            ) : (
              <Table
                columns={MEMBER_COLUMNS}
                head={['회원 id', '이메일', '역할', '참여일']}
                minWidth="min-w-[560px]"
              >
                {app.members.map((m, i) => (
                  <Row key={`${m.role}-${i}`} columns={MEMBER_COLUMNS}>
                    <span className="font-mono text-sm text-gray-400">
                      {m.user?.id ?? '—'}
                    </span>
                    <span className="truncate">
                      {m.user ? (
                        <Link
                          to={`/users/${m.user.id}`}
                          className="text-primary hover:underline"
                        >
                          {m.user.email}
                        </Link>
                      ) : (
                        <span className="text-gray-400">— (탈퇴)</span>
                      )}
                    </span>
                    <span className="text-sm text-gray-600">{m.role}</span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(m.joinedAt)}
                    </span>
                  </Row>
                ))}
              </Table>
            )}
          </Panel>

          {/*
            **키 행은 누를 수 없다.** 클라이언트와 달리 표에 안 들어가는 값이 없어서
            상세 화면을 만들 이유가 없다 — 원문·해시는 서버가 아예 안 주고, 나머지는
            여기 다 있다. 스코프·만료 같은 것이 생기면 그때 클라이언트처럼 모달을 붙인다.
          */}
          <Panel title={`서비스 키 (${app.apiKeys.length})`}>
            {app.apiKeys.length === 0 ? (
              <Empty>발급된 키가 없습니다.</Empty>
            ) : (
              <Table
                columns={KEY_COLUMNS}
                head={['id', '이름', '접두사', '상태', '발급', '마지막 사용']}
                minWidth="min-w-[800px]"
              >
                {app.apiKeys.map((k) => (
                  <Row key={k.id} columns={KEY_COLUMNS}>
                    <span className="font-mono text-sm text-gray-400">
                      {k.id}
                    </span>
                    <span className="truncate text-sm text-gray-900">
                      {k.name}
                    </span>
                    {/* 원문·해시는 서버가 내보내지 않는다. 식별용 접두사뿐이다. */}
                    <span className="truncate font-mono text-xs text-gray-500">
                      {k.keyPrefix}…
                    </span>
                    <span className="text-sm text-gray-600">{k.status}</span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(k.createdAt)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(k.lastUsedAt)}
                    </span>
                  </Row>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title={`OAuth 클라이언트 (${app.clients.length})`}>
            {app.clients.length === 0 ? (
              <Empty>등록된 클라이언트가 없습니다.</Empty>
            ) : (
              <Table
                columns={CLIENT_COLUMNS}
                head={[
                  'id',
                  '이름 / Client ID',
                  '플랫폼',
                  'Client Secret',
                  '상태',
                  '마지막 사용',
                  '',
                ]}
                minWidth="min-w-[820px]"
              >
                {app.clients.map((c) => (
                  <Link
                    key={c.id}
                    to={`/apps/${app.id}/clients/${c.id}`}
                    className={cn(
                      'grid items-center border-b border-gray-100 py-3 transition last:border-0 hover:bg-gray-50',
                      CLIENT_COLUMNS,
                    )}
                  >
                    <span className="font-mono text-sm text-gray-400">
                      {c.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-900">
                        {c.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-gray-400">
                        {c.clientId}
                      </span>
                    </span>
                    <span className="text-sm text-gray-600">{c.type}</span>
                    <span className="font-mono text-xs text-gray-500">
                      {c.secretSuffix ? `****${c.secretSuffix}` : '—'}
                    </span>
                    <span className="text-sm text-gray-600">{c.status}</span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(c.lastUsedAt)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </Link>
                ))}
              </Table>
            )}
          </Panel>
        </div>
      )}

      {openClient && (
        <AppClientModal
          client={openClient}
          // 닫으면 앱 상세로 되돌린다. replace 를 쓰면 뒤로가기로 다시 열리지 않는다.
          onClose={() => navigate(`/apps/${appId}`)}
        />
      )}

      {app && action && (
        <AppModerationModal
          app={app}
          action={action}
          onClose={() => setAction(null)}
        />
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

/** 조치별 버튼 모양. 되돌리기 어려운 것(거절·차단)만 붉게 둔다. */
const ACTION_STYLE: Record<
  ModerationAction,
  { label: string; variant: 'primary' | 'outline'; className: string }
> = {
  approve: { label: '승인', variant: 'primary', className: '' },
  reject: {
    label: '거절',
    variant: 'outline',
    className: 'text-red-600 hover:bg-red-50',
  },
  block: {
    label: '차단',
    variant: 'outline',
    className: 'text-red-600 hover:bg-red-50',
  },
  unblock: { label: '차단 해제', variant: 'primary', className: '' },
};

function ActionButton({
  action,
  onClick,
}: {
  action: ModerationAction;
  onClick: () => void;
}) {
  const style = ACTION_STYLE[action];
  return (
    <Button
      type="button"
      variant={style.variant}
      className={cn('h-9 w-auto px-4', style.className)}
      onClick={onClick}
    >
      {style.label}
    </Button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid items-center border-b border-gray-100 py-3 last:border-0',
        columns,
      )}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400">
      {children}
    </div>
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
