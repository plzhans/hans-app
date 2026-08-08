import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  createLlmKey,
  deleteLlmKey,
  fetchVendorModels,
  setDefaultLlmKey,
  updateLlmKey,
  type EnvLlmKey,
  type EnvLlmKeyInput,
  type LlmKeyType,
  type LlmProvider,
} from '@/shared/api/llmKeys';
import { errorMessage } from '@/shared/api/errorMessage';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { formatDateTime } from '@/shared/lib/formatDateTime';

const PROVIDERS: LlmProvider[] = ['ANTHROPIC', 'OPENAI', 'LOCAL'];

/** 여러 대를 붙일 수 있어 이름으로 구별하는 업체. 나머지는 업체가 곧 신원이다. */
const MULTI = (p: LlmProvider) => p === 'LOCAL';
/** LOCAL 은 이 주소가 신원이라 앞에 두고 반드시 채운다. */
const NEEDS_BASE_URL = (p: LlmProvider) => p === 'LOCAL';
/** **AUTH_TOKEN 은 ANTHROPIC 전용이다.** 개인 구독 토큰이라 다른 업체엔 대응물이 없다. */
const ALLOWS_AUTH_TOKEN = (p: LlmProvider) => p === 'ANTHROPIC';

/**
 * LLM 키 상세·등록 모달.
 *
 * **키는 원문을 받아 온 적이 없다.** 그래서 입력칸을 채워 보여 줄 수 없고, "설정됨
 * ****abcd" 와 바꾸기 버튼만 둔다 — 설정 화면의 secret 과 같은 규칙이다.
 *
 * **안 만진 필드는 요청에 담지 않는다.** 통째로 보내면 마스킹된 값으로 실제 키를 덮는다.
 */
export function LlmKeyModal({
  llmKey,
  onClose,
}: {
  /** 없으면 등록 모드다. */
  llmKey?: EnvLlmKey;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const creating = !llmKey;

  const [draft, setDraft] = useState<EnvLlmKeyInput>(
    creating ? { provider: 'ANTHROPIC', keyType: 'API_KEY' } : {},
  );
  /** 키를 편집 모드로 열었는가. 열기 전에는 마스킹만 보여 준다. */
  const [editingSecret, setEditingSecret] = useState(false);
  /**
   * 고급 설정을 펼쳤는가. **값이 이미 있으면 처음부터 펼친다** — 접어 두면 누가 넣어 둔
   * baseUrl 이 안 보인 채로 "왜 기본 주소로 안 나가지" 를 찾게 된다.
   */
  const [advanced, setAdvanced] = useState(!!llmKey?.baseUrl);
  /**
   * 업체에서 받아 온 모델 목록. **비어 있으면 셀렉트를 안 그린다** —
   * 조회는 거들 뿐이고, 직접 입력이 늘 열려 있어야 한다.
   */
  const [models, setModels] = useState<string[]>([]);

  const provider = draft.provider ?? llmKey?.provider ?? 'ANTHROPIC';
  const keyType: LlmKeyType = ALLOWS_AUTH_TOKEN(provider)
    ? (draft.keyType ?? llmKey?.keyType ?? 'API_KEY')
    : 'API_KEY';

  const value = (key: keyof EnvLlmKeyInput): string =>
    key in draft
      ? String(draft[key] ?? '')
      : String((llmKey?.[key as keyof EnvLlmKey] as string) ?? '');

  const set = (key: keyof EnvLlmKeyInput, v: string) =>
    setDraft((prev) => ({ ...prev, [key]: v }));

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['llm-keys'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      creating
        ? createLlmKey({ ...draft, provider, keyType })
        : updateLlmKey(llmKey.id, { ...draft, keyType }),
    onSuccess: done,
  });
  const makeDefault = useMutation({
    mutationFn: () => setDefaultLlmKey(llmKey!.id),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => deleteLlmKey(llmKey!.id),
    onSuccess: done,
  });

  /*
    **모델 조회는 저장과 별개다.** 실패해도 등록은 계속할 수 있어야 하므로 오류를 따로
    들고 있고(아래 error 에 섞지 않는다) 목록만 못 채운 상태로 둔다.
  */
  const load = useMutation({
    mutationFn: () =>
      fetchVendorModels({
        id: llmKey?.id,
        provider,
        keyType,
        // 화면에서 막 입력한 키가 있으면 그것으로 물어본다.
        secret: typeof draft.secret === 'string' ? draft.secret : undefined,
        baseUrl: value('baseUrl') || undefined,
      }),
    onSuccess: setModels,
  });

  const busy = save.isPending || makeDefault.isPending || remove.isPending;
  const error = save.error ?? makeDefault.error ?? remove.error;

  return (
    <Modal
      size="md"
      title={creating ? '키 등록' : (llmKey.name || llmKey.provider)}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="업체">
          <Select value={provider} onChange={(v) => set('provider', v)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>

        {MULTI(provider) && (
          <Field label="이름" hint="여러 대를 붙일 수 있어 이름으로 구별합니다.">
            <input
              className={BOX}
              value={value('name')}
              placeholder="사무실 ollama"
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        )}

        {/*
          **키 유형은 앤트로픽만 고를 수 있다.** 구독 토큰은 개인 구독이라 다른 업체엔
          대응물이 없고, 헤더도 다르게 나간다(x-api-key vs Bearer + oauth 베타).
        */}
        {ALLOWS_AUTH_TOKEN(provider) && (
          <Field
            label="키 유형"
            hint={
              keyType === 'AUTH_TOKEN'
                ? '개인 구독 토큰(claude setup-token)입니다. 서비스가 아니라 디버그용입니다.'
                : '서비스용 정식 키입니다.'
            }
          >
            <Select value={keyType} onChange={(v) => set('keyType', v)}>
              <option value="API_KEY">API Key</option>
              <option value="AUTH_TOKEN">Auth Token (구독)</option>
            </Select>
          </Field>
        )}

        <Field label={keyType === 'AUTH_TOKEN' ? 'Auth Token' : 'API Key'}>
          {creating || editingSecret ? (
            <input
              className={BOX}
              type="password"
              autoComplete="off"
              value={value('secret')}
              onChange={(e) => set('secret', e.target.value)}
            />
          ) : (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
              <span className="flex-1 truncate font-mono text-xs text-gray-500">
                {llmKey.hasSecret
                  ? `****${llmKey.secretSuffix ?? ''}`
                  : '설정 안 됨'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingSecret(true);
                  set('secret', '');
                }}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {llmKey.hasSecret ? '변경' : '입력'}
              </button>
            </div>
          )}
        </Field>

        {NEEDS_BASE_URL(provider) && (
          <Field label="Base URL" hint="이 주소가 신원입니다. 반드시 채웁니다.">
            <input
              className={BOX}
              value={value('baseUrl')}
              placeholder="http://127.0.0.1:11434"
              onChange={(e) => set('baseUrl', e.target.value)}
            />
          </Field>
        )}

        <Field
          label="기본 모델"
          hint="날짜 없는 별칭을 씁니다 — 스냅샷 ID 는 은퇴합니다. 직접 적어도 됩니다."
        >
          <div className="flex gap-2">
            <input
              className={BOX}
              value={value('defaultModel')}
              placeholder="claude-haiku-4-5"
              onChange={(e) => set('defaultModel', e.target.value)}
            />
            <button
              type="button"
              disabled={load.isPending}
              onClick={() => load.mutate()}
              className="h-10 shrink-0 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {load.isPending ? '조회 중…' : '모델 조회'}
            </button>
          </div>
          {/*
            **셀렉트는 거들 뿐이다.** 업체가 안 될 때도 등록은 되어야 하므로 목록이 왔을
            때만 나타나고, 고르면 위 입력칸을 채운다.
          */}
          {/*
            **고른 값을 그대로 비춘다.** 빈 placeholder 로 두면 위 입력칸과 따로 노는 것처럼
            보인다. 손으로 적어 목록에 없는 이름도 선택지에 끼워 넣어야 셀렉트가 빈칸이 되지 않는다.
          */}
          {models.length > 0 && (
            <div className="mt-2">
              <Select
                value={value('defaultModel')}
                onChange={(v) => set('defaultModel', v)}
              >
                <option value="">선택 안 함</option>
                {withCurrent(models, value('defaultModel')).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {/*
            **업체가 돌려준 본문을 그대로 보여 준다.** 여기 담기는 것은 우리 문구가 아니라
            업체의 JSON 이라(무엇이 틀렸는지는 그쪽만 안다) 줄바꿈·따옴표가 살아 있어야 읽힌다.
            길어서 잘리면 정작 원인이 뒤에 있으므로 스크롤을 단다.
          */}
          {load.isError && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              {errorMessage(load.error, '모델을 불러오지 못했습니다.')}
            </pre>
          )}
        </Field>

        {/*
          **잠금이 아니라 허용이다.** 업체가 모델을 새로 내도 여기 적기 전까지는 못 부른다 —
          모델이 곧 단가라 "부를 수 있는 것" 을 명시해 두는 쪽이 맞다.
        */}
        <Field
          label="허용 모델"
          hint="쉼표로 나열. 비우면 기본 모델 하나만 쓸 수 있습니다."
        >
          <input
            className={BOX}
            value={value('allowedModels')}
            placeholder="claude-opus-5, claude-sonnet-5"
            onChange={(e) => set('allowedModels', e.target.value)}
          />
          {/*
            **조회한 것은 체크로 담고 뺀다.** 목록이 열 개 안팎이라 콤보박스보다 한눈에 들어온다.

            위 입력칸이 원본이고 이 목록은 그것을 거드는 수단이다 — 업체가 안 될 때도(키 만료·
            서버 다운) 손으로 적을 수 있어야 하고, 조회 목록에 없는 이름(직접 적은 것)도
            입력칸에는 그대로 남는다.
          */}
          {models.length > 0 && (
            <div className="mt-2 max-h-44 overflow-auto rounded-lg border border-gray-200">
              {models.map((m) => {
                const picked = splitCsv(value('allowedModels')).includes(m);
                return (
                  <label
                    key={m}
                    className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-primary"
                      checked={picked}
                      onChange={() => {
                        const current = splitCsv(value('allowedModels'));
                        const next = picked
                          ? current.filter((v) => v !== m)
                          : [...current, m];
                        set('allowedModels', next.join(', '));
                      }}
                    />
                    <span className="truncate font-mono text-xs text-gray-700">
                      {m}
                    </span>
                    {m === value('defaultModel') && (
                      // 기본 모델은 목록에 없어도 늘 쓸 수 있다. 그 사실을 여기서 알린다.
                      <span className="ml-auto shrink-0 text-[11px] text-gray-400">
                        기본
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Field>

        {!creating && (
          <Field label="상태">
            <Select
              value={draft.status ?? llmKey.status}
              onChange={(v) => set('status', v)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </Select>
          </Field>
        )}

        {!NEEDS_BASE_URL(provider) && (
          <Advanced open={advanced} onToggle={() => setAdvanced((v) => !v)}>
            <Field
              label="Base URL"
              hint="비우면 업체 기본 주소를 씁니다. 프록시·게이트웨이를 끼울 때만 채웁니다."
            >
              <input
                className={BOX}
                value={value('baseUrl')}
                placeholder="https://api.anthropic.com"
                onChange={(e) => set('baseUrl', e.target.value)}
              />
            </Field>
          </Advanced>
        )}

        {!creating && (
          <p className="pl-[6.5rem] text-xs text-gray-400">
            등록 {formatDateTime(llmKey.createdAt)} · 수정{' '}
            {formatDateTime(llmKey.updatedAt)}
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
          disabled={busy}
          onClick={() => save.mutate()}
        >
          {creating ? '등록' : '저장'}
        </Button>
        {!creating && !llmKey.isDefault && (
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
        {!creating && !llmKey.isDefault && (
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

const BOX =
  'h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100';

/**
 * 셀렉트 한 칸.
 *
 * **화살표를 직접 그린다.** 브라우저 기본 화살표는 OS 마다 모양·위치가 달라서, 옆에 선
 * 입력칸들과 높이는 같은데 안쪽이 어긋나 보인다. appearance-none 으로 지우고 같은 아이콘을 쓴다.
 */
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        className={cn(BOX, 'cursor-pointer appearance-none pr-9')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

/** 지금 값이 조회 목록에 없으면 앞에 끼운다 — 손으로 적은 이름이 셀렉트에서 사라지지 않게. */
function withCurrent(models: string[], current: string): string[] {
  return current && !models.includes(current) ? [current, ...models] : models;
}

/** 쉼표 문자열 → 목록. 백엔드가 읽는 방식과 같아야 화면과 동작이 안 갈린다. */
function splitCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 평소에는 안 쓰는 값들. 접어 두되 값이 들어 있으면 펼친 채로 연다. */
function Advanced({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-700"
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 transition', open && 'rotate-90')}
        />
        고급 설정
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm font-medium text-gray-700">
          {label}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {hint && <p className="mt-0.5 pl-[6.5rem] text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
