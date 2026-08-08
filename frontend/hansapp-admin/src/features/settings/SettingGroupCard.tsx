import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RotateCcw, Trash2 } from 'lucide-react';

import {
  saveSettingGroup,
  type SettingField,
  type SettingGroup,
  type SettingValues,
} from '@/shared/api/settings';
import { errorMessage } from '@/shared/api/errorMessage';
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
          title={section.title}
          fields={section.fields}
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
  title,
  fields,
  restartRequired,
}: {
  groupId: string;
  title?: string;
  fields: SettingField[];
  restartRequired?: boolean;
}) {
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

  return (
    <div>
      {title && (
        // 구역이 갈리는 자리에 선을 긋는다. 같은 카드라도 성격이 다른 값들이다.
        <div className="mb-1 mt-3 border-t border-gray-100 pt-3">
          <span className="text-xs font-semibold text-gray-500">{title}</span>
        </div>
      )}

      <div className={cn(!title && 'mt-2')}>
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            draft={draft}
            editing={editingSecrets.has(field.key)}
            onOpenSecret={() => openSecret(field.key)}
            onChange={(v) => set(field.key, v)}
            onUnset={() => unset(field.key)}
          />
        ))}
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
  return text;
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

        <StatusTag
          source={field.source}
          touched={touched}
          removing={removing}
        />

        {/*
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
      </div>

      {/* select-all 이라 한 번 누르면 통째로 잡힌다 — 이 값은 보려는 게 아니라 복사하려는 것이다. */}
      {showKey && (
        <p className="mt-0.5 select-all pl-[7.75rem] font-mono text-xs text-primary-700">
          {field.key}
        </p>
      )}

      {/* 한 줄이 원칙이라, 설명만 예외로 입력칸 위치에 맞춰 아래에 붙인다. */}
      {field.help && (
        <p className="mt-0.5 pl-[7.75rem] text-xs text-gray-400">
          {field.help}
        </p>
      )}
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
  const box =
    'h-9 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100';

  if (field.type === 'boolean') {
    return (
      <label className="flex h-9 items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-primary"
          checked={touched ? draft[field.key] === true : field.value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
        사용
      </label>
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

  return (
    <input
      className={box}
      // secret 은 편집 모드로 열렸을 때만 여기 온다. 언제나 빈 칸에서 시작한다.
      type={field.type === 'secret' ? 'password' : 'text'}
      inputMode={field.type === 'number' ? 'numeric' : undefined}
      autoComplete="off"
      autoFocus={field.type === 'secret'}
      placeholder={field.placeholder}
      value={
        touched
          ? String(draft[field.key] ?? '')
          : field.type === 'secret'
            ? ''
            : (field.value ?? '')
      }
      onChange={(e) =>
        onChange(
          field.type === 'number' && e.target.value !== ''
            ? Number(e.target.value)
            : e.target.value,
        )
      }
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
 * 줄의 현재 상태. 폭을 고정해 뒤따르는 칸이 줄마다 어긋나지 않게 한다.
 *
 * 값이 어디서 왔는지도 여기서 알린다 — 설정을 DB 로 옮기는 중에는 두 곳이 섞인다.
 */
function StatusTag({
  source,
  touched,
  removing,
}: {
  source: SettingField['source'];
  touched: boolean;
  removing: boolean;
}) {
  const text = removing
    ? '지움'
    : touched
      ? '변경됨'
      : source === 'db'
        ? '설정됨'
        : '미설정';

  return (
    <span
      className={cn(
        'w-14 shrink-0 text-right text-xs',
        removing && 'font-medium text-red-500',
        touched && !removing && 'font-medium text-amber-600',
        !touched && source === 'none' && 'text-gray-300',
        !touched && source !== 'none' && 'text-gray-400',
      )}
    >
      {text}
    </span>
  );
}

/**
 * 필드를 구역(section)별로 묶는다. **카탈로그에 적힌 순서를 그대로 지킨다** —
 * 같은 이름이 떨어져 나오면 별개 묶음이 된다(정렬하지 않는다).
 */
function groupBySection(
  fields: SettingField[],
): { title?: string; fields: SettingField[] }[] {
  const sections: { title?: string; fields: SettingField[] }[] = [];
  for (const field of fields) {
    const last = sections[sections.length - 1];
    if (last && last.title === field.section) {
      last.fields.push(field);
    } else {
      sections.push({ title: field.section, fields: [field] });
    }
  }
  return sections;
}
