import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';

import {
  listLlmUsageLogs,
  type LlmUsageLog,
  type LlmUsageLogParams,
} from '@/shared/api/llmUsageLogs';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
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
  'grid-cols-[150px_130px_minmax(0,1fr)_130px_80px_110px] gap-4 px-6';

/**
 * 기간 빠른 선택. **"전체" 가 없다.**
 *
 * 이 표의 인덱스는 `(created_at, …)` 라 시각이 앞자리다 — 기간을 빼면 어떤 조건을 붙여도
 * 표를 통째로 훑는다. 서버도 `from` 없이는 거절하므로, 화면에 있지도 않은 선택지를
 * 만들지 않는다. 대신 `request_id` 로 찾을 때는 기간을 안 본다(단독 인덱스가 있다).
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

/** 1240 → "1.2K". 토큰 수는 자릿수만 맞으면 되고, 정확한 값은 펼쳐서 본다. */
function shortNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/**
 * LLM 호출 이력.
 *
 * **합산하지 않는다.** 사용량·정산은 별도로 기록하고, 이 화면은 말 그대로 이력이다 —
 * "이 호출 하나에 무슨 일이 있었나" 에만 답한다. 그래서 상단에 토큰 합계 같은 것을 두지
 * 않았다. 여기에 합계를 띄우면 정산의 정본이 둘로 보이고, 캐시 히트(토큰 0)나 유실된
 * 한 건 때문에 두 값이 어긋난 채로 굳는다.
 *
 * 조건은 전부 URL 쿼리에 둔다 — 새로고침해도 보던 화면이 남고 링크를 그대로 넘길 수 있다.
 */
export default function LlmUsageLogs() {
  /*
    **검색을 눌러야 조회가 나간다.** 기간·호출 종류를 고르는 동안 칩마다 질의가 나가면
    조건을 다 고르기도 전에 로그 DB 를 서너 번 훑는다. 칩은 초안만 바꾸고,
    커밋된 조건(URL)이 있을 때만 부른다.
  */
  const { committed, draft, setDraft, commit, page, goPage, dirty } =
    useSearchCommit({
      // 기간은 비워 둘 수 없다. 처음 들어오면 최근 7일로 시작한다.
      from: daysAgo(DEFAULT_DAYS),
      to: toDateInput(new Date()),
      requestId: '',
      cached: '',
    });

  const from = draft.from;
  const to = draft.to;
  const requestId = draft.requestId;
  const cachedParam = draft.cached;

  const request = committed ? toRequest(committed, page) : undefined;

  const query = useQuery({
    queryKey: ['llm-usage-logs', request],
    // enabled 가 request 유무를 보므로 이 함수가 도는 시점엔 반드시 있다.
    queryFn: () => listLlmUsageLogs(request!),
    enabled: !!request,
    placeholderData: keepPreviousData,
  });

  const data = query.data;

  return (
    <AdminLayout
      title="LLM 사용"
      description="LLM 호출 이력입니다. 사용량 집계가 아니라 개별 호출을 추적하는 화면입니다."
      breadcrumbs={[{ label: '로그' }, { label: 'LLM 사용' }]}
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
        <Row label="기간">
          {PERIODS.map((period) => (
            <Chip
              key={period.days}
              active={
                !requestId &&
                from === daysAgo(period.days) &&
                to === toDateInput(new Date())
              }
              onClick={() =>
                setDraft({
                  from: daysAgo(period.days),
                  to: toDateInput(new Date()),
                  requestId: '',
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
              onChange={(value) => setDraft({ from: value, requestId: '' })}
            />
            <span className="text-sm text-gray-300">~</span>
            <DateInput
              value={to}
              min={from}
              onChange={(value) => setDraft({ to: value, requestId: '' })}
            />
          </span>
        </Row>

        <Row label="호출">
          <Chip active={!cachedParam} onClick={() => setDraft({ cached: '' })}>
            전체
          </Chip>
          <Chip
            active={cachedParam === 'false'}
            onClick={() => setDraft({ cached: 'false' })}
          >
            실제 호출
          </Chip>
          <Chip
            active={cachedParam === 'true'}
            onClick={() => setDraft({ cached: 'true' })}
          >
            캐시 적중
          </Chip>

          {/*
            추적 id 검색. **기간을 무시한다** — 애플리케이션 로그에서 id 만 들고 넘어오는
            길이라, 그 호출이 언제였는지 모르는 게 보통이다.
          */}
          <span className="ml-2 flex items-center gap-1.5">
            <TextField
              placeholder="request id 로 찾기 (기간 무시)"
              value={requestId}
              onChange={(e) => setDraft({ requestId: e.target.value })}
              className="h-8 w-64 text-xs"
            />
            {requestId && (
              <button
                type="button"
                onClick={() => setDraft({ requestId: '' })}
                className="text-xs text-gray-400 hover:underline"
              >
                지우기
              </button>
            )}
          </span>
        </Row>

        <Row label="">
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
        </Row>
      </form>

      {!committed ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          조건을 고르고 검색을 누르세요.
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '호출 이력을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          {requestId
            ? '그 request id 로 남은 호출이 없습니다.'
            : '이 기간에 남은 호출이 없습니다.'}
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['시각', '기능', '모델', '토큰(입력/출력)', '소요', '앱/회원']}
            minWidth="min-w-[900px]"
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

/** 커밋된 조건 + 페이지 → 조회 요청. */
function toRequest(
  filters: SearchFilters,
  page: number,
): LlmUsageLogParams {
  return {
    page,
    size: PAGE_SIZE,
    /*
      **추적 id 로 찾을 때는 기간을 안 보낸다.** 로그에서 id 하나만 들고 넘어오는
      길이라, 그 호출이 언제였는지 모르는 게 보통이다. 서버도 그때는 기간을
      요구하지 않는다(request_id 단독 인덱스로 바로 찾는다).
    */
    ...(filters.requestId
      ? { requestId: filters.requestId }
      : {
          from: zonedDayBoundary(filters.from, 'start', getDisplayTimeZone()),
          to: zonedDayBoundary(filters.to, 'end', getDisplayTimeZone()),
        }),
    cached: filters.cached ? filters.cached === 'true' : undefined,
  };
}

/** 조건 한 줄. 왼쪽 이름표 폭을 맞춰 칩들이 세로로 정렬된다. */
function Row({
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

/**
 * 호출 한 줄. **누르면 그 자리에서 아래로 펼쳐진다.**
 *
 * 이 표는 칸이 18개라 한 줄에 다 못 넣는다 — 프롬프트 판, 질문 해시, 업체 요청 id,
 * 토큰 4종은 펼쳐야 보인다. 모달이 아닌 이유는 인증 기록과 같다: 여러 줄을 나란히
 * 펼쳐 놓고 견줘야 "이 호출과 저 호출이 같은 프롬프트였나" 를 볼 수 있다.
 */
function LogRow({ log }: { log: LlmUsageLog }) {
  const [open, setOpen] = useState(false);
  const at = splitDateTime(log.createdAt);

  const toggle = () => setOpen((prev) => !prev);

  /*
    **줄이 `<button>` 이 아니라 `role="button"` 인 div 다.** 안에 앱·회원으로 가는 링크가
    들어가는데, `<a>` 를 `<button>` 안에 넣는 것은 유효하지 않은 HTML 이고 브라우저마다
    다르게 깨진다. 대신 키보드 조작(Enter·Space)을 손으로 붙여 준다.
  */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return; // 링크 위에서 누른 것은 링크 몫이다
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Space 로 화면이 스크롤되지 않게
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

        <span className="truncate text-sm text-gray-700">{log.feature}</span>

        <span className="min-w-0 truncate text-sm">
          {log.cached ? (
            <Badge tone="blue">캐시 적중</Badge>
          ) : (
            <span className="text-gray-900">{log.model}</span>
          )}
        </span>

        <span className="font-mono text-xs text-gray-500">
          {log.cached
            ? '—'
            : `${shortNumber(log.inputTokens)} / ${shortNumber(log.outputTokens)}`}
        </span>

        {/* 느린 호출이 눈에 걸려야 한다. 3초를 넘으면 색을 준다. */}
        <span
          className={cn(
            'font-mono text-xs',
            log.elapsedMs >= 3000 ? 'font-semibold text-amber-600' : 'text-gray-400',
          )}
        >
          {(log.elapsedMs / 1000).toFixed(2)}s
        </span>

        <span className="font-mono text-xs text-gray-400">
          <IdLink to="/apps" id={log.appId} />
          <span className="mx-1 text-gray-300">/</span>
          <IdLink to="/users" id={log.userId} />
        </span>
      </div>

      {open && <LogDetail log={log} />}
    </div>
  );
}

/**
 * 앱·회원 번호를 그 상세로 보내는 링크.
 *
 * **줄을 펼치는 클릭과 갈라야 한다** — 번호를 누르면 이동이고, 그 밖을 누르면 펼치기다.
 * 링크가 줄 안에 있어 클릭이 위로 올라가므로 여기서 멈춘다.
 */
function IdLink({ to, id }: { to: '/apps' | '/users'; id?: number | null }) {
  if (id == null) return <span className="text-gray-300">—</span>;
  return (
    <Link
      to={`${to}/${id}`}
      onClick={(e) => e.stopPropagation()}
      className="rounded text-gray-500 transition hover:text-primary hover:underline"
    >
      #{id}
    </Link>
  );
}

function LogDetail({ log }: { log: LlmUsageLog }) {
  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-6 py-4">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="로그 id">
          <Mono>{log.id}</Mono>
        </Field>
        <Field label="호출 시각">
          <Mono>{log.createdAt}</Mono>
        </Field>
        <Field label="request id">
          <Mono>{log.requestId ?? '—'}</Mono>
        </Field>
        {/* 업체에 문의할 때 그대로 대는 값이다. */}
        <Field label="upstream id">
          <Mono>{log.upstreamId ?? '—'}</Mono>
        </Field>
        <Field label="업체">{log.provider}</Field>
        <Field label="모델">
          <Mono>{log.model}</Mono>
        </Field>
        <Field label="앱">
          {log.appId != null ? (
            <IdLink to="/apps" id={log.appId} />
          ) : (
            <span className="text-gray-400">— 앱 없음</span>
          )}
        </Field>
        <Field label="회원">
          {log.userId != null ? (
            <IdLink to="/users" id={log.userId} />
          ) : (
            <span className="text-gray-400">— 로그인 전</span>
          )}
        </Field>
      </dl>

      <Block label="프롬프트">
        <p className="text-xs text-gray-600">
          <Mono>{log.promptName}</Mono>
          <span className="mx-1.5 text-gray-300">@</span>
          <Mono>{log.promptHash}</Mono>
        </p>
        {/* 이 값이 갈리는 지점이 곧 "품질이 달라진 시점" 이다. */}
        <p className="mt-1 text-xs text-gray-400">
          뒤가 프롬프트의 판입니다. 프롬프트를 고치면 값이 갈립니다.
        </p>
      </Block>

      <Block label="질문">
        <Mono className="text-xs text-gray-600">{log.questionHash}</Mono>
        <p className="mt-1 text-xs text-gray-400">
          정규화한 질문의 해시입니다.{' '}
          <span className="font-semibold text-gray-500">
            원문은 복원할 수 없습니다
          </span>{' '}
          — 같은 질문이 몇 번 왔는지를 세는 용도입니다.
        </p>
      </Block>

      <Block label="토큰">
        {log.cached ? (
          <p className="text-xs text-gray-400">
            우리 캐시에서 나온 답이라 호출이 없었습니다. 토큰은 전부 0 입니다.
          </p>
        ) : (
          <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <Field label="입력">
              <Mono>{log.inputTokens.toLocaleString()}</Mono>
            </Field>
            <Field label="출력">
              <Mono>{log.outputTokens.toLocaleString()}</Mono>
            </Field>
            {/* 업체 프롬프트 캐시. 우리 Redis 캐시(cached)와 다른 것이다. */}
            <Field label="캐시 읽기">
              <Mono>{log.cacheReadTokens.toLocaleString()}</Mono>
              <span className="ml-1.5 text-xs text-gray-400">정가의 1/10</span>
            </Field>
            <Field label="캐시 쓰기">
              <Mono>{log.cacheWriteTokens.toLocaleString()}</Mono>
              <span className="ml-1.5 text-xs text-gray-400">정가의 1.25배</span>
            </Field>
          </dl>
        )}
      </Block>
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
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-gray-700">{children}</dd>
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

function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('font-mono text-xs', className)}>{children}</span>;
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
