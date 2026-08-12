import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import {
  getAdmin,
  listAdminActionLogs,
  type AdminActionLog,
  type AdminLogActionType,
} from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import {
  ActionFilter,
  DetailBlock,
  DetailField,
  JsonBlock,
  PeriodFilter,
  SearchRow,
} from '@/shared/components/logUi';
import { useSearchCommit } from '@/shared/lib/useSearchCommit';
import { cn } from '@/shared/lib/cn';
import {
  ADMIN_ACTION_ITEMS,
  ADMIN_ACTION_LABEL,
  isManagementAction,
} from '@/shared/lib/adminActions';
import { getDisplayTimeZone, splitDateTime } from '@/shared/lib/formatDateTime';
import { zonedDayBoundary } from '@/shared/lib/timeZone';
import { Badge } from '@/shared/ui/Badge';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { AdminTabs } from '../components/AdminTabs';

const PAGE_SIZE = 30;

const COLUMNS =
  'grid-cols-[150px_130px_72px_140px_minmax(0,1fr)_140px] gap-4 px-6';

/** 조건의 기본값. 전체 기간·전체 종류다(회원 기록 탭과 같은 규칙). */
const DEFAULTS = { from: '', to: '', actions: '' };

/**
 * 관리자 기록.
 *
 * **이 계정이 한 일과 당한 일이 함께 나온다.** 회원 기록에는 없는 방향인데, 관리자는 남의
 * 계정을 만들고 지우고 비밀번호를 다시 내기 때문이다 — 되짚을 때 실제로 묻는 것은
 * "내가 뭘 했나" 보다 "누가 내 계정을 건드렸나" 인 경우가 많다.
 *
 * 나머지 규칙은 회원 인증 기록 탭과 같다 — **검색을 눌러야 조회가 나가는 것**도 포함이다.
 * 로그 표는 한 번이 무거워, 칩을 누를 때마다 질의를 내보내지 않는다. 다만 탭에 들어온
 * 첫 화면은 기본 조건으로 한 번 보여 준다(그쪽 주석 참고).
 */
export default function AdminActionLogs() {
  const { id } = useParams();
  const adminId = Number(id);

  const { committed, draft, setDraft, commit, page, goPage, dirty } =
    useSearchCommit(DEFAULTS);

  // 검색을 누르기 전에도 조회한다 — 그때는 기본 조건(전체)이다.
  const applied = committed ?? DEFAULTS;

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const adminQuery = useQuery({
    queryKey: ['admin', adminId],
    queryFn: () => getAdmin(adminId),
    enabled: Number.isFinite(adminId),
  });

  const logQuery = useQuery({
    queryKey: ['admin-action-logs', adminId, { page, ...applied }],
    queryFn: () =>
      listAdminActionLogs(adminId, {
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
    enabled: Number.isFinite(adminId),
    placeholderData: keepPreviousData,
  });

  const data = logQuery.data;
  const filtered = !!(applied.from || applied.to || applied.actions);

  return (
    <AdminLayout
      title={adminQuery.data?.email ?? '관리자 상세'}
      breadcrumbs={[
        { label: '관리자', to: '/admins' },
        { label: adminQuery.data ? `#${adminId}` : '상세' },
      ]}
    >
      <BackLink to="/admins" />

      <AdminTabs adminId={adminId} current="actionLog" />

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
        <PeriodFilter from={draft.from} to={draft.to} onChange={setDraft} />

        <ActionFilter
          items={ADMIN_ACTION_ITEMS}
          value={draft.actions}
          onChange={(actions) => setDraft({ actions })}
        />

        <SearchRow dirty={dirty} />
      </form>

      {logQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(logQuery.error, '기록을 불러오지 못했습니다.')}
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
            head={['시각', '종류', '결과', '한 사람', '대상 · 접속 정보', 'IP']}
            minWidth="min-w-[940px]"
          >
            {data.items.map((log) => (
              <LogRow key={log.id} log={log} adminId={adminId} />
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

/** 쉼표로 묶인 종류 목록을 배열로. URL·초안이 같은 모양(문자열)을 쓴다. */
function splitActions(value: string): AdminLogActionType[] {
  return value.split(',').filter(Boolean) as AdminLogActionType[];
}

/** detail 에 실린 대상 계정 정보. 지워진 계정은 이 값만 남는다. */
interface TargetDetail {
  targetEmail?: string;
  targetName?: string | null;
}

/**
 * 기록 한 줄. **누르면 그 자리에서 아래로 펼쳐진다**(회원 기록과 같은 규칙이다).
 *
 * 관리자 기록에만 있는 것은 "한 사람" 칸이다 — 이 화면은 남이 내 계정에 한 일도 함께
 * 보여 주므로, 줄마다 주체가 누구인지 적지 않으면 두 방향이 섞여 읽힌다.
 */
function LogRow({ log, adminId }: { log: AdminActionLog; adminId: number }) {
  const [open, setOpen] = useState(false);
  const at = splitDateTime(log.createdAt);
  const failed = log.result === 'FAIL';
  const detail = (log.detail ?? {}) as TargetDetail;
  // 이 화면의 주인이 한 일인가, 당한 일인가.
  const byMe = log.adminId === adminId;

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
          {ADMIN_ACTION_LABEL[log.action] ?? log.action}
        </span>

        <span>
          <Badge tone={failed ? 'red' : 'green'}>
            {failed ? '실패' : '성공'}
          </Badge>
        </span>

        {/*
          **누가 한 일인지.** 남이 이 계정에 한 조치가 섞여 나오므로, 이 칸이 비면
          "내가 내 계정을 지웠다" 처럼 읽힌다.
        */}
        <span className="min-w-0 truncate text-sm text-gray-500">
          {byMe ? (
            <span className="text-gray-400">본인</span>
          ) : (
            (log.email ?? (log.adminId ? `#${log.adminId}` : '—'))
          )}
        </span>

        {/*
          관리 조치면 대상이, 인증 이벤트면 기기 정보가 이 칸을 쓴다 — 둘이 동시에
          의미를 갖는 줄이 없어서 칸을 나눌 이유가 없다. 실패 사유는 언제나 우선이다.
        */}
        <span className="min-w-0 truncate text-sm text-gray-500">
          {log.failReason ? (
            <span className="text-red-600">{log.failReason}</span>
          ) : isManagementAction(log.action) ? (
            (detail.targetEmail ??
            (log.targetAdminId ? `#${log.targetAdminId}` : '—'))
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
 * **줄에서 잘린 것을 여기서 온전히 본다** — 대상과 기기 정보가 한 칸을 나눠 쓰므로,
 * 줄에서는 둘 중 하나만 보인다.
 */
function LogDetail({ log }: { log: AdminActionLog }) {
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
        <DetailField label="한 사람">
          {log.email ?? '—'}
          {log.adminId != null && (
            <span className="ml-1.5 font-mono text-xs text-gray-400">
              #{log.adminId}
            </span>
          )}
        </DetailField>
        <DetailField label="대상">
          {log.targetAdminId != null ? (
            <Link
              to={`/admins/${log.targetAdminId}`}
              className="font-mono text-xs underline"
            >
              #{log.targetAdminId}
            </Link>
          ) : (
            '—'
          )}
        </DetailField>
        <DetailField label="IP">
          <span className="font-mono text-xs">{log.ip ?? '—'}</span>
        </DetailField>
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
          <p className="text-xs text-gray-400">없음.</p>
        ) : (
          <JsonBlock value={log.detail} />
        )}
      </DetailBlock>
    </div>
  );
}
