import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';

import {
  listLlmKeys,
  listLlmModels,
  reorderLlmModels,
  type EnvLlmKey,
  type EnvLlmModel,
} from '@/shared/api/llmKeys';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';
import { Tabs } from '@/shared/ui/Tabs';
import { cn } from '@/shared/lib/cn';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { SettingGroupList } from '../SettingGroupList';
import { LlmKeyModal } from '@/features/llm/LlmKeyModal';
import { LlmModelModal } from '@/features/llm/LlmModelModal';

// 다른 목록(Apps·Users·AppDetail)과 같은 규칙 — 칸 사이 gap-4, 표 좌우 px-6.
const COLUMNS = 'grid-cols-[64px_minmax(0,1fr)_88px_88px_150px] gap-4 px-6';
const MODEL_COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_72px_72px_150px_64px] gap-4 px-6';

type Tab = 'basic' | 'models';

const TABS = [
  { value: 'basic', label: '기본 설정' },
  { value: 'models', label: '모델 설정' },
] as const satisfies readonly { value: Tab; label: string }[];

const DESCRIPTION: Record<Tab, string> = {
  basic: '호출 동작과 토큰 한도입니다.',
  models: '서버가 LLM 을 부를 때 쓰는 인증과, 그 인증으로 부를 수 있는 모델입니다.',
};

const DEFAULT_TAB: Tab = 'basic';

function tabOf(raw: string | null): Tab {
  // 모르는 값이면 기본 탭. 손으로 고친 URL 때문에 빈 화면이 뜨면 안 된다.
  return TABS.some((t) => t.value === raw) ? (raw as Tab) : DEFAULT_TAB;
}

/**
 * LLM 설정. **성격이 다른 둘을 탭으로 가른다.**
 *
 *   기본 설정  값이 정해진 설정. 카탈로그가 그리고 카드 단위로 저장한다
 *   모델 설정  늘고 주는 목록(인증·모델). CRUD 다
 *
 * 어느 탭인지는 URL 쿼리에 둔다(외부 연동과 같은 방식) — 새로고침해도 보던 탭이 유지되고
 * 링크를 그대로 남에게 보낼 수 있다.
 */
export default function LlmSettings() {
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));

  const select = (next: Tab): void => {
    const query: Record<string, string> =
      next === DEFAULT_TAB ? {} : { tab: next };
    // 탭 전환은 히스토리에 쌓지 않는다. 뒤로가기가 탭 왕복으로 채워지면 못 빠져나간다.
    setParams(query, { replace: true });
  };

  return (
    <AdminLayout
      title="LLM 설정"
      description={DESCRIPTION[tab]}
      breadcrumbs={[{ label: '설정' }, { label: 'LLM' }]}
    >
      <div className="max-w-4xl">
        <Tabs items={TABS} value={tab} onChange={select} className="mb-4" />
        {tab === 'basic' ? (
          <SettingGroupList category="llm" />
        ) : (
          <div className="space-y-6">
            <Keys />
            <Models />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/**
 * 인증 목록. **설정이 아니라 관리 대상이다** — LOCAL 은 여러 대를 붙일 수 있어야 해서
 * 카탈로그로는 표현할 수가 없다.
 */
function Keys() {
  const query = useQuery({ queryKey: ['llm-keys'], queryFn: listLlmKeys });
  /** 열려 있는 상세. `'new'` 는 등록 모드다. */
  const [open, setOpen] = useState<EnvLlmKey | 'new' | null>(null);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            인증 {query.data ? `(${query.data.length})` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            서버가 LLM 을 부를 때 쓰는 인증입니다. Ollama 같은 로컬은 여러 대를 등록할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen('new')}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          등록
        </button>
      </div>

      {query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {errorMessage(query.error, '인증을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-10 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400">
          등록된 인증이 없습니다. 하나는 있어야 AI 검색이 동작합니다.
        </div>
      ) : (
        <Table
          columns={COLUMNS}
          /*
            **업체와 이름을 한 칸에 둔다.** 이름은 LOCAL 만 갖는데(하나뿐인 업체는 업체가
            곧 신원이다) 칸을 따로 두면 절반이 빈다.
          */
          head={['id', '업체', '키', '상태', '수정']}
          minWidth="min-w-[620px]"
        >
          {query.data?.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpen(row)}
              className={cn(
                'grid w-full items-center border-b border-gray-100 py-3 text-left transition last:border-0 hover:bg-gray-50',
                COLUMNS,
                // 꺼 둔 것은 흐리게 — 목록에 섞여 있어도 한눈에 갈린다.
                row.status !== 'ACTIVE' && 'opacity-60',
              )}
            >
              <span className="font-mono text-sm text-gray-400">{row.id}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-gray-900">
                  {row.provider}
                  {row.name && (
                    <span className="ml-1.5 font-normal text-gray-500">
                      · {row.name}
                    </span>
                  )}
                </span>
                {/* 지정 없는 호출이 어디로 나가는지가 이 목록에서 가장 중요한 정보다. */}
                {row.isDefault && <Badge tone="blue">기본</Badge>}
              </span>
              <span className="font-mono text-xs text-gray-400">
                {row.hasSecret ? `****${row.secretSuffix ?? ''}` : '—'}
              </span>
              <span>
                <Badge tone={row.status === 'ACTIVE' ? 'green' : 'gray'}>
                  {row.status}
                </Badge>
              </span>
              <Updated at={row.updatedAt} />
            </button>
          ))}
        </Table>
      )}

      {open && (
        <LlmKeyModal
          llmKey={open === 'new' ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function Updated({ at }: { at: string }) {
  const parts = splitDateTime(at);
  if (!parts) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span className="text-sm text-gray-500">
      {parts.date}
      <span className="block text-xs text-gray-400">{parts.time}</span>
    </span>
  );
}

/**
 * 모델 목록. **인증이 소유한다** — 어느 접속처로 부르느냐가 다르면 같은 이름도 다른 행이다.
 *
 * 등록된 것만 부를 수 있다. 업체가 모델을 새로 내도 여기 없으면 못 쓴다 — 모델이 곧 단가라,
 * 목록에 없는 것이 조용히 불릴 수 있으면 그건 예산이 새는 자리가 된다.
 *
 * hansapp-api 가 화면에 내려보내는 모델 목록도 여기서 나온다.
 */
function Models() {
  const keys = useQuery({ queryKey: ['llm-keys'], queryFn: listLlmKeys });
  const query = useQuery({ queryKey: ['llm-models'], queryFn: listLlmModels });
  /** 열려 있는 상세. `model` 이 없으면 그 인증에 새로 등록하는 것이다. */
  const [open, setOpen] = useState<{
    llmKey: EnvLlmKey;
    model?: EnvLlmModel;
  } | null>(null);

  const rows = query.data ?? [];
  const usable = keys.data ?? [];

  return (
    <section>
      <div className="mb-2 min-w-0">
        <h2 className="text-sm font-semibold text-gray-900">
          모델 {query.data ? `(${rows.length})` : ''}
        </h2>
        <p className="mt-0.5 text-xs text-gray-400">
          서버가 부를 수 있는 모델입니다. 여기 없는 모델은 요청해도 거절됩니다.
        </p>
      </div>

      {query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {errorMessage(query.error, '모델을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading || keys.isLoading ? (
        <div className="py-10 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : usable.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400">
          인증을 먼저 등록해야 모델을 더할 수 있습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {usable.map((key) => (
            <KeyModels
              key={key.id}
              llmKey={key}
              models={rows.filter((m) => m.keyId === key.id)}
              onOpen={(model) => setOpen({ llmKey: key, model })}
            />
          ))}
        </div>
      )}

      {open && (
        <LlmModelModal
          llmKey={open.llmKey}
          model={open.model}
          // 자기 이름은 빼고 넘긴다 — 상세에서 제 이름이 "등록됨" 으로 잠기면 안 된다.
          registered={rows
            .filter((m) => m.keyId === open.llmKey.id && m.id !== open.model?.id)
            .map((m) => m.name)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/**
 * 인증 하나와 그것으로 부를 수 있는 모델들.
 *
 * **표는 보기만 한다.** 줄을 누르면 상세 모달이 열리고 고치는 것은 거기서 한다 —
 * 앱·인증 화면과 같은 규칙이다.
 *
 * **차례만 예외다.** 순서는 줄끼리의 관계라 한 줄짜리 모달에서는 볼 수가 없다.
 * 누르면 바로 나간다 — 값을 고치는 것이 아니라 줄을 옮기는 것이라, 옮겨 놓고 저장을
 * 또 누르게 하면 옮긴 것이 안 먹은 줄 알고 다시 누르게 된다.
 */
function KeyModels({
  llmKey,
  models,
  onOpen,
}: {
  llmKey: EnvLlmKey;
  models: EnvLlmModel[];
  /** 없으면 등록 모드로 연다. */
  onOpen: (model?: EnvLlmModel) => void;
}) {
  const qc = useQueryClient();
  /**
   * 서버 응답을 기다리는 동안 보여 줄 차례.
   *
   * **누르자마자 줄이 움직여야 한다.** 왕복을 기다리면 두 번 눌러 두 칸이 밀린다.
   * 성공하면 목록을 다시 받아 이 값을 버리고, 실패하면 그대로 버려 원래 자리로 되돌린다.
   */
  const [order, setOrder] = useState<number[]>();

  /*
    목록이 새로 오면(등록·삭제) 들고 있던 차례는 버린다 — 없는 id 가 섞이거나 새 줄이
    빠진 채로 남으면 다음 요청이 400 으로 거절된다.
  */
  const ids = models.map((m) => m.id).join(',');
  const [seen, setSeen] = useState(ids);
  if (seen !== ids) {
    setSeen(ids);
    setOrder(undefined);
  }

  const rows = order
    ? order.map((id) => models.find((m) => m.id === id)!).filter(Boolean)
    : models;

  const save = useMutation({
    mutationFn: (next: number[]) => reorderLlmModels(llmKey.id, next),
    /*
      **응답이 곧 최신 상태다. 다시 불러오지 않고 캐시를 갈아 끼운다**(설정 카드와 같은 규칙).

      무효화로 처리하면 재조회가 끝나기 전에 화면 값을 버리게 되어, 그 사이 옛 순서가
      한 번 스쳤다가 새 순서로 바뀐다 — 그게 깜빡임으로 보인다.
    */
    onSuccess: (rows) => {
      qc.setQueryData<EnvLlmModel[]>(['llm-models'], (prev) =>
        prev ? [...prev.filter((m) => m.keyId !== llmKey.id), ...rows] : rows,
      );
      setOrder(undefined);
    },
    // 실패하면 화면 값을 버려 원래 자리로 되돌린다.
    onError: () => setOrder(undefined),
  });

  const move = (index: number, delta: number) => {
    const next = rows.map((m) => m.id);
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
    save.mutate(next);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          {/* 표 안의 글씨와 같은 크기다 — 여기만 크면 목록이 층층이 갈려 보인다. */}
          <span className="truncate text-xs font-semibold text-gray-700">
            {llmKey.provider}
            {llmKey.name && (
              <span className="ml-1.5 font-normal text-gray-500">
                · {llmKey.name}
              </span>
            )}
          </span>
          {llmKey.isDefault && <Badge tone="blue">기본 인증</Badge>}
          {llmKey.status !== 'ACTIVE' && <Badge tone="gray">DISABLED</Badge>}
        </span>
        <button
          type="button"
          onClick={() => onOpen()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5" />
          모델 추가
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-gray-400">
          등록된 모델이 없습니다. 하나는 있어야 이 인증으로 부를 수 있습니다.
        </p>
      ) : (
        <>
          <Table
            columns={MODEL_COLUMNS}
            head={['id', '모델', '사용', '기본', '수정', '차례']}
            minWidth="min-w-[640px]"
          >
            {rows.map((m, i) => (
              /*
                **줄 전체가 상세를 여는 자리다.** 차례 버튼만 예외라 거기서 전파를 끊는다 —
                button 안에 button 을 넣을 수 없어 줄을 div 로 두고 role 을 붙였다.
              */
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(m);
                  }
                }}
                className={cn(
                  'grid cursor-pointer items-center border-b border-gray-100 py-2.5 text-left transition last:border-0 hover:bg-gray-50',
                  MODEL_COLUMNS,
                  // 꺼 둔 것은 흐리게 — 목록에 섞여 있어도 한눈에 갈린다.
                  !m.enabled && 'opacity-60',
                )}
              >
                <span className="font-mono text-sm text-gray-400">{m.id}</span>
                <span className="truncate font-mono text-sm text-gray-900">
                  {m.name}
                </span>
                <span>
                  <Badge tone={m.enabled ? 'green' : 'gray'}>
                    {m.enabled ? '사용' : '중지'}
                  </Badge>
                </span>
                <span>{m.isDefault && <Badge tone="blue">기본</Badge>}</span>
                <Updated at={m.updatedAt} />
                <span
                  className="flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoveButton
                    title="위로"
                    disabled={i === 0 || save.isPending}
                    onClick={() => move(i, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </MoveButton>
                  <MoveButton
                    title="아래로"
                    disabled={i === rows.length - 1 || save.isPending}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </MoveButton>
                </span>
              </div>
            ))}
          </Table>

          {save.isError && (
            <p className="px-6 py-2 text-sm text-red-500">
              {errorMessage(save.error, '차례를 바꾸지 못했습니다.')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MoveButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
