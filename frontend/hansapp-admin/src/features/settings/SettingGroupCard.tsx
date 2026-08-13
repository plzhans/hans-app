import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';

import {
  saveSettingGroup,
  type SettingField,
  type SettingGroup,
  type SettingValues,
} from '@/shared/api/settings';
import { errorMessage } from '@/shared/api/errorMessage';
import { writeClipboard } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

/** 입력칸이 만들어 내는 값. `null` 은 "지운다"는 뜻이다. */
type Value = string | number | boolean | null;

/**
 * 설정 그룹 하나(카드).
 *
 * **한 줄에 한 설정이다** — 레이블과 입력칸이 나란히 서고, 저장은 구역 단위로 한 번에 한다.
 * 필드마다 저장 버튼을 달면 값 몇 개를 같이 고치는 흔한 흐름에서 버튼을 여러 번 눌러야 한다.
 */
export function SettingGroupCard({ group }: { group: SettingGroup }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            {group.label}
            {group.restartRequired && <Badge tone="amber">재시작 후 적용</Badge>}
          </h2>
          {group.help && (
            <p className="mt-1 text-xs text-gray-400">{group.help}</p>
          )}
        </div>

        {/*
          키를 발급받는 곳으로 바로 간다. 새로 받거나 대조할 때 여기서 검색으로 빠지면
          엉뚱한 페이지에 닿는 일이 생긴다.

          이름은 카탈로그가 준 것을 그대로 쓴다 — 그 사이트가 스스로를 부르는 이름이라
          도착했을 때 대조가 된다. 이름이 없는 곳만 "신청" 으로 채운다.
        */}
        {group.consoles && group.consoles.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            {group.consoles.map((site) => (
              <a
                key={site.url}
                href={site.url}
                target="_blank"
                // noreferrer 가 없으면 열린 창이 window.opener 로 이 화면을 건드릴 수 있다.
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {site.label ?? '신청'}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      {groupBySection(group.fields).map((section, i) => (
        <SectionForm
          key={section.title ?? i}
          groupId={group.id}
          section={section}
          restartRequired={group.restartRequired}
        />
      ))}
    </section>
  );
}

/**
 * 구역 하나 = 저장 단위.
 *
 * 구역마다 제 상태와 제 요청을 들고 있어서, 메일 `from` 을 고치다 SMTP 접속 정보까지
 * 같이 날아가지 않는다. 구역이 없는 그룹은 그룹 전체가 구역 하나다.
 */
function SectionForm({
  groupId,
  section,
  restartRequired,
}: {
  groupId: string;
  section: Section;
  restartRequired?: boolean;
}) {
  const { title, help, tone, fields } = section;
  const qc = useQueryClient();
  /** 사용자가 만진 값만 담는다. 여기 없는 키는 저장 요청에 실리지 않는다. */
  const [draft, setDraft] = useState<SettingValues>({});
  /** 편집 모드로 연 secret 필드. 열기 전에는 마스킹만 보여 준다. */
  const [editingSecrets, setEditingSecrets] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  /** 저장을 누른 뒤 확인을 기다리는 중인가. */
  const [confirming, setConfirming] = useState(false);

  /** 이번에 바뀌는 줄. 확인 모달이 "무엇이 바뀌는지" 를 이걸로 나열한다. */
  const changed = fields.filter((f) => f.key in draft);

  const rows = groupByRow(fields);
  /** 구역 안에서 제일 긴 줄의 칸 수. 모든 줄이 이 칸 수로 선다. */
  const columns = Math.max(...rows.map((row) => row.length), 1);

  const save = useMutation({
    mutationFn: () => saveSettingGroup(groupId, draft),
    onSuccess: (groups) => {
      // 응답이 곧 최신 상태다. 다시 불러오지 않고 캐시를 갈아 끼운다.
      qc.setQueryData(['settings'], groups);
      setDraft({});
      setEditingSecrets(new Set());
      setConfirming(false);
      setSaved(true);
    },
  });

  const dirty = Object.keys(draft).length > 0;

  const set = (key: string, value: Value) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  /** 한 줄만 안 만진 상태로 되돌린다. **빈 문자열을 넣으면 안 된다** — 서버가 그것도 삭제로 읽는다. */
  const unset = (key: string) => {
    setSaved(false);
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditingSecrets((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const openSecret = (key: string) => {
    setEditingSecrets((prev) => new Set(prev).add(key));
    set(key, '');
  };

  const cancel = () => {
    setDraft({});
    setEditingSecrets(new Set());
    save.reset();
    setSaved(false);
    setConfirming(false);
  };

  /*
    **`notice` 구역은 통째로 감싼다.** 선 하나로 가르는 것으로는 부족한 자리가 있다 —
    구글은 서비스 로그인과 관리자 콘솔 로그인이 한 카드에 있고 줄 생김새가 똑같아서,
    지금 만지는 것이 회원의 입구인지 내 입구인지가 제목 한 줄에만 걸린다.
  */
  const notice = tone === 'notice';

  return (
    <div
      className={cn(
        notice &&
          'mt-3 rounded-xl border border-amber-200 bg-amber-50/40 px-3 pb-3',
      )}
    >
      {title && (
        // 구역이 갈리는 자리에 선을 긋는다. 같은 카드라도 성격이 다른 값들이다.
        <div
          className={cn(
            'mb-1 mt-3 pt-3',
            notice ? 'pt-0' : 'border-t border-gray-100',
          )}
        >
          <span
            className={cn(
              'text-xs font-semibold',
              notice ? 'text-amber-900' : 'text-gray-500',
            )}
          >
            {title}
          </span>
          {help && (
            <p
              className={cn(
                'mt-0.5 text-xs',
                notice ? 'text-amber-800' : 'text-gray-400',
              )}
            >
              {help}
            </p>
          )}
        </div>
      )}

      <div className={cn(!title && 'mt-2')}>
        {rows.map((row) => {
          const cells = row.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              draft={draft}
              editing={editingSecrets.has(field.key)}
              onOpenSecret={() => openSecret(field.key)}
              onChange={(v) => set(field.key, v)}
              onUnset={() => unset(field.key)}
            />
          ));
          if (columns === 1) return cells[0];
          /*
            **체크박스 줄은 칸을 나누지 않는다.** 늘어나는 입력칸이 없어 넓다고 이상해지지
            않고, 오히려 옆에 붙는 설명이 반 폭에서 잘린다.
          */
          if (row.length === 1 && row[0].type === 'boolean') return cells[0];
          /*
            **칸 수를 구역 안에서 맞춘다.** 입력칸이 있는 줄이 혼자 서면 남는 폭을 다 먹어
            그 줄만 두 배로 길어진다 — 모자란 칸은 빈 자리로 채운다.
          */
          return (
            <div key={row[0].key} className="flex gap-4">
              {cells.map((cell, i) => (
                <div key={row[i].key} className="min-w-0 flex-1">
                  {cell}
                </div>
              ))}
              {Array.from({ length: columns - cells.length }, (_, i) => (
                <div key={`pad-${i}`} className="flex-1" aria-hidden />
              ))}
            </div>
          );
        })}
      </div>

      {save.isError && (
        <p className="mt-2 whitespace-pre-line text-sm text-red-500">
          {errorMessage(save.error, '저장하지 못했습니다.')}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          className="h-8 w-auto px-3 text-xs"
          disabled={!dirty}
          onClick={() => setConfirming(true)}
        >
          저장
        </Button>
        {Object.keys(draft).length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-8 w-auto px-3 text-xs"
            onClick={cancel}
          >
            되돌리기
          </Button>
        )}
        {saved && !dirty && (
          <span className="text-xs font-medium text-green-600">저장됨</span>
        )}
      </div>

      {/*
        **저장은 서버 동작을 바꾼다.** 화면 값만 바뀌는 목록 편집과 달리 메일이 안 나가거나
        소셜 로그인이 막히는 결과로 이어져서, 한 번 되묻고 넘어간다.
      */}
      {confirming && (
        <ConfirmSave
          title={title}
          changed={changed}
          draft={draft}
          restartRequired={restartRequired}
          pending={save.isPending}
          error={save.isError ? save.error : null}
          onConfirm={() => save.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/**
 * 저장 확인.
 *
 * **무엇이 바뀌는지 이름으로 나열한다.** "정말 저장할까요?" 만 묻는 창은 한 번 더 누르는
 * 절차일 뿐이라 아무도 안 읽는다 — 목록이 있어야 잘못 건드린 줄을 여기서 알아챈다.
 *
 * 값은 싣지 않는다. secret 이 섞여 있는데 그것만 빼면 목록이 들쭉날쭉해지고, 어차피
 * 바로 뒤 화면에 그대로 보인다.
 */
function ConfirmSave({
  title,
  changed,
  draft,
  restartRequired,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title?: string;
  changed: SettingField[];
  draft: SettingValues;
  restartRequired?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal size="md" title={title ? `${title} 저장` : '설정 저장'} onClose={onClose}>
      <p className="text-sm text-gray-600">
        저장하면 <strong className="font-semibold">서버 동작에 바로 반영</strong>
        됩니다.
      </p>

      {restartRequired && (
        // 이걸 안 알리면 "저장했는데 왜 안 되냐" 가 된다. passport 전략은 부팅 때 끼워진다.
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          이 설정은 <strong className="font-semibold">서버를 다시 띄워야</strong>{' '}
          적용됩니다.
        </p>
      )}

      {changed.length > 0 && (
        <ChangeList
          title="바꾸는 값"
          rows={changed.map((f) => ({
            label: f.label,
            value: describeDraft(f, draft),
          }))}
        />
      )}

      {error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(error, '저장하지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          type="button"
          className="w-auto px-4"
          loading={pending}
          onClick={onConfirm}
        >
          저장
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 저장할 값이 무엇이 되는지를 화면의 말로 적는다.
 *
 * **secret 은 뒤 4자만 남긴다.** 방금 친 값이라 화면에 띄워도 새로 새는 것은 아니지만,
 * 확인 창은 어깨너머로 보이기 가장 쉬운 자리다 — 맞게 쳤는지 확인하는 데는 4자면 된다.
 */
function describeDraft(field: SettingField, draft: SettingValues): string {
  const value = draft[field.key];
  if (value === null || value === '') return '지움';
  if (field.type === 'boolean') return value === true ? '사용' : '사용 안 함';
  const text = String(value);
  if (field.type === 'secret') return `••••${text.slice(-4)}`;
  // 확인 창에서도 같은 모양이어야 "내가 친 것이 이것" 이 한눈에 맞는다.
  return field.type === 'number' ? group(text) : text;
}

/**
 * 세 자리마다 쉼표. **숫자가 아닌 것은 건드리지 않는다** — 아직 다 안 친 값이나 빈 칸이
 * 그대로 지나가야 입력이 끊기지 않는다.
 */
function group(raw: string): string {
  const digits = raw.replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return raw;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function ChangeList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string | null }[];
}) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-semibold text-gray-500">
        {title}
        <span className="ml-1 font-normal text-gray-400">{rows.length}개</span>
      </p>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-baseline gap-3 px-3 py-1.5 text-sm"
          >
            <span className="w-24 shrink-0 truncate text-gray-500">
              {row.label}
            </span>
            {/*
              **한 줄로 자른다.** 확인 창은 "무엇이 바뀌는지" 를 훑는 자리라 줄 수가 일정해야
              한 눈에 들어온다 — 값 하나가 길다고 세 줄로 늘어나면 목록이 읽히지 않는다.
              전체는 hover 로 본다.
            */}
            <span
              className="min-w-0 flex-1 truncate font-medium text-gray-900"
              title={row.value ?? undefined}
            >
              {row.value || <span className="text-gray-400">비움</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 한 줄 = 설정 하나. `[레이블] [입력칸] [상태] [지우기]`
 *
 * 뒤 두 칸은 폭을 고정한다 — 비워 두면 줄마다 입력칸 끝이 어긋난다.
 */
function FieldRow({
  field,
  draft,
  editing,
  onOpenSecret,
  onChange,
  onUnset,
}: {
  field: SettingField;
  draft: SettingValues;
  editing: boolean;
  onOpenSecret: () => void;
  onChange: (value: Value) => void;
  onUnset: () => void;
}) {
  const touched = field.key in draft;
  /** 지우기를 눌러 둔 상태. 저장하기 전까지는 되돌릴 수 있다. */
  const removing = touched && draft[field.key] === null;
  const masked = field.type === 'secret' && !editing;
  /** 실제 설정 키를 펼쳐 놨는가. 레이블을 눌러 연다. */
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="py-1">
      <div className="flex items-center gap-3">
        {/*
          레이블에 실제 키를 숨겨 둔다. 화면의 "host" 가 설정 파일·DB 의 어느 키인지
          알아야 하는 순간이 있는데(폴백을 찾거나 SQL 로 확인할 때), 그때마다 카탈로그를
          열어 보게 할 이유가 없다. 평소에는 보이지 않아 줄이 늘어지지도 않는다.
        */}
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          title={showKey ? '설정 키 감추기' : '설정 키 보기'}
          className={cn(
            // **폭이 하나다.** 줄마다 다르면 입력칸 왼쪽 끝이 어긋나 표가 깨져 보인다.
            'w-28 shrink-0 truncate text-left text-sm font-medium transition',
            'decoration-dotted underline-offset-4 hover:underline',
            showKey ? 'text-primary' : 'text-gray-700 hover:text-gray-900',
          )}
        >
          {field.label}
        </button>

        <div className="min-w-0 flex-1">
          {removing ? (
            <div className="flex h-9 items-center rounded-lg border border-dashed border-gray-300 px-3 text-xs text-gray-400">
              저장하면 지워집니다
            </div>
          ) : field.type === 'readonly' ? (
            <DerivedValue value={field.value} />
          ) : masked ? (
            /*
              **원문을 받아 온 적이 없다.** 값을 채운 입력칸을 보여 주면 거짓말이 된다.
              "****뒤4자" 만 두고, 바꾸려면 옆 버튼으로 연다.
            */
            <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
              <span className="flex-1 truncate font-mono text-xs text-gray-500">
                {field.hasValue ? `****${field.suffix ?? ''}` : '설정 안 됨'}
              </span>
              <button
                type="button"
                onClick={onOpenSecret}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {field.hasValue ? '변경' : '입력'}
              </button>
            </div>
          ) : (
            <FieldInput
              field={field}
              draft={draft}
              touched={touched}
              onChange={onChange}
            />
          )}
        </div>

        {/*
          **버튼이 입력칸 바로 옆이다.** 누르는 것과 눌러서 바뀌는 것이 붙어 있어야 한다.
          자리는 항상 차지한다 — 비워 두면 줄마다 입력칸 끝이 어긋난다.
          DB 에 값이 있는 줄만 지울 것이 있다.
        */}
        <div className="w-7 shrink-0">
          {touched ? (
            <IconButton title="되돌리기" onClick={onUnset}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
          ) : field.source === 'db' ? (
            <IconButton title="지우기" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>

        {/* 결과(변경됨·지움)는 줄 끝에서 읽는다. */}
        <StatusTag touched={touched} removing={removing} />
      </div>

      {/* select-all 이라 한 번 누르면 통째로 잡힌다 — 이 값은 보려는 게 아니라 복사하려는 것이다. */}
      {showKey && (
        <p
          // 레이블 폭 + gap-3. 아래 줄이 입력칸 왼쪽 끝과 맞아야 읽힌다.
          className="mt-0.5 select-all pl-[7.75rem] font-mono text-xs text-primary-700"
        >
          {field.key}
        </p>
      )}

      {/*
        한 줄이 원칙이라, 설명만 예외로 입력칸 위치에 맞춰 아래에 붙인다.
        boolean 은 체크박스 옆이 비어 있어 그쪽에 붙는다(FieldInput 참고).
      */}
      {field.help && field.type !== 'boolean' && (
        <p className="mt-0.5 pl-[7.75rem] text-xs text-gray-400">
          {field.help}
        </p>
      )}
    </div>
  );
}

/**
 * 서버가 만들어 준 값(리디렉션 주소). **고칠 수 없고, 옮겨 적을 것도 없다** — 발급처 콘솔에
 * 붙여 넣는 것이 전부라 복사 버튼 하나만 둔다.
 *
 * 값 자체는 `select-all` 이라 클릭 한 번으로 전체가 잡힌다. 복사가 막히는 환경에서 남는
 * 길이 그것뿐이라, 실패했을 때도 그 사실을 말한다(조용히 삼키면 복사한 줄 알고 넘어간다).
 */
function DerivedValue({ value }: { value: string | null }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!value) {
    /*
      **주소를 지어내지 않는다.** 서버의 외부 주소(externalUrl)가 비어 있으면 만들 수 있는
      값이 없다 — 그럴듯한 것을 보여 주면 그것을 콘솔에 등록한 뒤 로그인이 막히는 자리에서야
      드러난다.
    */
    return (
      <div className="flex h-9 items-center rounded-lg border border-dashed border-gray-300 px-3 text-xs text-gray-400">
        서버 외부 주소가 설정되지 않아 만들 수 없습니다
      </div>
    );
  }

  const copy = async () => {
    const ok = await writeClipboard(value);
    setState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
      <code className="min-w-0 flex-1 select-all truncate font-mono text-xs text-gray-700">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        title={state === 'failed' ? '복사하지 못했습니다' : '복사'}
        aria-label="복사"
        className={cn(
          'shrink-0 transition',
          state === 'failed'
            ? 'text-amber-600'
            : 'text-gray-400 hover:text-gray-700',
        )}
      >
        {state === 'copied' ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

/** 타입별 입력칸. 높이를 h-10 으로 맞춰 한 줄 안에서 어긋나지 않게 둔다. */
function FieldInput({
  field,
  draft,
  touched,
  onChange,
}: {
  field: SettingField;
  draft: SettingValues;
  touched: boolean;
  onChange: (value: Value) => void;
}) {
  // 배경을 명시한다 — 구역이 색을 깔고 있으면(notice) 투명한 입력칸이 그 색을 그대로 비친다.
  const box =
    'h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100';

  if (field.type === 'boolean') {
    /*
      **설명을 체크박스 옆에 붙인다.** 다른 타입은 입력칸이 줄을 다 쓰지만 이건 체크박스
      하나라 오른쪽이 통째로 비는데, 설명을 아래 줄로 내리면 안 써도 될 줄을 하나 더 쓴다.

      label 밖에 둔다 — 안에 넣으면 설명을 읽으려고 누른 것이 체크 토글이 된다.
    */
    return (
      <div className="flex h-9 min-w-0 items-center gap-2.5">
        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-primary"
            checked={
              touched ? draft[field.key] === true : field.value === 'true'
            }
            onChange={(e) => onChange(e.target.checked)}
          />
          사용
        </label>
        {field.help && (
          // 좁은 화면에서 넘치면 자르되 title 로 전문을 남긴다.
          <span
            title={field.help}
            className="min-w-0 flex-1 truncate text-xs text-gray-400"
          >
            {field.help}
          </span>
        )}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <select
        className={box}
        value={touched ? String(draft[field.key] ?? '') : (field.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택 안 함</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  const isNumber = field.type === 'number';
  const raw = touched
    ? String(draft[field.key] ?? '')
    : field.type === 'secret'
      ? ''
      : (field.value ?? '');

  return (
    <input
      className={box}
      // secret 은 편집 모드로 열렸을 때만 여기 온다. 언제나 빈 칸에서 시작한다.
      type={field.type === 'secret' ? 'password' : 'text'}
      inputMode={isNumber ? 'numeric' : undefined}
      autoComplete="off"
      autoFocus={field.type === 'secret'}
      /*
        **숫자는 자리를 끊어 보여 준다.** 토큰 한도처럼 0 이 예닐곱 개 붙는 값은 그냥 두면
        자릿수를 눈으로 못 센다 — 실제로 20000000 을 200000 으로 적는 사고가 났다.
        저장은 끊김 없는 숫자로 나간다(아래 onChange 가 쉼표를 떼고 Number 로 바꾼다).
      */
      placeholder={
        isNumber && field.placeholder
          ? group(field.placeholder)
          : field.placeholder
      }
      value={isNumber ? group(raw) : raw}
      onChange={(e) => {
        if (!isNumber) return onChange(e.target.value);
        // 사람이 친 쉼표든 우리가 넣은 쉼표든 똑같이 뗀다.
        const digits = e.target.value.replace(/,/g, '');
        onChange(digits === '' ? '' : Number(digits));
      }}
    />
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      {children}
    </button>
  );
}

/**
 * **아직 저장 안 한 변경**을 알린다. 폭을 고정해 뒤따르는 칸이 줄마다 어긋나지 않게 한다.
 *
 * 값이 있는지 없는지는 적지 않는다 — 입력칸에 그대로 보이고(secret 은 `****뒤4자`),
 * 같은 말을 두 번 하면 정작 여기서 봐야 할 "내가 뭘 만졌나" 가 묻힌다.
 * 설정 파일 폴백이 있던 시절에는 값의 출처가 갈려 필요했지만, 지금 출처는 DB 하나다.
 */
function StatusTag({
  touched,
  removing,
}: {
  touched: boolean;
  removing: boolean;
}) {
  return (
    <span
      className={cn(
        'w-14 shrink-0 text-right text-xs font-medium',
        removing ? 'text-red-500' : 'text-amber-600',
      )}
    >
      {removing ? '지움' : touched ? '변경됨' : ''}
    </span>
  );
}

/** 한 구역. 제목·설명·톤은 구역 안의 필드들이 들고 온 것을 모은 값이다. */
interface Section {
  title?: string;
  help?: string;
  tone?: 'notice';
  fields: SettingField[];
}

/**
 * 필드를 구역(section)별로 묶는다. **카탈로그에 적힌 순서를 그대로 지킨다** —
 * 같은 이름이 떨어져 나오면 별개 묶음이 된다(정렬하지 않는다).
 *
 * 구역의 설명·톤은 **아무 필드에 적혀 있어도 집는다**. 첫 필드만 본다면 그 앞에 한 줄
 * 끼워 넣는 순간 설명이 조용히 사라진다.
 */
function groupBySection(fields: SettingField[]): Section[] {
  const sections: Section[] = [];
  for (const field of fields) {
    const last = sections[sections.length - 1];
    if (!last || last.title !== field.section) {
      sections.push({ title: field.section, fields: [] });
    }
    const section = sections[sections.length - 1];
    section.fields.push(field);
    section.help ??= field.sectionHelp;
    section.tone ??= field.sectionTone;
  }
  return sections;
}

/**
 * 구역 안의 필드를 한 줄 단위로 묶는다. **카탈로그 순서를 그대로 지킨다** —
 * 연달아 있고 `row` 가 같은 것끼리만 한 줄에 선다(떨어져 있으면 각자 줄을 갖는다).
 */
function groupByRow(fields: SettingField[]): SettingField[][] {
  const rows: SettingField[][] = [];
  for (const field of fields) {
    const last = rows[rows.length - 1];
    if (field.row && last && last[0].row === field.row) {
      last.push(field);
    } else {
      rows.push([field]);
    }
  }
  return rows;
}
