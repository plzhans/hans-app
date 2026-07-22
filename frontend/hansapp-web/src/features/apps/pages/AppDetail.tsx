import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Info, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import {
  createClient,
  deleteApp,
  deleteClient,
  getApp,
  issueApiKey,
  regenerateClientSecret,
  renameApp,
  updateClient,
  type AppClient,
  type AppDetail as AppDetailT,
} from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { Gnb } from '@/shared/components/Gnb';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

export default function AppDetail() {
  const { id } = useParams();
  const appId = Number(id);
  const qc = useQueryClient();

  const { data: app, isLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => getApp(appId),
    enabled: Number.isFinite(appId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['app', appId] });

  return (
    <div className="min-h-full">
      <Gnb />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/apps"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> 앱 목록
        </Link>

        {isLoading || !app ? (
          <div className="py-16 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : (
          <>
            <BasicInfoSection appId={appId} app={app} onChange={invalidate} />
            <ServiceKeySection appId={appId} app={app} onChange={invalidate} />
            <ClientSection appId={appId} app={app} onChange={invalidate} />
            <DangerZone appId={appId} appName={app.name} />
          </>
        )}
      </main>
    </div>
  );
}

// ---- 공통: 시크릿 1회 노출 ----

function SecretReveal({
  label,
  value,
  onDone,
}: {
  label: string;
  value: string;
  onDone: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-medium text-amber-700">
        {label} — 다시 볼 수 없으니 안전하게 복사해 두세요.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 break-all text-sm text-gray-800">{value}</code>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(value)}
          className="shrink-0 text-gray-400 hover:text-primary"
          title="복사"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 text-xs font-semibold text-amber-700 hover:underline"
      >
        확인했습니다
      </button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
      {children}
    </section>
  );
}

function SectionHead({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-2">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <h2 className="font-bold text-gray-900">{title}</h2>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

// ---- 기본 정보 (앱 이름 수정) ----

function BasicInfoSection({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(app.name);
  const rename = useMutation({
    mutationFn: (v: string) => renameApp(appId, v),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== app.name;

  return (
    <Card>
      <SectionHead icon={<Info className="h-5 w-5" />} title="기본 정보" />
      <div className="rounded-lg bg-gray-50 px-4 py-3">
        {editing ? (
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-sm text-gray-500">이름</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) rename.mutate(trimmed);
                if (e.key === 'Escape') {
                  setName(app.name);
                  setEditing(false);
                }
              }}
              className="h-9 w-56 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
          </div>
        ) : (
          <Row label="이름" value={app.name} />
        )}
        <Row label="생성일" value={app.createdAt.slice(0, 10)} />
      </div>

      {rename.isError && (
        <p className="mt-2 text-sm text-red-500">
          {errorMessage(rename.error, '이름 변경에 실패했습니다.')}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {editing ? (
          <>
            <Button
              className="w-auto"
              loading={rename.isPending}
              disabled={!canSave}
              onClick={() => rename.mutate(trimmed)}
            >
              저장
            </Button>
            <Button
              variant="outline"
              className="w-auto"
              onClick={() => {
                setName(app.name);
                setEditing(false);
              }}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="w-auto"
            onClick={() => setEditing(true)}
          >
            이름 수정
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---- 서비스 키 (앱당 1개) ----

function ServiceKeySection({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const key = app.apiKeys[0];
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const issue = useMutation({
    mutationFn: () => issueApiKey(appId),
    onSuccess: (r) => {
      setRevealed(r.key);
      setConfirmRegen(false);
      onChange();
    },
  });

  return (
    <Card>
      <SectionHead icon={<KeyRound className="h-5 w-5" />} title="서비스 키" />
      {key ? (
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <div>
            <code className="text-sm text-gray-800">{key.keyPrefix}…</code>
            <div className="text-xs text-gray-400">
              생성일 {key.createdAt.slice(0, 10)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmRegen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 재발급
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">발급된 키가 없습니다.</span>
          <Button
            className="w-auto"
            loading={issue.isPending}
            onClick={() => issue.mutate()}
          >
            생성
          </Button>
        </div>
      )}
      {issue.isError && (
        <p className="mt-2 text-sm text-red-500">
          {errorMessage(issue.error, '발급에 실패했습니다.')}
        </p>
      )}
      {revealed && (
        <SecretReveal
          label="서비스 키"
          value={revealed}
          onDone={() => setRevealed(null)}
        />
      )}

      {confirmRegen && (
        <ConfirmDialog
          danger
          title="서비스 키 재발급"
          confirmText="재발급"
          loading={issue.isPending}
          onConfirm={() => issue.mutate()}
          onCancel={() => setConfirmRegen(false)}
        >
          <b>기존 키가 즉시 무효화됩니다.</b> 이 키를 사용 중인 서버·스크립트는
          모두 새 키로 교체해야 합니다. 계속할까요?
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ---- 클라이언트 (앱당 1개) ----

function ClientSection({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const client = app.clients[0];
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const create = useMutation({
    mutationFn: (v: { origins: string[]; redirectUris: string[] }) =>
      createClient(appId, v),
    onSuccess: (r) => {
      setRevealed(r.secret);
      onChange();
    },
  });
  const update = useMutation({
    mutationFn: (v: { origins: string[]; redirectUris: string[] }) =>
      updateClient(appId, client!.id, v),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const regen = useMutation({
    mutationFn: () => regenerateClientSecret(appId, client!.id),
    onSuccess: (r) => {
      setRevealed(r.secret);
      setConfirmRegen(false);
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteClient(appId, client!.id),
    onSuccess: () => {
      setConfirmDelete(false);
      onChange();
    },
  });

  return (
    <Card>
      <SectionHead icon={<KeyRound className="h-5 w-5" />} title="클라이언트" />

      {!client ? (
        <ClientForm
          submitting={create.isPending}
          error={create.isError ? errorMessage(create.error) : undefined}
          onSubmit={(v) => create.mutate(v)}
        />
      ) : editing ? (
        <ClientForm
          initial={client}
          submitLabel="저장"
          submitting={update.isPending}
          error={update.isError ? errorMessage(update.error) : undefined}
          onCancel={() => setEditing(false)}
          onSubmit={(v) => update.mutate(v)}
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <Row label="Client ID" value={client.clientId} />
            <Row label="생성일" value={client.createdAt.slice(0, 10)} />
            <Row
              label="마지막 사용일"
              value={client.lastUsedAt ? client.lastUsedAt.slice(0, 10) : '없음'}
            />
            <div className="my-2 border-t border-gray-200" />
            <Row label="Client Secret" value={`****${client.secretSuffix}`} />
            <Row
              label="Client Secret 생성일"
              value={client.secretCreatedAt.slice(0, 10)}
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setConfirmRegen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 재발급
              </button>
            </div>
          </div>

          <ListBlock label="승인된 JavaScript 원본" values={client.origins} />
          <ListBlock label="승인된 리디렉션 URI" values={client.redirectUris} />

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="w-auto"
              onClick={() => setEditing(true)}
            >
              수정
            </Button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> 클라이언트 삭제
            </button>
          </div>
        </div>
      )}

      {revealed && (
        <SecretReveal
          label="Client Secret"
          value={revealed}
          onDone={() => setRevealed(null)}
        />
      )}

      {confirmRegen && (
        <ConfirmDialog
          danger
          title="Client Secret 재발급"
          confirmText="재발급"
          loading={regen.isPending}
          onConfirm={() => regen.mutate()}
          onCancel={() => setConfirmRegen(false)}
        >
          <b>기존 Client Secret 이 즉시 무효화됩니다.</b> 이 시크릿으로 인증하던
          서버는 새 값으로 교체해야 합니다. 계속할까요?
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog
          danger
          title="클라이언트 삭제"
          confirmText="삭제"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        >
          클라이언트를 삭제하면 이 client_id 로 로그인·API 를 붙인 서비스가 즉시
          동작을 멈춥니다. 계속할까요?
        </ConfirmDialog>
      )}
    </Card>
  );
}

function ListBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400">{label}</div>
      {values.length === 0 ? (
        <div className="text-sm text-gray-300">—</div>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {values.map((v) => (
            <li key={v} className="text-sm text-gray-700">
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- 클라이언트 등록/수정 폼 (인라인) ----

function ClientForm({
  initial,
  submitLabel = '등록',
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: AppClient;
  submitLabel?: string;
  submitting: boolean;
  error?: string;
  onSubmit: (v: { origins: string[]; redirectUris: string[] }) => void;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ origins: string; redirectUris: string }>({
    defaultValues: {
      origins: (initial?.origins ?? []).join('\n'),
      redirectUris: (initial?.redirectUris ?? []).join('\n'),
    },
  });

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          origins: toLines(v.origins),
          redirectUris: toLines(v.redirectUris),
        }),
      )}
      className="space-y-4"
    >
      <TextArea
        label="승인된 JavaScript 원본"
        hint="브라우저 요청에 사용. 와일드카드·경로는 넣을 수 없고, 80/443 외 포트는 지정해야 합니다. 예: https://example.com:8080 (한 줄에 하나)"
        placeholder={'https://app.example.com'}
        error={errors.origins?.message}
        {...register('origins', { validate: validateOrigins })}
      />
      <TextArea
        label="승인된 리디렉션 URI"
        hint="로그인 후 이 경로로 리디렉션되며 뒤에 인가 코드가 붙습니다. 프로토콜이 있어야 하고 URL 조각(#)·상대 경로·와일드카드는 넣을 수 없습니다. (한 줄에 하나)"
        placeholder={'https://app.example.com/auth/callback'}
        error={errors.redirectUris?.message}
        {...register('redirectUris', { validate: validateRedirects })}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---- 위험 구역: 앱 삭제(이름 입력 확인) ----

function DangerZone({ appId, appName }: { appId: number; appName: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [input, setInput] = useState('');
  const remove = useMutation({
    mutationFn: () => deleteApp(appId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      navigate('/apps', { replace: true });
    },
  });
  const match = input.trim() === appName;

  return (
    <section className="mt-10 rounded-2xl border border-red-200 bg-red-50/40 p-5">
      <h2 className="font-bold text-red-700">위험 구역</h2>
      <p className="mt-1 text-sm text-gray-600">
        앱을 삭제하면 서비스 키·클라이언트가 <b>즉시 함께 삭제</b>되며 되돌릴 수
        없습니다.
      </p>

      <button
        type="button"
        onClick={() => setArmed(true)}
        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" /> 앱 삭제
      </button>

      {armed && (
        <ConfirmDialog
          danger
          title="앱 삭제"
          confirmText="삭제"
          disabled={!match}
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => {
            setArmed(false);
            setInput('');
          }}
        >
          <p>
            이 앱과 서비스 키·클라이언트가 <b>즉시 함께 삭제</b>되며 되돌릴 수
            없습니다. 확인을 위해 앱 이름 <b>{appName}</b> 을(를) 입력하세요.
          </p>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={appName}
            className="mt-3 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </ConfirmDialog>
      )}
    </section>
  );
}

// ---- 폼 유틸 ----

function TextArea({
  label,
  hint,
  error,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {hint && <p className="mb-1 mt-0.5 text-xs text-gray-400">{hint}</p>}
      <textarea
        {...rest}
        rows={3}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
          error ? 'border-red-400' : 'border-gray-300'
        }`}
      />
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}

function validateOrigins(text: string): true | string {
  for (const line of toLines(text)) {
    if (line.includes('*')) return '와일드카드는 사용할 수 없습니다.';
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return `오리진 형식이 올바르지 않습니다: ${line}`;
    }
    if (url.origin !== line) {
      return `경로 없이 오리진만 입력하세요(예: https://example.com:8080): ${line}`;
    }
  }
  return true;
}

function validateRedirects(text: string): true | string {
  for (const line of toLines(text)) {
    if (line.includes('*')) return '와일드카드는 사용할 수 없습니다.';
    if (line.includes('#')) return 'URL 조각(#)은 포함할 수 없습니다.';
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return `URL 형식이 올바르지 않습니다(프로토콜 필요): ${line}`;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return `http/https 프로토콜만 허용됩니다: ${line}`;
    }
  }
  return true;
}

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
