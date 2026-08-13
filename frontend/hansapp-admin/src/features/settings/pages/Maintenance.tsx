import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import {
  getMaintenanceSummary,
  purgeAllSessions,
  purgeCache,
} from '@/shared/api/maintenance';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
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
 * **지우기 전에 규모를 보여 준다.** 몇 건인지 모르고 누르는 버튼은, 눌러도 아무 일이
 * 없었는지 다 지워진 건지 구별할 수 없다.
 */
export default function Maintenance() {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ['maintenance-summary'],
    queryFn: getMaintenanceSummary,
    refetchOnWindowFocus: false,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['maintenance-summary'] });
  };

  const cache = useMutation({
    mutationFn: (target: 'board' | 'userProfile') => purgeCache(target),
    onSuccess: async (result) => {
      setAsking(null);
      setDone(`캐시 ${result.removed}건을 지웠습니다.`);
      await refresh();
    },
    onError: (e) => {
      setAsking(null);
      setError(errorMessage(e, '캐시를 지우지 못했습니다.'));
    },
  });

  const sessions = useMutation({
    mutationFn: purgeAllSessions,
    onSuccess: async (result) => {
      setAsking(null);
      setDone(
        `회원 ${result.users}명 / 세션 ${result.sessions}개를 로그아웃시켰습니다.` +
          (result.cacheLeft > 0
            ? ` 캐시 ${result.cacheLeft}건은 지우지 못해 만료까지 통과할 수 있습니다.`
            : ''),
      );
      await refresh();
    },
    onError: (e) => {
      setAsking(null);
      setError(errorMessage(e, '로그아웃시키지 못했습니다.'));
    },
  });

  const busy = cache.isPending || sessions.isPending;
  const data = summary.data;

  return (
    <AdminLayout
      title="정리하기"
      description="서비스 전체를 대상으로 캐시를 비우고 세션을 끊습니다."
      breadcrumbs={[{ label: '설정' }, { label: '정리하기' }]}
      actions={
        <Button
          type="button"
          variant="outline"
          className="h-9 w-auto whitespace-nowrap px-3"
          loading={summary.isFetching}
          onClick={() => void summary.refetch()}
        >
          <RefreshCw className="h-4 w-4" />
          다시 세기
        </Button>
      }
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

      {/*
        **저장소가 없으면 숫자가 거짓말이 된다.** 0 건으로 보이는 것이 "비었다" 가 아니라
        "볼 수 없다" 이므로, 그 사실을 숫자보다 먼저 말한다.
      */}
      {data && !data.connected && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          캐시 저장소(Redis)가 붙어 있지 않습니다. 아래 캐시 건수는 <b>세지 못한
          것</b>이지 비어 있는 것이 아닙니다.
        </p>
      )}

      <div className="space-y-4">
        <Section title="게시판">
          <Item
            label="전체 캐시 초기화"
            note="공개 게시판 목록과 글 상세 캐시를 비웁니다. 다음 조회가 DB 로 내려갑니다."
            count={data?.board}
            loading={summary.isLoading}
            disabled={busy}
            onClick={() => {
              setDone(null);
              setError(null);
              setAsking('board');
            }}
          />
        </Section>

        <Section title="회원">
          <Item
            label="전체 캐시 초기화"
            note="모든 회원의 내 정보(/users/me) 응답 캐시를 비웁니다. 로그인은 유지됩니다."
            count={data?.userProfile}
            loading={summary.isLoading}
            disabled={busy}
            onClick={() => {
              setDone(null);
              setError(null);
              setAsking('userProfile');
            }}
          />
          <Item
            label="전체 로그아웃"
            note="모든 회원의 로그인 세션을 끊습니다. 전원이 다시 로그인해야 합니다."
            count={data?.sessions}
            unit="개 세션"
            danger
            loading={summary.isLoading}
            disabled={busy}
            onClick={() => {
              setDone(null);
              setError(null);
              setAsking('sessions');
            }}
          />
        </Section>
      </div>

      {asking === 'board' && (
        <ConfirmDialog
          title="게시판 캐시 초기화"
          confirmLabel="지우기"
          tone="danger"
          loading={cache.isPending}
          onConfirm={() => cache.mutate('board')}
          onClose={() => setAsking(null)}
        >
          <p>
            게시판 목록과 글 상세 캐시 <b>{data?.board ?? 0}건</b>을 지웁니다. 다음
            조회가 캐시를 타지 않고 DB 로 내려갑니다.
          </p>
          <p className="mt-2">
            글을 저장할 때 서버가 이미 지우므로 평소에는 누를 일이 없습니다.
          </p>
        </ConfirmDialog>
      )}

      {asking === 'userProfile' && (
        <ConfirmDialog
          title="회원 캐시 초기화"
          confirmLabel="지우기"
          tone="danger"
          loading={cache.isPending}
          onConfirm={() => cache.mutate('userProfile')}
          onClose={() => setAsking(null)}
        >
          <p>
            모든 회원의 내 정보 응답 캐시 <b>{data?.userProfile ?? 0}건</b>을
            지웁니다. <b>로그인은 끊기지 않습니다</b> — 다음 조회가 DB 로 내려갈
            뿐입니다.
          </p>
        </ConfirmDialog>
      )}

      {asking === 'sessions' && (
        <ConfirmDialog
          title="모든 회원 로그아웃"
          confirmLabel="전부 로그아웃"
          tone="danger"
          loading={sessions.isPending}
          onConfirm={() => sessions.mutate()}
          onClose={() => setAsking(null)}
        >
          <p>
            살아 있는 세션 <b>{data?.sessions ?? 0}개</b>를 전부 폐기합니다.{' '}
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
        </ConfirmDialog>
      )}
    </AdminLayout>
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

function Item({
  label,
  note,
  count,
  unit = '건',
  danger = false,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  note: string;
  count?: number;
  unit?: string;
  danger?: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 px-6 py-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-sm text-gray-500">{note}</span>
      </span>

      {/* 규모를 버튼 바로 옆에 둔다 — 누르기 직전에 보는 숫자여야 한다. */}
      <span className="text-sm text-gray-500">
        {loading ? '세는 중…' : `${(count ?? 0).toLocaleString()}${unit}`}
      </span>

      <Button
        type="button"
        variant={danger ? 'primary' : 'outline'}
        className={
          danger
            ? 'w-auto whitespace-nowrap bg-red-600 px-4 hover:bg-red-700'
            : 'w-auto whitespace-nowrap px-4'
        }
        disabled={disabled}
        onClick={onClick}
      >
        실행
      </Button>
    </li>
  );
}
