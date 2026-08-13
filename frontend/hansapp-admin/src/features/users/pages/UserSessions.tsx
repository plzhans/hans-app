import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getUser,
  listUserSessions,
  revokeAllUserSessions,
  revokeUserSession,
  type UserSession,
} from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { BackLink } from '@/shared/components/BackLink';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, splitDateTime } from '@/shared/lib/formatDateTime';
import { deviceLabel } from '@/shared/lib/userAgent';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Table } from '@/shared/ui/Table';
import { UserTabs } from '../components/UserTabs';

/*
  마지막 칸은 버튼 하나가 들어갈 자리다. **글자 폭보다 넉넉히 준다** — 딱 맞춰 두면
  글꼴이 조금만 달라져도 버튼이 잘린다.
*/
const COLUMNS =
  'grid-cols-[minmax(0,1fr)_140px_120px_120px_120px_104px] gap-4 px-6';

/**
 * 반영이 늦는다는 사실을 적는 자리. **확인 창 두 갈래가 같은 문장을 쓴다.**
 *
 * 로그아웃시킨 뒤에도 잠깐 통하는 것은 버그가 아니라 설계다 — access token 이 서명만으로
 * 검증되는 JWT 라 그렇다. 여기 안 적으면 "로그아웃이 안 된다" 는 문의가 온다.
 *
 * **"로그인이 막힌다" 고 쓰지 않는다.** 이건 계정을 잠그는 기능이 아니라 세션만 끊는
 * 기능이라, 회원은 곧바로 다시 로그인할 수 있다. 즉시 막히는 것은 토큰 갱신(refresh)이다 —
 * 세션 행이 없어져 갱신이 거절된다.
 */
const DELAY_NOTE =
  '토큰 갱신은 즉시 막히지만, 이미 발급된 접근 토큰은 최대 1분간 더 통할 수 있습니다.';

/** 확인 창이 무엇을 물어보는 중인가. 닫혀 있으면 null. */
type Confirming = { kind: 'one'; session: UserSession } | { kind: 'all' };

/**
 * 회원이 로그인해 둔 기기.
 *
 * **살아 있는 세션만이다.** 만료된 것은 정리 배치가 치울 때까지 DB 에 남아 있을 뿐이라
 * 서버가 빼고 준다 — 개요의 "로그인 세션" 수와 여기 줄 수가 같아야 한다.
 *
 * **회원 통로에서 유일하게 쓰기가 되는 화면이다.** 나머지 회원 정보는 관리자가 못 고친다.
 * 세션만 예외인 이유는 계정 도용이 의심될 때 본인이 손쓰기 전에 로그아웃시켜야 해서다.
 *
 * **한 대든 전부든 확인을 받는다.** 남의 계정을 로그인 화면으로 내보내는 일이고, 표의 줄들이
 * 서로 똑같이 생겨서 한 칸 어긋나 눌러도 알아채기 어렵다 — 무엇이 지워지는지 확인 창에
 * 그대로 펼쳐 놓고 그걸 보고 누르게 한다.
 *
 * 페이지가 없다 — 세션은 계정마다 상한이 있어 몇 줄로 끝난다.
 */
export default function UserSessions() {
  const { id } = useParams();
  const userId = Number(id);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  // 개요 탭에서 넘어왔으면 캐시에 이미 있다. 제목(이메일)만 쓰려고 다시 받지 않는다.
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  const sessionQuery = useQuery({
    queryKey: ['user-sessions', userId],
    queryFn: () => listUserSessions(userId),
    enabled: Number.isFinite(userId),
  });

  const sessions = sessionQuery.data;

  return (
    <AdminLayout
      title={userQuery.data?.email ?? '회원 상세'}
      breadcrumbs={[
        { label: '회원', to: '/users' },
        { label: userQuery.data ? `#${userId}` : '상세' },
      ]}
    >
      <BackLink to="/users" />

      <UserTabs userId={userId} current="session" />

      {sessionQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(
            sessionQuery.error,
            '로그인 기기를 불러오지 못했습니다.',
          )}
        </div>
      ) : sessionQuery.isLoading || !sessions ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          로그인해 둔 기기가 없습니다.
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['기기', 'IP', '로그인', '최근 활동', '만료', '']}
            minWidth="min-w-[920px]"
          >
            {sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                onRevoke={() => setConfirming({ kind: 'one', session })}
              />
            ))}
          </Table>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900">
              모든 기기 로그아웃
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              이 회원의 로그인 세션을 전부 로그아웃시킵니다. 계정을 도용당했다고
              의심될 때 쓰는 조치입니다 — 하나씩 로그아웃시키는 사이에 새로
              만들어진 세션을 놓칠 수 있습니다.
            </p>
            {/*
              **이것만으로 계정이 잠기지 않는다.** 도용 대응이라는 맥락에서 이 화면을
              여는데, 비밀번호가 새어 나간 경우라면 끊자마자 다시 로그인해 들어온다 —
              그 사실을 여기서 말해 두지 않으면 조치를 다 한 것으로 오해한다.
            */}
            <p className="mt-2 text-sm text-gray-500">
              계정이 잠기는 것은 아닙니다. 비밀번호가 새어 나갔다면 곧바로 다시
              로그인될 수 있으니, 회원에게 비밀번호 변경을 안내하세요.
            </p>
            <Button
              type="button"
              className="mt-4 w-auto bg-red-600 px-4 hover:bg-red-700"
              onClick={() => setConfirming({ kind: 'all' })}
            >
              모든 기기 로그아웃
            </Button>
          </section>
        </>
      )}

      {confirming && (
        <RevokeModal
          userId={userId}
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
  onRevoke,
}: {
  session: UserSession;
  onRevoke: () => void;
}) {
  const label = deviceLabel(session.userAgent);

  return (
    <div className={cn('grid items-center border-b border-gray-100 py-3.5 last:border-0', COLUMNS)}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-gray-900">
          {label ?? session.userAgent ?? '알 수 없는 기기'}
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

      <span className="text-sm text-gray-500">
        {/*
          "로그인 상태 유지" 를 끈 세션은 브라우저를 닫으면 쿠키가 사라진다 — 만료 시각이
          남아 있어도 다음 접속에서 되살아나지 않는다. 만료 칸 옆이 그 사실을 볼 자리다.
        */}
        {!session.persistent && <Badge tone="gray">브라우저 종료 시</Badge>}
        <TimeText iso={session.expiresAt} />
      </span>

      <span>
        {/* 아이콘을 붙이지 않는다 — 칸이 좁아 글자가 밀리고, 글자만으로 뜻이 분명하다. */}
        <Button
          type="button"
          variant="outline"
          className="h-8 w-auto whitespace-nowrap px-3 text-xs"
          onClick={onRevoke}
        >
          로그아웃
        </Button>
      </span>
    </div>
  );
}

/**
 * 로그아웃 확인. **한 대와 전부가 같은 창을 쓴다.**
 *
 * 물어보는 문장과 버튼만 다르고 나머지(반영 지연 안내·오류 표시·버튼 배치)는 똑같다.
 * 창을 둘로 나눠 두면 한쪽 문구만 고쳐지는 날이 온다.
 */
function RevokeModal({
  userId,
  target,
  total,
  onClose,
}: {
  userId: number;
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
        ? revokeUserSession(userId, one.sessionId)
        : revokeAllUserSessions(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user-sessions', userId] });
      // 개요의 "로그인 세션 N개" 도 같이 틀어진다.
      void qc.invalidateQueries({ queryKey: ['user', userId] });
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
              아래 기기를 로그아웃시킵니다. 회원은 이 기기에서 다시 로그인해야
              합니다.
            </p>
            {/*
              **무엇을 고른 건지 그대로 펼쳐 놓는다.** 표의 줄들이 서로 똑같이 생겨서,
              "정말 하시겠습니까" 만 물으면 잘못 고른 것을 확인할 방법이 없다.
            */}
            <TargetCard session={one} />
          </>
        ) : (
          <p className="text-sm text-gray-600">
            이 회원이 로그인해 둔{' '}
            <b className="text-gray-900">{total}개</b> 기기를 모두
            로그아웃시킵니다. 회원은 다시 로그인해야 합니다.
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
function TargetCard({ session }: { session: UserSession }) {
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

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-700">{children}</dd>
    </div>
  );
}

function TimeCell({ iso }: { iso: string }) {
  return (
    <span className="text-sm text-gray-500">
      <TimeText iso={iso} />
    </span>
  );
}

function TimeText({ iso }: { iso: string }) {
  const at = splitDateTime(iso);
  return (
    <span className="block">
      {at?.date ?? '—'}
      <span className="block text-xs text-gray-400">{at?.time}</span>
    </span>
  );
}
