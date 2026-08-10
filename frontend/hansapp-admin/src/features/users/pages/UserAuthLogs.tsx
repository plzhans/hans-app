import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  getUser,
  listUserAuthLogs,
  type UserAuthLog,
  type AuthLogActionType,
} from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import {
  getDisplayTimeZone,
  splitDateTime,
} from '@/shared/lib/formatDateTime';
import { zonedDayBoundary } from '@/shared/lib/timeZone';
import { Badge } from '@/shared/ui/Badge';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { AUTH_ACTION_ITEMS, AUTH_ACTION_LABEL } from '../authActionLabels';
import { UserTabs } from '../components/UserTabs';

const PAGE_SIZE = 30;

const COLUMNS =
  'grid-cols-[150px_130px_72px_minmax(0,1fr)_140px] gap-4 px-6';

/** 기간 빠른 선택. 값은 "며칠 전부터" 이고, 0 은 전체 기간이다. */
const PERIODS: { days: number; label: string }[] = [
  { days: 0, label: '전체' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
];

/** `YYYY-MM-DD` 로. 날짜 입력칸이 쓰는 모양이다. */
function toDateInput(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function daysAgo(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days + 1);
  return toDateInput(at);
}

/**
 * 회원 인증 기록.
 *
 * **기본은 전체 기간·전체 액션이다.** 이 화면을 여는 이유가 대개 "무슨 일이 있었나" 라서,
 * 처음부터 좁혀 두면 찾으려던 것이 화면 밖에 있다. 좁히는 건 관리자가 한다.
 *
 * 조건은 전부 URL 쿼리에 둔다 — 새로고침해도 보던 화면이 남고, 링크를 그대로 넘길 수 있다.
 */
export default function UserAuthLogs() {
  const { id } = useParams();
  const userId = Number(id);
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const actions = (params.get('actions')?.split(',').filter(Boolean) ??
    []) as AuthLogActionType[];

  // 상세 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  const logQuery = useQuery({
    queryKey: ['user-auth-logs', userId, { page, from, to, actions }],
    queryFn: () =>
      listUserAuthLogs(userId, {
        page,
        size: PAGE_SIZE,
        /*
          날짜 입력은 시간대가 없는 값이라 **표시 시간대의 하루 경계**로 바꿔 보낸다.
          브라우저 시간대로 계산하면 표에 찍힌 날짜와 걸러지는 경계가 어긋난다.
        */
        from: from
          ? zonedDayBoundary(from, 'start', getDisplayTimeZone())
          : undefined,
        to: to ? zonedDayBoundary(to, 'end', getDisplayTimeZone()) : undefined,
        actions: actions.length ? actions : undefined,
      }),
    enabled: Number.isFinite(userId),
    placeholderData: keepPreviousData,
  });

  /** 조건을 바꾼다. **페이지는 1로 되돌린다** — 좁힌 결과가 그 페이지까지 없을 수 있다. */
  const applyFilter = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    merged.delete('page');
    setParams(merged);
  };

  const toggleAction = (action: AuthLogActionType) => {
    const next = actions.includes(action)
      ? actions.filter((a) => a !== action)
      : [...actions, action];
    applyFilter({ actions: next.join(',') });
  };

  const goPage = (next: number) => {
    const merged = new URLSearchParams(params);
    merged.set('page', String(next));
    setParams(merged);
    window.scrollTo({ top: 0 });
  };

  const data = logQuery.data;
  const filtered = !!(from || to || actions.length);

  return (
    <AdminLayout
      title={userQuery.data?.email ?? '회원 상세'}
      breadcrumbs={[
        { label: '회원', to: '/users' },
        { label: userQuery.data ? `#${userId}` : '상세' },
      ]}
      actions={
        <Link
          to="/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          목록
        </Link>
      }
    >
      <UserTabs userId={userId} current="authLog" />

      <div className="mb-4 space-y-3">
        <Filter label="기간">
          {PERIODS.map((period) => {
            // "전체" 는 두 칸이 모두 비었을 때만 켜진 것으로 본다.
            const active =
              period.days === 0
                ? !from && !to
                : from === daysAgo(period.days) && to === toDateInput(new Date());
            return (
              <Chip
                key={period.days}
                active={active}
                onClick={() =>
                  applyFilter(
                    period.days === 0
                      ? { from: '', to: '' }
                      : {
                          from: daysAgo(period.days),
                          to: toDateInput(new Date()),
                        },
                  )
                }
              >
                {period.label}
              </Chip>
            );
          })}

          <span className="ml-1 flex items-center gap-1.5">
            <DateInput
              value={from}
              max={to || undefined}
              onChange={(value) => applyFilter({ from: value })}
            />
            <span className="text-sm text-gray-300">~</span>
            <DateInput
              value={to}
              min={from || undefined}
              onChange={(value) => applyFilter({ to: value })}
            />
          </span>
        </Filter>

        <Filter label="종류">
          <Chip active={actions.length === 0} onClick={() => applyFilter({ actions: '' })}>
            전체
          </Chip>
          {AUTH_ACTION_ITEMS.map((item) => (
            <Chip
              key={item.value}
              active={actions.includes(item.value)}
              onClick={() => toggleAction(item.value)}
            >
              {item.label}
            </Chip>
          ))}
        </Filter>
      </div>

      {logQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(logQuery.error, '인증 기록을 불러오지 못했습니다.')}
        </div>
      ) : logQuery.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          {filtered
            ? '조건에 맞는 기록이 없습니다.'
            : '남아 있는 기록이 없습니다.'}
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['시각', '종류', '결과', '접속 정보', 'IP']}
            minWidth="min-w-[820px]"
          >
            {data.items.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </Table>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            totalCount={data.totalCount}
            onChange={goPage}
          />
        </>
      )}
    </AdminLayout>
  );
}

/**
 * 기록 한 줄. **누르면 그 자리에서 아래로 펼쳐진다.**
 *
 * 모달로 띄우지 않는 이유는 여러 줄을 나란히 펼쳐 놓고 눈으로 견주기 때문이다 —
 * 모달은 한 번에 하나뿐이라 "이 로그인과 저 로그인이 같은 기기인가" 를 볼 수 없다.
 * 펼침 상태는 줄마다 따로 들고 있어 몇 개든 동시에 열어 둘 수 있다.
 */
function LogRow({ log }: { log: UserAuthLog }) {
  const [open, setOpen] = useState(false);
  const at = splitDateTime(log.createdAt);
  const failed = log.result === 'FAIL';

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={cn(
          'grid w-full items-center py-3.5 text-left transition hover:bg-gray-50',
          open && 'bg-gray-50',
          COLUMNS,
        )}
      >
        <span className="flex items-center gap-1.5 text-sm text-gray-500">
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform',
              open && 'rotate-90',
            )}
          />
          <span>
            {at?.date ?? '—'}
            <span className="block text-xs text-gray-400">{at?.time}</span>
          </span>
        </span>

        <span className="text-sm font-medium text-gray-900">
          {AUTH_ACTION_LABEL[log.action] ?? log.action}
          {log.provider && (
            <span className="block text-xs font-normal text-gray-400">
              {log.provider}
            </span>
          )}
        </span>

        <span>
          <Badge tone={failed ? 'red' : 'green'}>
            {failed ? '실패' : '성공'}
          </Badge>
        </span>

        {/*
          실패 사유가 있으면 그걸 먼저 보여 준다 — 실패한 줄에서 알고 싶은 건 기기가 아니라
          왜 막혔나다. 성공한 줄에는 기기 정보가 그 자리를 쓴다.
        */}
        <span className="min-w-0 truncate text-sm text-gray-500">
          {log.failReason ? (
            <span className="text-red-600">{log.failReason}</span>
          ) : (
            (log.userAgent ?? '—')
          )}
        </span>

        <span className="font-mono text-xs text-gray-400">{log.ip ?? '—'}</span>
      </button>

      {open && <LogDetail log={log} />}
    </div>
  );
}

/**
 * 펼친 내용.
 *
 * **줄에서 잘린 것을 여기서 온전히 본다** — user agent 는 표에서 한 줄로 잘리고,
 * detail 은 아예 칸이 없다. 그래서 이 자리가 "이 기록의 전부" 여야 한다.
 */
function LogDetail({ log }: { log: UserAuthLog }) {
  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-6 py-4">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <DetailField label="로그 id">
          <span className="font-mono text-xs">{log.id}</span>
        </DetailField>
        <DetailField label="발생 시각">
          {/* 표는 두 줄로 쪼개 보여 주므로 여기서는 원본 ISO 도 함께 남긴다. */}
          <span className="font-mono text-xs">{log.createdAt}</span>
        </DetailField>
        <DetailField label="IP">
          <span className="font-mono text-xs">{log.ip ?? '—'}</span>
        </DetailField>
        <DetailField label="수단">{log.provider ?? '—'}</DetailField>
        {log.failReason && (
          <DetailField label="실패 사유">
            <span className="text-red-600">{log.failReason}</span>
          </DetailField>
        )}
      </dl>

      <DetailBlock label="접속 기기">
        {log.userAgent ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-600">
            {log.userAgent}
          </pre>
        ) : (
          <p className="text-xs text-gray-400">기록 없음</p>
        )}
      </DetailBlock>

      <DetailBlock label="확장 정보 (detail)">
        {log.detail == null ? (
          <p className="text-xs text-gray-400">
            없음. 아직 이 값을 채우는 이벤트가 없습니다.
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100">
            {JSON.stringify(log.detail, null, 2)}
          </pre>
        )}
      </DetailBlock>
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-700">{children}</dd>
    </div>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-gray-400">{label}</p>
      {children}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-8 shrink-0 text-xs font-semibold text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm transition',
        active
          ? 'bg-primary-50 font-semibold text-primary-700'
          : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  );
}

function DateInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-gray-300 px-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
    />
  );
}
