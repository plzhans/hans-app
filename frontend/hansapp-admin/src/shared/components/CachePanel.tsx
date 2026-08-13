import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { JsonView, allExpanded } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

import { errorMessage } from '@/shared/api/errorMessage';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

/**
 * JSON 뷰어의 색·여백.
 *
 * **딸려 오는 기본 테마 대신 우리 팔레트를 넘긴다.** 라이브러리 CSS 는 해시 클래스명
 * (`._3eOF8`)이라 나중에 덮어쓸 방법이 없는데, 이 컴포넌트는 클래스명을 통째로 받는다 —
 * 그래서 Tailwind 로 직접 칠한다. **어두운 판 위에 얹으므로 값 색을 밝은 쪽으로 잡는다.**
 */
const JSON_STYLE = {
  container: '',
  basicChildStyle: 'ml-4',
  label: 'text-sky-300 mr-1',
  clickableLabel: 'text-sky-300 mr-1 cursor-pointer',
  nullValue: 'text-gray-500',
  undefinedValue: 'text-gray-500',
  numberValue: 'text-amber-300',
  stringValue: 'text-emerald-300',
  booleanValue: 'text-purple-300',
  otherValue: 'text-gray-200',
  punctuation: 'text-gray-500 mr-1',
  expandIcon: 'mr-1 text-gray-500 cursor-pointer select-none',
  collapseIcon: 'mr-1 text-gray-500 cursor-pointer select-none',
  collapsedContent: 'text-gray-500 ml-1 before:content-["…"]',
  childFieldsContainer: '',
  quotesForFieldNames: false,
  stringifyStringValues: false,
  ariaLables: { collapseJson: '접기', expandJson: '펼치기' },
};

/**
 * 캐시 한 칸의 상태. **서버가 주는 모양이 캐시 종류를 가리지 않고 같다** —
 * 글 캐시든 회원 캐시든 이 화면이 묻는 것은 똑같기 때문이다.
 */
export interface CacheState {
  /** 캐시 키. 환경 접두어(`develop:`)는 빠져 있다. */
  key: string;
  hit: boolean;
  expiresAt: string | null;
  remainingMs: number | null;
  /** 캐시에 담긴 값 그대로. */
  value: unknown;
  /** Redis 처럼 프로세스 밖에서 공유되나. false 면 이 프로세스의 메모리다. */
  shared: boolean;
}

/**
 * 캐시 한 칸을 들여다보고 지우는 패널.
 *
 * **지우기 전에 지울 것이 있는지 보여 준다.** 무엇이 들어 있는지 모른 채 지우기만 하면,
 * 정작 알고 싶은 것("지금 나가는 것이 무엇이냐")을 영영 못 본다.
 *
 * 글 캐시와 회원 캐시가 같은 화면을 쓴다 — 묻는 것이 같은데 화면을 두 벌 들고 있으면
 * 한쪽만 고쳐지는 날이 온다. 다른 것은 조회·삭제 함수와 확인 창 문구뿐이라 인자로 받는다.
 */
export function CachePanel({
  queryKey,
  fetchState,
  purge: purgeFn,
  confirmTitle,
  children,
}: {
  /** react-query 캐시 키. 화면마다 달라야 서로의 결과를 덮지 않는다. */
  queryKey: readonly unknown[];
  fetchState: () => Promise<CacheState>;
  purge: () => Promise<void>;
  confirmTitle: string;
  /** 확인 창에 넣을 설명. 무엇이 지워지는지는 부르는 쪽이 안다. */
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: fetchState,
    // 남은 시간이 흘러가는 화면이라 오래된 값을 그대로 두지 않는다.
    refetchOnWindowFocus: true,
  });
  const state = query.data;

  const purge = useMutation({
    mutationFn: purgeFn,
    onSuccess: async () => {
      setAsking(false);
      await qc.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      setAsking(false);
      setError(errorMessage(e, '캐싱을 지우지 못했습니다.'));
    },
  });

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-6 py-4">
          <span className="mr-auto">
            <span className="block text-sm font-semibold text-gray-900">
              {query.isLoading
                ? '읽는 중…'
                : state?.hit
                  ? '캐시에 들어 있습니다'
                  : '캐싱 없음'}
            </span>
            <span className="block font-mono text-xs text-gray-400">
              {state?.key}
            </span>
          </span>

          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            title="다시 읽기"
            aria-label="다시 읽기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
            />
          </button>
          {/*
            **지울 것이 없으면 누를 수 없다.** 눌러도 아무 일이 없는 버튼이 성공한 것처럼
            보이면, 다음에 정말 지워야 할 때 그 버튼을 믿지 못한다.
          */}
          <button
            type="button"
            disabled={!state?.hit}
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
            className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
          >
            캐싱 초기화
          </button>
        </div>

        <dl className="px-6 py-4 text-sm">
          <Row label="만료">
            {state?.hit
              ? state.expiresAt
                ? `${formatStamp(state.expiresAt)} (${formatLeft(state.remainingMs)} 남음)`
                : '만료 없음'
              : '—'}
          </Row>
        </dl>

        {state?.hit && (
          <div className="px-6 pb-4">
            <p className="mb-1.5 text-xs font-semibold text-gray-400">
              담겨 있는 값
            </p>
            <CacheJsonView value={state.value} />
          </div>
        )}

        {/*
          **공유 캐시가 아니면 여기 보이는 것이 전부가 아니다.** 값을 쓰는 API 가 다른
          프로세스면 그쪽이 들고 있는 것은 여기서 보이지도, 지워지지도 않는다.
        */}
        {state && !state.shared && (
          <p className="mx-6 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
            Redis 가 설정되지 않아 프로세스 메모리에 담고 있습니다. 값을 쓰는
            API 가 다른 프로세스에서 돌고 있다면{' '}
            <b>그쪽 캐시는 여기서 보이지도, 지워지지도 않습니다.</b>
          </p>
        )}
      </div>

      {asking && (
        <ConfirmDialog
          title={confirmTitle}
          confirmLabel="지우기"
          tone="danger"
          loading={purge.isPending}
          onConfirm={() => purge.mutate()}
          onClose={() => setAsking(false)}
        >
          {children}
        </ConfirmDialog>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </div>
  );
}

/** `2026-08-12 14:05:03` */
function formatStamp(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
}

/** 남은 시간을 `12m 30s` 로. 초 단위까지만 — 그 아래는 볼 새도 없이 바뀐다. */
export function formatLeft(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * 캐시에 든 값을 펴서 보여 준다.
 *
 * **다듬지 않는다.** 화면용으로 손보면 "지금 나가는 것" 과 달라져, 무엇이 잘못됐는지
 * 볼 수 없다. 처음엔 다 펴 둔다(allExpanded) — 접혀 있으면 무엇이 들었는지 보려고 매번
 * 열어야 하는데, 이걸 여는 이유가 그 확인이다.
 *
 * 코드를 읽는 자리라 편집기처럼 어둡게 둔다 — 색으로 갈리는 값이 또렷해진다.
 */
export function CacheJsonView({ value }: { value: unknown }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 font-mono text-xs">
      <JsonView
        data={value as object}
        shouldExpandNode={allExpanded}
        style={JSON_STYLE}
      />
    </div>
  );
}
