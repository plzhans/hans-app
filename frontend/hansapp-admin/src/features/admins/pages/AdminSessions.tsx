import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdmin,
  getAdminSessionCacheState,
  listAdminSessions,
  purgeAdminSessionCache,
  revokeAdminSession,
  revokeAllAdminSessions,
  type AdminSession,
  type OrphanAdminSessionCache,
} from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { CacheJsonView, formatLeft } from '@/shared/components/CachePanel';
import { cn } from '@/shared/lib/cn';
import { canManageRole } from '@/shared/lib/adminRoles';
import { formatDateTime, splitDateTime } from '@/shared/lib/formatDateTime';
import { deviceLabel } from '@/shared/lib/userAgent';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Table } from '@/shared/ui/Table';
import { AdminTabs } from '../components/AdminTabs';

/*
  마지막 칸은 버튼 하나가 들어갈 자리인데, 글자 폭보다 넉넉히 준다 — 딱 맞춰 두면 글꼴이
  조금만 달라져도 버튼이 잘린다. 첫 칸(세션 식별자)은 숫자라 회원 쪽보다 좁아도 된다.
*/
const COLUMNS =
  'grid-cols-[120px_minmax(0,1fr)_140px_120px_120px_120px_150px_104px] gap-4 px-6';

/**
 * 끊은 뒤 언제부터 막히나. **확인 창 두 갈래가 같은 문장을 쓴다.**
 *
 * 세션 행과 함께 인증 캐시도 비우므로 다음 요청부터 바로 막힌다 — 회원 쪽과 다른 점이라
 * (그쪽은 캐시가 다른 서비스에 있어 최대 1분 늦는다) 여기 적어 두지 않으면 같은 줄로 읽는다.
 */
const DELAY_NOTE =
  '세션과 인증 캐시를 함께 지우므로 다음 요청부터 막힙니다. 그 기기는 다시 로그인해야 합니다.';

/** 확인 창이 무엇을 물어보는 중인가. 닫혀 있으면 null. */
type Confirming = { kind: 'one'; session: AdminSession } | { kind: 'all' };

/**
 * 관리자가 로그인해 둔 기기.
 *
 * **살아 있는 세션만이다.** 만료된 것은 정리될 때까지 DB 에 남아 있을 뿐이라 서버가 빼고
 * 준다 — 개요의 "로그인 세션" 수와 여기 줄 수가 같아야 한다.
 *
 * **세션의 인증 캐시를 여기서 다룬다.** 캐시 탭이 아니다 — 그 캐시는 세션 하나에 딸린
 * 것이라, 어느 기기의 것인지 옆에 두고 봐야 뜻이 있다(회원 상세와 같은 배치).
 *
 * **나보다 등급이 높은 계정이면 끊는 버튼이 아예 안 보인다.** 막는 것은 서버지만, 누를 수
 * 없는 버튼을 띄워 놓고 403 으로 답하는 것보다 이 편이 낫다(관리자 상세와 같은 규칙).
 *
 * 페이지가 없다 — 세션은 계정마다 상한이 있어 몇 줄로 끝난다.
 */
export default function AdminSessions() {
  const { id } = useParams();
  const adminId = Number(id);
  const me = useAuthStore((s) => s.me);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  /** 캐시 값을 펼쳐 보고 있는 세션. 닫혀 있으면 null. */
  const [viewing, setViewing] = useState<number | null>(null);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const adminQuery = useQuery({
    queryKey: ['admin', adminId],
    queryFn: () => getAdmin(adminId),
    enabled: Number.isFinite(adminId),
  });

  const sessionQuery = useQuery({
    queryKey: ['admin-sessions', adminId],
    queryFn: () => listAdminSessions(adminId),
    enabled: Number.isFinite(adminId),
  });

  const admin = adminQuery.data;
  const sessions = sessionQuery.data?.sessions;
  const orphans = sessionQuery.data?.orphans ?? [];
  /** 이 계정을 내가 다룰 수 있나. 상세와 같은 판단을 쓴다. */
  const manageable = !!admin && !admin.deletedAt && canManageRole(me?.role, admin.role);

  return (
    <AdminLayout
      title={admin?.email ?? '관리자 상세'}
      breadcrumbs={[
        { label: '관리자', to: '/admins' },
        { label: admin ? `#${adminId}` : '상세' },
      ]}
    >
      <BackLink to="/admins" />

      <AdminTabs adminId={adminId} current="session" />

      {sessionQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(sessionQuery.error, '로그인 기기를 불러오지 못했습니다.')}
        </div>
      ) : sessionQuery.isLoading || !sessions ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : sessions.length === 0 ? (
        <>
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            로그인해 둔 기기가 없습니다.
          </div>
          {/* **기기가 없어도 고아 캐시는 있을 수 있다.** 오히려 전부 끊은 뒤가 잦다. */}
          {orphans.length > 0 && (
            <OrphanSection orphans={orphans} onViewCache={setViewing} />
          )}
        </>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={[
              '세션',
              '기기',
              'IP',
              '로그인',
              '최근 활동',
              '만료',
              '인증 캐시',
              '',
            ]}
            minWidth="min-w-[1200px]"
          >
            {sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                revocable={manageable}
                onRevoke={() => setConfirming({ kind: 'one', session })}
                onViewCache={() => setViewing(session.sessionId)}
              />
            ))}
          </Table>

          {orphans.length > 0 && (
            <OrphanSection orphans={orphans} onViewCache={setViewing} />
          )}

          {manageable && (
            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-gray-900">
                모든 기기 로그아웃
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                이 관리자의 로그인 세션을 전부 끊습니다. 계정을 도용당했다고
                의심될 때 쓰는 조치입니다 — 하나씩 끊는 사이에 새로 만들어진
                세션을 놓칠 수 있습니다.
              </p>
              {/*
                **이것만으로 계정이 잠기지 않는다.** 도용 대응이라는 맥락에서 이 화면을
                여는데, 비밀번호가 새어 나간 경우라면 끊자마자 다시 로그인해 들어온다 —
                그 사실을 여기서 말해 두지 않으면 조치를 다 한 것으로 오해한다.
              */}
              <p className="mt-2 text-sm text-gray-500">
                계정이 잠기는 것은 아닙니다. 비밀번호가 새어 나갔다면 개요
                화면의 <b className="text-gray-700">비밀번호 초기화</b>까지 해야
                합니다.
              </p>
              <Button
                type="button"
                className="mt-4 w-auto bg-red-600 px-4 hover:bg-red-700"
                onClick={() => setConfirming({ kind: 'all' })}
              >
                모든 기기 로그아웃
              </Button>
            </section>
          )}
        </>
      )}

      {viewing !== null && (
        <CacheJsonModal
          adminId={adminId}
          sessionId={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      {confirming && (
        <RevokeModal
          adminId={adminId}
          target={confirming}
          total={sessions?.length ?? 0}
          onClose={() => setConfirming(null)}
        />
      )}
    </AdminLayout>
  );
}

function SessionRow({
  session,
  revocable,
  onRevoke,
  onViewCache,
}: {
  session: AdminSession;
  /** 끊을 수 있는 계정인가. 아니면 버튼 자리가 비어 있다. */
  revocable: boolean;
  onRevoke: () => void;
  onViewCache: () => void;
}) {
  const label = deviceLabel(session.userAgent);

  return (
    <div
      className={cn(
        'grid items-center border-b border-gray-100 py-3.5 last:border-0',
        COLUMNS,
      )}
    >
      {/*
        **식별자를 드러낸다.** 문의 대응에서 "그 기기" 를 가리킬 이름이 이것뿐이고,
        잘못된 캐시 목록에는 이 값밖에 없어 두 목록을 맞춰 보려면 여기 있어야 한다.
      */}
      <span className="min-w-0 font-mono text-xs text-gray-500">
        {session.sessionId}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-gray-900">
            {label ?? session.userAgent ?? '알 수 없는 기기'}
          </span>
          {/* 지금 앉아 있는 자리다. 끊으면 이 화면에서 튕긴다. */}
          {session.current && <Badge tone="blue">이 기기</Badge>}
        </span>
        {/* 요약이 틀릴 수 있으니 원문을 함께 둔다(describeUserAgent 주석 참고). */}
        {label && session.userAgent && (
          <span className="mt-0.5 block truncate text-xs text-gray-400">
            {session.userAgent}
          </span>
        )}
      </span>

      <span className="font-mono text-xs text-gray-500">
        {session.ip ?? '—'}
      </span>

      <TimeCell iso={session.createdAt} />
      <TimeCell iso={session.updatedAt} />
      <TimeCell iso={session.expiresAt} />

      {/*
        **목록은 DB 를 보고 그리는데, 요청을 통과시키는 것은 이 캐시다.** 둘이 어긋나는
        순간이 있어서("끊었는데 왜 아직 되지") 같은 줄에서 보게 둔다. 지우는 것은 폐기가
        아니라 다음 요청을 DB 로 내려보내는 것뿐이라 확인 창을 두지 않는다.
      */}
      <span className="text-sm">
        {/*
          **상태 자체가 버튼이다.** 링크를 옆에 늘어놓으면 좁은 칸이 글자로 빽빽해지는데,
          여기서 할 일(값을 보고, 필요하면 지우기)은 결국 한 자리에서 이어진다 — 창을 열어
          거기서 마무리한다.
        */}
        {session.cache.hit ? (
          <button
            type="button"
            onClick={onViewCache}
            className="text-left text-gray-700 underline decoration-gray-300 underline-offset-2 transition hover:text-primary"
          >
            {formatLeft(session.cache.remainingMs)} 남음
          </button>
        ) : (
          <span className="text-gray-400">없음</span>
        )}
      </span>

      <span>
        {/* 아이콘을 붙이지 않는다 — 칸이 좁아 글자가 밀리고, 글자만으로 뜻이 분명하다. */}
        {revocable && (
          <Button
            type="button"
            variant="outline"
            className="h-8 w-auto whitespace-nowrap px-3 text-xs"
            onClick={onRevoke}
          >
            로그아웃
          </Button>
        )}
      </span>
    </div>
  );
}

/**
 * DB 에는 없는데 캐시에만 남은 세션.
 *
 * **평소에는 이 자리가 아예 안 보인다.** 정상이면 빈 목록이라, 보이는 것 자체가 이상 신호다.
 * 기기를 끊을 때 캐시 삭제가 새면 생기는데, 가드는 이 캐시를 보고 통과시키므로 **끊은
 * 기기가 아직 통한다**는 뜻이다.
 */
function OrphanSection({
  orphans,
  onViewCache,
}: {
  orphans: OrphanAdminSessionCache[];
  onViewCache: (sessionId: number) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-sm font-semibold text-amber-900">
        잘못된 캐시 {orphans.length}건
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        세션은 지워졌는데 캐시가 남아 있습니다. 그 기기는 캐시가 만료될 때까지
        계속 통과합니다 — 끊을 때 캐시 삭제가 실패하면 생깁니다. 여기서 바로
        지우세요.
      </p>

      <ul className="mt-4 space-y-2">
        {orphans.map((orphan) => (
          <li
            key={orphan.sessionId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              {/* 식별자 말고는 남은 정보가 없다 — 기기·IP 는 DB 행에 있었고 그건 지워졌다. */}
              <span className="block truncate font-mono text-xs text-gray-600">
                {orphan.sessionId}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {formatDateTime(orphan.expiresAt)}까지 통과
              </span>
            </span>
            {/* 여기서도 진입점은 하나다 — 창을 열어 값을 보고 거기서 지운다. */}
            <Button
              type="button"
              variant="outline"
              className="h-8 w-auto whitespace-nowrap px-3 text-xs"
              onClick={() => onViewCache(orphan.sessionId)}
            >
              캐시 보기
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 캐시에 실제로 담긴 값.
 *
 * **목록은 요약(있음·남은 시간)만 싣는다.** 값까지 줄마다 실으면 목록이 무거워지고, 정작
 * 볼 일은 드물다 — 열 때 그 세션만 따로 읽는다.
 *
 * 고아 캐시(DB 행 없음)도 열린다. 오히려 그때 들여다볼 일이 많다.
 */
function CacheJsonModal({
  adminId,
  sessionId,
  onClose,
}: {
  adminId: number;
  sessionId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-session-cache', adminId, sessionId],
    queryFn: () => getAdminSessionCacheState(adminId, sessionId),
  });
  const state = query.data;

  const purge = useMutation({
    mutationFn: () => purgeAdminSessionCache(adminId, sessionId),
    onSuccess: async () => {
      /*
        **목록을 다시 받고 창을 닫는다.** 지운 결과는 표에서 바로 드러난다 — 그 줄이
        「없음」 이 되거나(살아 있는 세션), 잘못된 캐시 목록에서 사라진다(고아). 창을
        열어 둔 채 "비었습니다" 를 보여 주는 것보다 그쪽이 확인이 빠르다.
      */
      await qc.invalidateQueries({ queryKey: ['admin-sessions', adminId] });
      onClose();
    },
  });

  return (
    <Modal size="md" title="인증 캐시" onClose={onClose}>
      <p className="font-mono text-xs text-gray-400">{state?.key ?? sessionId}</p>
      {state?.hit && (
        <p className="mt-1 text-sm text-gray-500">
          {formatDateTime(state.expiresAt)} 만료 ·{' '}
          {formatLeft(state.remainingMs)} 남음
        </p>
      )}

      <div className="mt-3">
        {query.isError ? (
          <p className="text-sm text-red-500">
            {errorMessage(query.error, '캐시를 읽지 못했습니다.')}
          </p>
        ) : query.isLoading ? (
          <p className="text-sm text-gray-400">읽는 중…</p>
        ) : state?.hit ? (
          <>
            {/*
              **껍데기까지 그대로 둔다.** 서버가 `{ v: ... }` 로 한 겹 감싸 넣는데(캐시
              미스와 "조회했는데 없음" 을 가르려고), 벗겨 주면 눈에 보이는 것과 Redis 에
              실제로 든 것이 달라진다 — 이걸 여는 이유가 그 대조다.
            */}
            <CacheJsonView value={state.value} />
            <p className="mt-2 text-xs text-gray-400">
              담긴 값 <span className="font-mono">v</span> 는 이 세션이 끝나는
              시각(epoch ms)입니다. 바깥의 껍데기는 캐시 미스와 "조회했는데 없음"
              을 가르려고 서버가 씌운 것입니다.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">캐시에 없습니다.</p>
        )}
      </div>

      {purge.error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(purge.error, '캐시를 초기화하지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        {/*
          **지울 것이 없으면 누를 수 없다.** 눌러도 아무 일이 없는 버튼이 성공한 것처럼
          보이면, 다음에 정말 지워야 할 때 그 버튼을 믿지 못한다(캐시 패널과 같은 규칙).
        */}
        <Button
          type="button"
          className="w-auto px-4"
          disabled={!state?.hit}
          loading={purge.isPending}
          onClick={() => purge.mutate()}
        >
          캐시 초기화
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={purge.isPending}
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 로그아웃 확인. **한 대와 전부가 같은 창을 쓴다.**
 *
 * 물어보는 문장과 버튼만 다르고 나머지(반영 안내·오류 표시·버튼 배치)는 똑같다.
 * 창을 둘로 나눠 두면 한쪽 문구만 고쳐지는 날이 온다.
 */
function RevokeModal({
  adminId,
  target,
  total,
  onClose,
}: {
  adminId: number;
  target: Confirming;
  /** 지금 살아 있는 세션 수. "전부" 가 몇 대인지 보여 주는 데 쓴다. */
  total: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const one = target.kind === 'one' ? target.session : null;

  const revoke = useMutation({
    mutationFn: () =>
      one
        ? revokeAdminSession(adminId, one.sessionId)
        : revokeAllAdminSessions(adminId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-sessions', adminId] });
      // 개요의 "로그인 세션 N개" 도 같이 틀어진다.
      void qc.invalidateQueries({ queryKey: ['admin', adminId] });
      onClose();
    },
  });

  return (
    <Modal
      size="md"
      title={one ? '기기 로그아웃' : '모든 기기 로그아웃'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {one ? (
          <>
            <p className="text-sm text-gray-600">
              아래 기기를 로그아웃시킵니다.
            </p>
            {/*
              **무엇을 고른 건지 그대로 펼쳐 놓는다.** 표의 줄들이 서로 똑같이 생겨서,
              "정말 하시겠습니까" 만 물으면 잘못 고른 것을 확인할 방법이 없다.
            */}
            <TargetCard session={one} />
            {/*
              지금 앉아 있는 자리를 끊는 경우다. 되돌릴 수 없는 일은 아니지만, 누른 뒤
              화면이 로그인으로 바뀌는 이유는 미리 알고 눌러야 한다.
            */}
            {one.current && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <b>지금 이 콘솔이 쓰고 있는 기기</b>입니다. 끊으면 곧바로 로그인
                화면으로 나갑니다.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600">
            이 관리자가 로그인해 둔 <b className="text-gray-900">{total}개</b>{' '}
            기기를 모두 로그아웃시킵니다.
          </p>
        )}

        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
          {DELAY_NOTE}
        </p>

        {revoke.error != null && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {errorMessage(revoke.error, '기기를 로그아웃시키지 못했습니다.')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto bg-red-600 px-4 hover:bg-red-700"
          loading={revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          {one ? '로그아웃' : '모두 로그아웃'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={revoke.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}

/** 확인 창에 펼쳐 놓는 대상 기기. 표에서 잘려 보이던 값들을 여기서는 온전히 본다. */
function TargetCard({ session }: { session: AdminSession }) {
  const label = deviceLabel(session.userAgent);

  return (
    <dl className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <Row label="기기">
        <span className="font-medium text-gray-900">
          {label ?? '알 수 없는 기기'}
        </span>
        {session.userAgent && (
          <span className="mt-0.5 block break-all text-xs text-gray-400">
            {session.userAgent}
          </span>
        )}
      </Row>
      <Row label="IP">
        <span className="font-mono text-xs">{session.ip ?? '—'}</span>
      </Row>
      <Row label="로그인">{formatDateTime(session.createdAt)}</Row>
      <Row label="최근 활동">{formatDateTime(session.updatedAt)}</Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-700">{children}</dd>
    </div>
  );
}

function TimeCell({ iso }: { iso: string }) {
  const at = splitDateTime(iso);
  return (
    <span className="text-sm text-gray-500">
      {at?.date ?? '—'}
      <span className="block text-xs text-gray-400">{at?.time}</span>
    </span>
  );
}
