import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import {
  ActionFilter,
  DetailBlock,
  DetailField,
  JsonBlock,
  PeriodFilter,
  SearchRow,
} from '@/shared/components/logUi';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import {
  AUTH_ACTION_ITEMS,
  AUTH_ACTION_LABEL,
} from '@/shared/lib/authActions';
import { useSearchCommit } from '@/shared/lib/useSearchCommit';
import { UserTabs } from '../components/UserTabs';

const PAGE_SIZE = 30;

/**
 * 조건의 기본값. **전체 기간·전체 액션이다.**
 *
 * 값이 전부 비어 있어 커밋해도 URL 에 아무것도 안 남는데, 그래도 된다 — 이 화면은
 * 커밋 여부와 무관하게 늘 조회한다(아래 `applied` 참고).
 */
const DEFAULTS = { from: '', to: '', actions: '' };

const COLUMNS =
  'grid-cols-[150px_130px_72px_minmax(0,1fr)_140px] gap-4 px-6';

/**
 * 회원 인증 기록.
 *
 * **기본은 전체 기간·전체 액션이다.** 이 화면을 여는 이유가 대개 "무슨 일이 있었나" 라서,
 * 처음부터 좁혀 두면 찾으려던 것이 화면 밖에 있다. 좁히는 건 관리자가 한다.
 *
 * **조건을 바꾸는 것과 조회하는 것을 가른다.** 로그 표는 한 번이 무거워, 칩을 누를 때마다
 * 질의가 나가면 기간을 고르고 종류를 좁히는 사이에 서너 번이 나간다. 칩·날짜는 초안만
 * 바꾸고 검색을 눌러야 나간다(전역 로그 화면과 같은 규칙).
 *
 * **다만 들어오자마자는 기본 조건으로 한 번 보여 준다.** 회원 한 명으로 이미 좁혀진
 * 조회라 무게가 전역 화면과 다르고, 탭을 열자마자 "검색을 누르세요" 만 있으면 이 사람이
 * 최근에 뭘 했는지 보러 온 사람을 한 번 더 클릭하게 만든다.
 *
 * 커밋된 조건은 URL 에 둔다 — 새로고침해도 보던 화면이 남고, 링크를 그대로 넘길 수 있다.
 */
export default function UserAuthLogs() {
  const { id } = useParams();
  const userId = Number(id);

  const { committed, draft, setDraft, commit, page, goPage, dirty } =
    useSearchCommit(DEFAULTS);

  // 검색을 누르기 전에도 조회한다 — 그때는 기본 조건(전체)이다.
  const applied = committed ?? DEFAULTS;

  // 상세 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  const logQuery = useQuery({
    queryKey: ['user-auth-logs', userId, { page, ...applied }],
    queryFn: () =>
      listUserAuthLogs(userId, {
        page,
        size: PAGE_SIZE,
        /*
          날짜 입력은 시간대가 없는 값이라 **표시 시간대의 하루 경계**로 바꿔 보낸다.
          브라우저 시간대로 계산하면 표에 찍힌 날짜와 걸러지는 경계가 어긋난다.
        */
        from: applied.from
          ? zonedDayBoundary(applied.from, 'start', getDisplayTimeZone())
          : undefined,
        to: applied.to
          ? zonedDayBoundary(applied.to, 'end', getDisplayTimeZone())
          : undefined,
        actions: splitActions(applied.actions).length
          ? splitActions(applied.actions)
          : undefined,
      }),
    enabled: Number.isFinite(userId),
    placeholderData: keepPreviousData,
  });

  const data = logQuery.data;
  const filtered = !!(applied.from || applied.to || applied.actions);

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
        <PeriodFilter
          from={draft.from}
          to={draft.to}
          onChange={(next) => setDraft(next)}
        />

        <ActionFilter
          items={AUTH_ACTION_ITEMS}
          value={draft.actions}
          onChange={(actions) => setDraft({ actions })}
        />

        <SearchRow dirty={dirty} />
      </form>

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

/** 쉼표로 묶인 액션 목록을 배열로. URL·초안이 같은 모양(문자열)을 쓴다. */
function splitActions(value: string): AuthLogActionType[] {
  return value.split(',').filter(Boolean) as AuthLogActionType[];
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
          <JsonBlock value={log.detail} />
        )}
      </DetailBlock>
    </div>
  );
}





