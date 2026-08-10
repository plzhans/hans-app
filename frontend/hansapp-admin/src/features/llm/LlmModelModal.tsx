import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createLlmModel,
  deleteLlmModel,
  fetchVendorModels,
  setDefaultLlmModel,
  updateLlmModel,
  type EnvLlmKey,
  type EnvLlmModel,
} from '@/shared/api/llmKeys';
import { errorMessage } from '@/shared/api/errorMessage';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { formatDateTime } from '@/shared/lib/formatDateTime';

const BOX =
  'h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100';

/**
 * 모델 상세·등록 모달.
 *
 * **목록은 보기만 하고 고치는 것은 여기서 한다** — 앱·키 화면과 같은 규칙이다. 표 안에서
 * 바로 바뀌면 잘못 누른 것을 알아채기 전에 서버 동작이 이미 바뀐다.
 *
 * **업체 조회는 거들 뿐이다.** 키가 만료됐거나 서버가 꺼져 있어도 등록은 되어야 하므로,
 * 이름을 직접 적는 칸이 늘 열려 있고 조회 목록은 그 칸을 채우는 수단이다.
 */
export function LlmModelModal({
  llmKey,
  model,
  registered,
  onClose,
}: {
  /** 어느 키의 모델인가. */
  llmKey: EnvLlmKey;
  /** 없으면 등록 모드다. */
  model?: EnvLlmModel;
  /** 이 키에 이미 등록된 모델 이름들(자기 자신은 빼고 넘긴다). */
  registered: readonly string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const creating = !model;

  const [name, setName] = useState(model?.name ?? '');
  const [enabled, setEnabled] = useState(model?.enabled ?? true);
  const [models, setModels] = useState<string[]>([]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['llm-models'] });
    onClose();
  };

  const load = useMutation({
    mutationFn: () => fetchVendorModels({ id: llmKey.id }),
    onSuccess: setModels,
  });

  const save = useMutation({
    mutationFn: () =>
      creating
        ? createLlmModel({ keyId: llmKey.id, name: name.trim(), enabled })
        : updateLlmModel(model.id, { name: name.trim(), enabled }),
    onSuccess: done,
  });
  const makeDefault = useMutation({
    mutationFn: () => setDefaultLlmModel(model!.id),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => deleteLlmModel(model!.id),
    onSuccess: done,
  });

  const busy = save.isPending || makeDefault.isPending || remove.isPending;
  const error = save.error ?? makeDefault.error ?? remove.error;
  const label = llmKey.name || llmKey.provider;

  return (
    <Modal
      size="md"
      title={creating ? `${label} 모델 등록` : model.name}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-gray-700">모델 id</span>
            <span className="text-[11px] text-gray-400">
              날짜 없는 별칭을 씁니다 — 스냅샷 ID 는 은퇴합니다
            </span>
          </div>
          <div className="flex gap-2">
            <input
              className={BOX}
              value={name}
              placeholder="claude-haiku-4-5"
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              disabled={load.isPending}
              onClick={() => load.mutate()}
              className="h-10 shrink-0 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {load.isPending ? '불러오는 중…' : '불러오기'}
            </button>
          </div>

          {/*
            **업체가 돌려준 본문을 그대로 보여 준다.** 여기 담기는 것은 우리 문구가 아니라
            업체의 JSON 이라(무엇이 틀렸는지는 그쪽만 안다) 줄바꿈·따옴표가 살아 있어야 읽힌다.
          */}
          {load.isError && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              {errorMessage(load.error, '모델을 불러오지 못했습니다.')}
            </pre>
          )}

          {models.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-gray-200">
              {models.map((m) => {
                const already = registered.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={already}
                    onClick={() => setName(m)}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-gray-50 px-3 py-1.5 text-left transition last:border-0',
                      already
                        ? 'cursor-not-allowed text-gray-300'
                        : 'hover:bg-gray-50',
                      m === name && !already && 'bg-primary/5',
                    )}
                  >
                    <span className="truncate font-mono text-xs">{m}</span>
                    {already && (
                      <span className="ml-auto shrink-0 text-[11px]">
                        등록됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {models.length === 0 && !load.isError && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              불러오면 업체에 실제로 있는 모델을 목록으로 보여 줍니다. 직접
              적어도 됩니다.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2.5">
          {/* 기본 모델은 끌 수 없다 — 서버가 부를 수 없는 것을 기본으로 두는 상태가 된다. */}
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-primary disabled:opacity-50"
            checked={enabled}
            disabled={!creating && model.isDefault}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm text-gray-700">사용</span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
            {!creating && model.isDefault
              ? '기본 모델이라 끌 수 없습니다.'
              : '끄면 목록에는 남되 부를 수 없습니다.'}
          </span>
        </label>

        {!creating && (
          <p className="text-xs text-gray-400">
            등록 {formatDateTime(model.createdAt)} · 수정{' '}
            {formatDateTime(model.updatedAt)}
          </p>
        )}
      </div>

      {error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(error, '저장하지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={save.isPending}
          disabled={busy || !name.trim()}
          onClick={() => save.mutate()}
        >
          {creating ? '등록' : '저장'}
        </Button>
        {!creating && !model.isDefault && (
          <Button
            type="button"
            variant="outline"
            className="w-auto px-4"
            disabled={busy}
            onClick={() => makeDefault.mutate()}
          >
            기본으로 지정
          </Button>
        )}
        {/* 기본은 서버가 삭제를 막는다. 버튼도 안 보여 준다 — 눌러 보고 알 일이 아니다. */}
        {!creating && !model.isDefault && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate()}
            className="ml-auto text-sm font-medium text-red-500 transition hover:text-red-600 disabled:opacity-50"
          >
            삭제
          </button>
        )}
      </div>
    </Modal>
  );
}
