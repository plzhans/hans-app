import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { listLlmKeys, type EnvLlmKey } from '@/shared/api/llmKeys';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';
import { cn } from '@/shared/lib/cn';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { SettingGroupList } from '../SettingGroupList';
import { LlmKeyModal } from '@/features/llm/LlmKeyModal';

// 다른 목록(Apps·Users·AppDetail)과 같은 규칙 — 칸 사이 gap-4, 표 좌우 px-6.
const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_minmax(0,180px)_88px_88px_150px] gap-4 px-6';

/**
 * LLM 설정.
 *
 * **한 화면에 둘을 담는다** — 위는 값이 정해진 설정(카탈로그), 아래는 늘고 주는 목록이다.
 * 성격이 달라 저장 방식도 다르지만(카드 단위 저장 vs CRUD) 같이 봐야 하는 것들이다:
 * "왜 AI 가 안 되지" 의 답이 위(한도·스위치)일 수도 아래(키 없음)일 수도 있다.
 *
 * 앱 상세가 앱 정보 아래에 클라이언트 키를 두는 것과 같은 구성이다.
 */
export default function LlmSettings() {
  return (
    <AdminLayout
      title="LLM 설정"
      description="호출 동작·한도와 접속처입니다."
      breadcrumbs={[{ label: '설정' }, { label: 'LLM' }]}
    >
      <div className="max-w-4xl space-y-6">
        <SettingGroupList category="llm" />
        <Keys />
      </div>
    </AdminLayout>
  );
}

/**
 * 키 목록. **설정이 아니라 관리 대상이다** — LOCAL 은 여러 대를 붙일 수 있어야 해서
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
            키 {query.data ? `(${query.data.length})` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            서버가 LLM 을 부를 때 쓰는 키입니다. Ollama 같은 로컬은 여러 대를 등록할 수 있습니다.
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
          {errorMessage(query.error, '키를 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-10 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400">
          등록된 키가 없습니다. 하나는 있어야 AI 검색이 동작합니다.
        </div>
      ) : (
        <Table
          columns={COLUMNS}
          /*
            **업체와 이름을 한 칸에 둔다.** 이름은 LOCAL 만 갖는데(하나뿐인 업체는 업체가
            곧 신원이다) 칸을 따로 두면 절반이 빈다.
          */
          head={['id', '업체', '기본 모델', '키', '상태', '수정']}
          minWidth="min-w-[760px]"
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
                <span className="truncate font-medium text-gray-900">
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
              <span className="truncate font-mono text-xs text-gray-500">
                {row.defaultModel ?? '—'}
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
