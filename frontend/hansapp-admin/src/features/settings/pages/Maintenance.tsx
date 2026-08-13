import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import {
  countCache,
  countSessions,
  purgeAllSessions,
  purgeCache,
  type CacheCount,
} from '@/shared/api/maintenance';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

/** 지금 열려 있는 확인 창. 닫혀 있으면 null. */
type Asking = 'board' | 'userProfile' | 'sessions';

/**
 * 정리하기.
 *
 * **여기 있는 것은 전부 "전체" 를 다룬다.** 게시글 하나, 회원 하나를 다루는 같은 성격의
 * 버튼은 그 상세 화면에 따로 있다 — 대상을 고르는 화면과 섞으면 무엇이 지워지는지가
 * 흐려진다.
 *
 * **규모는 실행을 누른 뒤에 센다.** 화면을 여는 것만으로 세면 갈래마다 Redis 의 키를 전부
 * 훑게 되는데(SCAN 은 MATCH 로 걸러도 모든 키를 한 번씩 본다), 그 숫자가 필요한 순간은
 * "지울까" 를 정하는 그때뿐이다. 그래서 확인 창을 열면서 그 갈래만 센다.
 */
export default function Maintenance() {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 방금 센 규모. 창을 열 때마다 새로 센다 — 남겨 두면 지난 숫자를 보고 누르게 된다. */
  const [scale, setScale] = useState<CacheCount | null>(null);

  const counting = useMutation({
    mutationFn: (target: Asking): Promise<CacheCount> =>
      target === 'sessions'
        ? // 세션은 DB 한 번이라 저장소 연결 여부를 따질 것이 없다.
          countSessions().then((r) => ({ count: r.count, connected: true }))
        : countCache(target),
    onSuccess: setScale,
  });

  /** 확인 창을 열면서 그 갈래만 센다. */
  const ask = (target: Asking) => {
    setDone(null);
    setError(null);
    setScale(null);
    setAsking(target);
    counting.mutate(target);
  };

  const close = () => {
    setAsking(null);
    setScale(null);
  };

  const cache = useMutation({
    mutationFn: (target: 'board' | 'userProfile') => purgeCache(target),
    onSuccess: (result) => {
      close();
      setDone(`캐시 ${result.removed}건을 지웠습니다.`);
    },
    onError: (e) => {
      close();
      setError(errorMessage(e, '캐시를 지우지 못했습니다.'));
    },
  });

  const sessions = useMutation({
    mutationFn: purgeAllSessions,
    onSuccess: (result) => {
      close();
      setDone(
        `회원 ${result.users}명 / 세션 ${result.sessions}개를 로그아웃시켰습니다.` +
          (result.cacheLeft > 0
            ? ` 캐시 ${result.cacheLeft}건은 지우지 못해 만료까지 통과할 수 있습니다.`
            : ''),
      );
    },
    onError: (e) => {
      close();
      setError(errorMessage(e, '로그아웃시키지 못했습니다.'));
    },
  });

  const busy = cache.isPending || sessions.isPending;

  return (
    <AdminLayout
      title="정리하기"
      description="서비스 전체를 대상으로 캐시를 비우고 세션을 끊습니다."
      breadcrumbs={[{ label: '설정' }, { label: '정리하기' }]}
    >
      {done && (
        <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {done}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <Section title="게시판">
          <Item
            label="전체 캐시 초기화"
            note="공개 게시판 목록과 글 상세 캐시를 비웁니다. 다음 조회가 DB 로 내려갑니다."
            action="초기화"
            disabled={busy}
            onClick={() => ask('board')}
          />
        </Section>

        <Section title="회원">
          <Item
            label="전체 캐시 초기화"
            note="모든 회원의 내 정보(/users/me) 응답 캐시를 비웁니다. 로그인은 유지됩니다."
            action="초기화"
            disabled={busy}
            onClick={() => ask('userProfile')}
          />
          <Item
            label="전체 로그아웃"
            note="모든 회원의 로그인 세션을 끊습니다. 전원이 다시 로그인해야 합니다."
            action="전체 강제 로그아웃"
            disabled={busy}
            onClick={() => ask('sessions')}
          />
        </Section>
      </div>

      {asking === 'board' && (
        <ConfirmDialog
          title="게시판 캐시 초기화"
          confirmLabel="초기화"
          tone="danger"
          // 세는 동안에도 확인 버튼을 잠근다 — 규모를 보기 전에 눌리면 창을 띄운 의미가 없다.
          loading={counting.isPending || cache.isPending}
          onConfirm={() => cache.mutate('board')}
          onClose={close}
        >
          <p>
            게시판 목록과 글 상세 캐시를 지웁니다. 다음 조회가 캐시를 타지 않고 DB
            로 내려갑니다.
          </p>
          <p className="mt-2">
            글을 저장할 때 서버가 이미 지우므로 평소에는 누를 일이 없습니다.
          </p>
          <Target
            scale={scale}
            busy={counting.isPending}
            onRefresh={() => counting.mutate('board')}
          />
          <Disconnected scale={scale} />
        </ConfirmDialog>
      )}

      {asking === 'userProfile' && (
        <ConfirmDialog
          title="회원 캐시 초기화"
          confirmLabel="초기화"
          tone="danger"
          loading={counting.isPending || cache.isPending}
          onConfirm={() => cache.mutate('userProfile')}
          onClose={close}
        >
          <p>
            모든 회원의 내 정보 응답 캐시를 지웁니다.{' '}
            <b>로그인은 끊기지 않습니다</b> — 다음 조회가 DB 로 내려갈 뿐입니다.
          </p>
          <Target
            scale={scale}
            busy={counting.isPending}
            onRefresh={() => counting.mutate('userProfile')}
          />
          <Disconnected scale={scale} />
        </ConfirmDialog>
      )}

      {asking === 'sessions' && (
        <ConfirmDialog
          title="모든 회원 로그아웃"
          confirmLabel="전체 강제 로그아웃"
          tone="danger"
          loading={counting.isPending || sessions.isPending}
          onConfirm={() => sessions.mutate()}
          onClose={close}
        >
          <p>
            살아 있는 세션을 전부 폐기합니다.{' '}
            <b>모든 회원이 다시 로그인해야 합니다.</b>
          </p>
          <p className="mt-2">
            토큰 형식이나 서명 키를 바꿔 발급돼 있는 것이 의미를 잃었을 때, 또는
            유출이 의심될 때 쓰는 조치입니다.
          </p>
          <p className="mt-2">
            즉시 전부 막히지는 않습니다. 공유 캐시는 함께 지우지만 API 서버가 자기
            메모리에 최대 1분간 들고 있습니다.
          </p>
          <Target
            scale={scale}
            busy={counting.isPending}
            onRefresh={() => counting.mutate('sessions')}
          />
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}

/**
 * 무엇이 얼마나 지워지는가. **설명 아래에 박스로 세운다** — 문장 속에 숫자를 섞어 두면
 * 읽는 사람이 그 한 줄을 찾아 눈으로 훑어야 한다. 누르기 직전에 확인하는 값이라 눈에
 * 걸려야 한다.
 *
 * **세지 못했을 때 0 으로 적지 않는다.** 0 건이라고 하면 "지울 게 없다" 로 읽혀 누르지 않게
 * 되는데, 실제로는 못 센 것뿐이라 지울 것이 남아 있을 수 있다.
 */
function Target({
  scale,
  busy,
  onRefresh,
}: {
  scale: CacheCount | null;
  busy: boolean;
  /** 다시 센다. **창을 닫았다 열지 않아도 되게 두는 통로다** — 지우려고 멈춘 사이에 숫자가
   * 움직이기도 하고, 한 번 못 셌다고 창을 다시 열게 할 이유도 없다. */
  onRefresh: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-xs font-medium text-gray-500">대상</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">
          {/* 단위를 붙이지 않는다 — 무엇을 세는지는 위 설명이 이미 말했고, 여기서는
              숫자만 눈에 들어와야 한다(1,000,000). */}
          {busy
            ? '세는 중…'
            : scale
              ? scale.count.toLocaleString()
              : '알 수 없음'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          aria-label="다시 세기"
          title="다시 세기"
          className="rounded-md p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
      </span>
    </div>
  );
}

/**
 * 저장소가 없으면 숫자가 거짓말이 된다. 0 건으로 보이는 것이 "비었다" 가 아니라
 * "볼 수 없다" 이므로, 누르기 전에 그 사실을 말한다.
 */
function Disconnected({ scale }: { scale: CacheCount | null }) {
  if (!scale || scale.connected) return null;
  return (
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      캐시 저장소(Redis)가 붙어 있지 않습니다. 위 건수는 <b>세지 못한 것</b>이지
      비어 있는 것이 아닙니다.
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-100 px-6 py-4 text-sm font-semibold text-gray-900">
        {title}
      </h2>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </section>
  );
}

/**
 * 갈래 한 줄.
 *
 * **여기에는 숫자가 없다.** 규모는 실행을 누른 뒤 확인 창에서 보여 준다 — 화면을 여는 것만으로
 * 갈래마다 Redis 를 통째로 훑을 이유가 없다.
 *
 * **버튼은 전부 빨갛다.** 이 화면에 있는 것은 모두 되돌릴 수 없는 전체 대상 조치라, 어느 것은
 * 덜 위험하다는 신호를 색으로 주면 안 된다 — 무엇이 지워지는지는 확인 창이 말한다.
 */
function Item({
  label,
  note,
  action,
  disabled,
  onClick,
}: {
  label: string;
  note: string;
  /** 버튼에 적히는 말. **무엇을 하는지를 버튼이 스스로 말한다** — "실행" 은 누르기 직전에
   * 왼쪽 설명을 다시 읽게 만든다. */
  action: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 px-6 py-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-sm text-gray-500">{note}</span>
      </span>

      <Button
        type="button"
        variant="primary"
        className="w-auto whitespace-nowrap bg-red-600 px-4 hover:bg-red-700"
        disabled={disabled}
        onClick={onClick}
      >
        {action}
      </Button>
    </li>
  );
}
