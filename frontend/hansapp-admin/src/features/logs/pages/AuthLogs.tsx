import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';

import {
  listAuthLogs,
  type AuthLog,
  type AuthLogParams,
} from '@/shared/api/authLogs';
import type { AuthLogActionType } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ActionFilter } from '@/shared/components/logUi';
import { AUTH_ACTION_ITEMS, AUTH_ACTION_LABEL } from '@/shared/lib/authActions';
import { cn } from '@/shared/lib/cn';
import { getDisplayTimeZone, splitDateTime } from '@/shared/lib/formatDateTime';
import { zonedDayBoundary } from '@/shared/lib/timeZone';
import {
  useSearchCommit,
  type SearchFilters,
} from '@/shared/lib/useSearchCommit';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { TextField } from '@/shared/ui/TextField';

const PAGE_SIZE = 30;

const COLUMNS =
  'grid-cols-[150px_minmax(0,1fr)_130px_72px_minmax(0,1fr)_130px] gap-4 px-6';

/**
 * 기간 빠른 선택. **"전체" 가 없다.**
 *
 * 대상을 안 가리는 조회라 `(created_at)` 인덱스가 유일한 버팀목이고, 기간이 빠지면 표를
 * 통째로 읽는다. 서버도 `from` 없이는 400 으로 거절하므로 없는 선택지를 만들지 않는다.
 */
const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
];

const DEFAULT_DAYS = 7;

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
 * 전역 인증 기록.
 *
 * **회원 상세의 "인증 기록" 탭과 답하는 질문이 다르다.** 거기는 "이 사람이 뭘 했나" 이고,
 * 여기는 "지금 무슨 일이 벌어지나" 다 — 실패가 몰리는지, 한 IP 가 여러 계정을 두드리는지,
 * 없는 계정으로 시도가 오는지.
 *
 * 마지막 것은 **여기서만 보인다.** 없는 이메일로의 로그인 시도는 회원번호가 비어서 어느
 * 회원에도 안 붙는다 — 회원 상세를 아무리 뒤져도 안 나온다.
 */
export default function AuthLogs() {
  /*
    **검색을 눌러야 조회가 나간다.** 기간을 바꾸고 종류를 고르고 결과를 좁히는 사이에
    질의가 세 번 나가면, 관리자가 조건을 만지작거리는 동안 로그 DB 가 계속 얻어맞는다.
    칩·날짜는 초안만 바꾸고, 커밋된 조건(URL)이 있을 때만 부른다.
  */
  const { committed, draft, setDraft, commit, page, goPage, dirty } =
    useSearchCommit({
      from: daysAgo(DEFAULT_DAYS),
      to: toDateInput(new Date()),
      actions: '',
      result: '',
      who: '',
      anonymous: '',
    });

  const from = draft.from;
  const to = draft.to;
  const result = draft.result;
  const anonymousOnly = draft.anonymous === 'true';

  const request = committed ? toRequest(committed, page) : undefined;

  const query = useQuery({
    queryKey: ['auth-logs', request],
    // enabled 가 request 유무를 보므로 이 함수가 도는 시점엔 반드시 있다.
    queryFn: () => listAuthLogs(request!),
    enabled: !!request,
    placeholderData: keepPreviousData,
  });

  const data = query.data;

  return (
    <AdminLayout
      title="인증"
      description="로그인·가입·비밀번호·소셜연동·탈퇴 기록입니다. 회원을 가리지 않고 전체를 봅니다."
      breadcrumbs={[{ label: '로그' }, { label: '인증' }]}
    >
      {/*
        조건 전체를 폼 하나로 묶는다. 어디서 엔터를 쳐도 검색이 나가고, 그 밖에는
        아무 데를 눌러도 조회가 나가지 않는다.
      */}
      <form
        className="mb-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Filter label="기간">
          {PERIODS.map((period) => (
            <Chip
              key={period.days}
              active={
                from === daysAgo(period.days) && to === toDateInput(new Date())
              }
              onClick={() =>
                setDraft({
                  from: daysAgo(period.days),
                  to: toDateInput(new Date()),
                })
              }
            >
              {period.label}
            </Chip>
          ))}
          <span className="ml-1 flex items-center gap-1.5">
            <DateInput
              value={from}
              max={to}
              onChange={(value) => setDraft({ from: value })}
            />
            <span className="text-sm text-gray-300">~</span>
            <DateInput
              value={to}
              min={from}
              onChange={(value) => setDraft({ to: value })}
            />
          </span>
        </Filter>

        <Filter label="결과">
          <Chip active={!result} onClick={() => setDraft({ result: '' })}>
            전체
          </Chip>
          <Chip
            active={result === 'FAIL'}
            onClick={() => setDraft({ result: 'FAIL' })}
          >
            실패만
          </Chip>
          <Chip
            active={result === 'SUCCESS'}
            onClick={() => setDraft({ result: 'SUCCESS' })}
          >
            성공만
          </Chip>

          {/*
            **이 화면에만 있는 조건이다.** 회원번호가 비어 있는 행 — 없는 계정으로의
            로그인 시도가 여기 걸린다. 회원 상세에서는 어디에도 안 붙어 보이지 않는다.
          */}
          <span className="ml-3">
            <Chip
              active={anonymousOnly}
              onClick={() =>
                setDraft({ anonymous: anonymousOnly ? '' : 'true' })
              }
            >
              미가입 계정 시도만
            </Chip>
          </span>
        </Filter>

        <ActionFilter
          items={AUTH_ACTION_ITEMS}
          value={draft.actions}
          onChange={(actions) => setDraft({ actions })}
        />

        <Filter label="대상">
          <TextField
            placeholder="이메일 · 회원번호 · IP"
            value={draft.who}
            onChange={(e) => setDraft({ who: e.target.value })}
            className="h-8 w-64 text-xs"
          />
          {draft.who && (
            <button
              type="button"
              onClick={() => setDraft({ who: '' })}
              className="text-xs text-gray-400 hover:underline"
            >
              지우기
            </button>
          )}
        </Filter>

        <Filter label="">
          <Button type="submit" className="h-8 w-auto px-5">
            <Search className="h-3.5 w-3.5" />
            검색
          </Button>
          {/* 조건을 바꿔 놓고 안 누른 상태를 알려 준다 — 화면과 표가 어긋나 보이는 자리다. */}
          {committed && dirty && (
            <span className="text-xs text-amber-600">
              조건이 바뀌었습니다. 검색을 누르세요.
            </span>
          )}
        </Filter>
      </form>

      {!committed ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          조건을 고르고 검색을 누르세요.
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '인증 기록을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          조건에 맞는 기록이 없습니다.
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['시각', '회원', '종류', '결과', '접속 정보', 'IP']}
            minWidth="min-w-[980px]"
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

/** 콤마로 붙어 있는 종류 조건을 푼다. */
function splitActions(value: string): AuthLogActionType[] {
  return value.split(',').filter(Boolean) as AuthLogActionType[];
}

/** 커밋된 조건 + 페이지 → 조회 요청. */
function toRequest(filters: SearchFilters, page: number): AuthLogParams {
  const actions = splitActions(filters.actions);
  return {
    page,
    size: PAGE_SIZE,
    from: zonedDayBoundary(filters.from, 'start', getDisplayTimeZone()),
    to: zonedDayBoundary(filters.to, 'end', getDisplayTimeZone()),
    actions: actions.length ? actions : undefined,
    result: filters.result
      ? (filters.result as 'SUCCESS' | 'FAIL')
      : undefined,
    /*
      **한 칸으로 셋을 받는다.** 관리자가 손에 쥔 단서가 이메일일 때도, 회원번호일
      때도, IP 일 때도 있는데 칸을 셋으로 나누면 어디에 넣을지부터 고민하게 된다.
      모양으로 갈라 준다 — @ 가 있으면 이메일, 숫자면 회원번호, 나머지는 IP.
    */
    ...whoFilter(filters.who),
    anonymousOnly: filters.anonymous === 'true' || undefined,
  };
}

/** 검색어 한 칸을 모양으로 갈라 조건에 넣는다. */
function whoFilter(who: string): {
  userEmail?: string;
  userId?: number;
  ip?: string;
} {
  const value = who.trim();
  if (!value) return {};
  if (value.includes('@')) return { userEmail: value };
  if (/^\d+$/.test(value)) return { userId: Number(value) };
  return { ip: value };
}

function LogRow({ log }: { log: AuthLog }) {
  const [open, setOpen] = useState(false);
  const at = splitDateTime(log.createdAt);
  const failed = log.result === 'FAIL';

  const toggle = () => setOpen((prev) => !prev);

  // 안에 회원 링크가 들어가므로 `<button>` 이 아니다(LlmUsageLogs 와 같은 이유).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        className={cn(
          'grid w-full cursor-pointer items-center py-3.5 text-left transition hover:bg-gray-50',
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

        <UserCell log={log} />

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

        <span className="min-w-0 truncate text-sm text-gray-500">
          {log.failReason ? (
            <span className="text-red-600">{log.failReason}</span>
          ) : (
            (log.userAgent ?? '—')
          )}
        </span>

        <span className="font-mono text-xs text-gray-400">{log.ip ?? '—'}</span>
      </div>

      {open && <LogDetail log={log} />}
    </div>
  );
}

/**
 * 회원 칸.
 *
 * **세 가지 상태를 갈라 보여준다** — 이메일이 있으면 그것을(누르면 상세로), 번호만 있으면
 * 번호를(탈퇴로 이미 지워진 회원), 둘 다 없으면 "미가입" 이다. 마지막이 이 화면의 요점이다.
 */
function UserCell({ log }: { log: AuthLog }) {
  if (log.userId == null) {
    return (
      <span className="text-sm text-amber-600" title="없는 계정으로의 시도">
        미가입 계정
      </span>
    );
  }
  return (
    <Link
      to={`/users/${log.userId}`}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 truncate text-sm text-gray-700 transition hover:text-primary hover:underline"
    >
      {log.userEmail ?? `#${log.userId}`}
    </Link>
  );
}

function LogDetail({ log }: { log: AuthLog }) {
  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-6 py-4">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="로그 id">
          <span className="font-mono text-xs">{log.id}</span>
        </Field>
        <Field label="발생 시각">
          <span className="font-mono text-xs">{log.createdAt}</span>
        </Field>
        <Field label="회원">
          {log.userId == null ? (
            <span className="text-amber-600">
              — 없는 계정으로의 시도라 회원이 없습니다
            </span>
          ) : (
            <Link
              to={`/users/${log.userId}`}
              className="text-gray-700 hover:text-primary hover:underline"
            >
              {log.userEmail ?? `#${log.userId} (지워진 회원)`}
            </Link>
          )}
        </Field>
        <Field label="IP">
          <span className="font-mono text-xs">{log.ip ?? '—'}</span>
        </Field>
        <Field label="수단">{log.provider ?? '—'}</Field>
        {log.failReason && (
          <Field label="실패 사유">
            <span className="text-red-600">{log.failReason}</span>
          </Field>
        )}
      </dl>

      <Block label="접속 기기">
        {log.userAgent ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-600">
            {log.userAgent}
          </pre>
        ) : (
          <p className="text-xs text-gray-400">기록 없음</p>
        )}
      </Block>

      <Block label="확장 정보 (detail)">
        {log.detail == null ? (
          <p className="text-xs text-gray-400">
            없음. 아직 이 값을 채우는 이벤트가 없습니다.
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100">
            {JSON.stringify(log.detail, null, 2)}
          </pre>
        )}
      </Block>
    </div>
  );
}

function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-8 shrink-0 text-xs font-semibold text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Field({
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

function Block({
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
