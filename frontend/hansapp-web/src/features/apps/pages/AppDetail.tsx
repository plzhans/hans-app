import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  createApiKey,
  createClient,
  deleteApiKey,
  deleteApp,
  deleteClient,
  getApp,
  regenerateApiKey,
  regenerateClientSecret,
  requestReview,
  updateApp,
  updateClient,
  type ApiKeySummary,
  type AppClient,
  type AppClientType,
  type AppDetail as AppDetailT,
  type CreateClientInput,
  type CreatedApiKey,
  type CreatedClient,
} from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Modal } from '@/shared/ui/Modal';
import { Tabs } from '@/shared/ui/Tabs';
import { TextField } from '@/shared/ui/TextField';
import { PAGE_CONTAINER } from '@/shared/ui/layout';
import { cn } from '@/shared/lib/cn';
import { copyText } from '@/shared/lib/clipboard';
import { latinRegister, stripNonLatin } from '@/shared/lib/latinInput';
import { StatusBadge } from '../StatusBadge';

/** 앱 이름: 영어·하이픈만. */
const APP_NAME_RE = /^[a-zA-Z-]+$/;

/**
 * 앱 상세.
 *
 * 데스크톱에서는 **사이드바와 본문 두 단**으로 나눈다. 좀처럼 바뀌지 않는 기본 정보를
 * 왼쪽에 세워 두고, 실제로 손대는 발급물에 넓은 오른쪽을 준다. 앱 삭제는 되돌릴 수 없어
 * 언제나 페이지 맨 아래다. 좁은 화면에서는 다시 한 단으로 쌓인다.
 */
/** 상세 탭. 인증(서비스 키·클라이언트)과 AI/LLM(외부 업체 키)은 성격이 달라 자리를 나눈다. */
type DetailTab = 'auth' | 'ai';

export default function AppDetail() {
  const { id } = useParams();
  const appId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('auth');

  const { data: app, isLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => getApp(appId),
    enabled: Number.isFinite(appId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['app', appId] });

  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className={cn(PAGE_CONTAINER, 'flex-1 py-10')}>
        <Link
          to="/apps"
          className="mb-5 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> 앱 목록
        </Link>

        {isLoading || !app ? (
          <div className="py-24 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : app.deletedAt ? (
          <DeletedAppView app={app} />
        ) : (
          <>
            <PageHead app={app} />

            {app.status === 'PENDING' && (
              <ReviewNotice appId={appId} app={app} onChange={invalidate} />
            )}

            <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <aside>
                <BasicInfoSection
                  appId={appId}
                  app={app}
                  onChange={invalidate}
                />
              </aside>

              {/*
                기본 정보는 탭 밖에 둔다 — 어느 탭을 보든 "지금 어느 앱인가" 는 필요하다.
                탭은 실제로 손대는 발급물만 가른다.
              */}
              <div>
                <Tabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    {
                      value: 'auth',
                      label: '인증',
                      count: app.apiKeys.length + app.clients.length,
                    },
                    { value: 'ai', label: 'AI/LLM' },
                  ]}
                />

                {/*
                  탭이 열리는 판. 윗변은 Tabs 가 그은 선이 그대로 맡는다(border-t-0) —
                  판이 제 윗변을 또 그리면 고른 탭이 끊어 놓은 자리에 선이 겹쳐 되살아난다.
                */}
                <div className="divide-y divide-gray-200 rounded-b-2xl border border-t-0 border-gray-200 bg-white">
                  {tab === 'auth' ? (
                    <>
                      <ServiceKeySection
                        appId={appId}
                        app={app}
                        onChange={invalidate}
                      />
                      <ClientSection
                        appId={appId}
                        app={app}
                        onChange={invalidate}
                      />
                    </>
                  ) : (
                    <ProviderKeySection />
                  )}
                </div>
              </div>
            </div>

            {/* 앱 삭제는 언제나 페이지 맨 아래다. 되돌릴 수 없는 동작이라 다른 카드 사이에
                끼워 두면 스크롤 중에 눈에 먼저 들어온다. */}
            <div className="mt-6">
              <DangerZone appId={appId} appName={app.name} />
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

// ---- 공통 ----

/** 앱 이름·상태를 페이지 맨 위에 크게 세운다. 어느 앱을 보고 있는지가 먼저다. */
function PageHead({ app }: { app: AppDetailT }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
      <StatusBadge status={app.status} reviewState={app.reviewState} />
      <span className="text-sm text-gray-400">
        앱 ID <span className="font-mono text-gray-500">{app.id}</span>
      </span>
    </div>
  );
}

/**
 * 심사 안내 배너(PENDING 앱 전용). 심사 세부 상태(reviewState)에 따라 셋으로 갈린다.
 *
 * 어느 상태든 키·클라이언트 폼과 발급 자체는 그대로 동작한다(진짜 키 값이 나온다) —
 * 승인 전까지 인증만 거부된다. 배너는 "지금 어느 단계인지"와 다음 행동을 안내한다.
 *  - DRAFT     작성 중 → '심사 요청' 버튼
 *  - REVIEWING 심사 중 → 대기 안내
 *  - REJECTED  거절됨 → 사유 표시 + '다시 심사 요청'
 */
function ReviewNotice({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => requestReview(appId),
    onSuccess: () => {
      setError(null);
      onChange();
    },
    onError: (e) => setError(errorMessage(e, '심사 요청에 실패했습니다.')),
  });

  const rejected = app.reviewState === 'REJECTED';
  const reviewing = app.reviewState === 'REVIEWING';

  return (
    // 넓은 화면에서는 안내가 왼쪽, 행동 버튼이 오른쪽 한 줄로 붙는다.
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0">
        {reviewing ? (
          <>
            <p className="font-semibold">심사 중입니다.</p>
            <p className="mt-1 text-amber-700">
              운영자 검토를 기다리는 중입니다. 승인되면 발급해 둔 키·클라이언트가
              함께 활성화됩니다.
            </p>
          </>
        ) : rejected ? (
          <>
            <p className="font-semibold">심사가 거절되었습니다.</p>
            {app.rejectionReason && (
              <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-amber-900">
                {app.rejectionReason}
              </p>
            )}
            <p className="mt-1 text-amber-700">
              사유를 반영한 뒤 다시 요청해 주세요.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">아직 승인되지 않은 앱입니다.</p>
            <p className="mt-1 text-amber-700">
              키·클라이언트는 지금도 발급되지만, 승인 전까지는 실제 API 호출에
              사용할 수 없습니다. 준비가 되면 심사를 요청하세요.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-red-600">{error}</p>}
      </div>

      {!reviewing && (
        <Button
          className="w-auto shrink-0 self-start lg:self-auto"
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending
            ? '요청 중…'
            : rejected
              ? '다시 심사 요청'
              : '심사 요청'}
        </Button>
      )}
    </div>
  );
}

/** 시크릿 마스킹 기본 형식. 비밀 부분을 별표(*)로 가린다. */
function maskSecret(value: string): string {
  // 서비스 키(sk_appId_keyId_random)는 식별부(sk_appId_keyId)는 남기고 랜덤부만 가린다.
  if (value.startsWith('sk_')) {
    return `${value.split('_').slice(0, 3).join('_')}_${'*'.repeat(12)}`;
  }
  // 그 외(클라이언트 시크릿 등)는 뒤 4자만 남기고 가린다.
  return `${'*'.repeat(12)}${value.slice(-4)}`;
}

/**
 * 시크릿 표시. 기본은 **가려진 상태**(별표)이고, 눈 버튼으로 전체를 보고,
 * 복사 버튼으로 복사한다(비보안 컨텍스트 폴백 포함). 값은 입력창 같은 박스 안에 둔다.
 */
function RevealSecret({ value, masked }: { value: string; masked?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5">
      <code className="flex-1 break-all font-mono text-sm text-gray-800">
        {shown ? value : (masked ?? maskSecret(value))}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="shrink-0 text-gray-400 hover:text-gray-700"
        title={shown ? '가리기' : '보기'}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-gray-400 hover:text-primary"
        title="복사"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

/** 시크릿 1회 노출 박스(재발급 등 인라인용). 기본 가림 + 클릭해 보기. */
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
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-medium text-amber-700">
        {label} — 다시 볼 수 없으니 안전하게 복사해 두세요.
      </p>
      <div className="mt-2">
        <RevealSecret value={value} />
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

/**
 * 생성 완료 뷰 모달. 생성된 기본정보(children)를 보여주고, 시크릿이 있으면 함께 노출한다.
 * 시크릿이 있을 때는 닫기 시 "다시 볼 수 없음"을 확인받는다(시크릿 없으면 바로 닫힘).
 */
function ResultModal({
  title,
  size = 'md',
  secret,
  secretLabel,
  onClose,
  children,
}: {
  title: string;
  size?: 'md' | 'lg';
  secret?: string;
  secretLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const guardedClose = secret ? () => setConfirmClose(true) : onClose;

  return (
    <Modal onClose={guardedClose} title={title} size={size}>
      <div className="space-y-4">
        {children}

        {secret && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-700">
              {secretLabel} — 지금만 확인할 수 있습니다. 창을 닫으면 다시 볼 수
              없으니 안전하게 복사해 두세요.
            </p>
            <div className="mt-2">
              <RevealSecret value={secret} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button className="w-auto" onClick={guardedClose}>
            닫기
          </Button>
        </div>
      </div>

      {confirmClose && (
        <ConfirmDialog
          danger
          title="정말 닫을까요?"
          confirmText="닫기"
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        >
          창을 닫으면 <b>{secretLabel}을(를) 다시 볼 수 없습니다.</b> 안전한 곳에
          저장했는지 확인하세요.
        </ConfirmDialog>
      )}
    </Modal>
  );
}

/** 홀로 서는 카드(사이드바·삭제된 앱). 제 테두리로 경계를 만든다. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      {children}
    </section>
  );
}

/**
 * 탭 판 안의 섹션. **테두리도 배경도 없다** — 판이 이미 흰 상자라
 * 그 안에서 또 상자를 두르면 흰 바탕에 흰 상자가 겹쳐 경계만 지저분해진다.
 * 섹션끼리는 판이 그어 주는 구분선(divide-y)으로 나뉜다.
 */
function PanelSection({ children }: { children: React.ReactNode }) {
  return <section className="p-6">{children}</section>;
}

function SectionHead({
  icon,
  title,
  desc,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <h2 className="font-bold text-gray-900">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-gray-400">{desc}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/**
 * 항목 한 줄. 라벨 폭을 고정해 **값의 왼쪽 끝이 세로로 맞는다** — 값을 오른쪽에
 * 붙이면 길이에 따라 시작점이 들쭉날쭉해서 여러 줄을 훑기 어렵다.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="break-all font-medium text-gray-800">{value}</span>
    </div>
  );
}

function ListBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400">{label}</div>
      {values.length === 0 ? (
        <div className="text-sm text-gray-300">—</div>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {values.map((v) => (
            <li key={v} className="break-all text-sm text-gray-700">
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 표 껍데기. 좁은 화면에서는 열을 우그러뜨리는 대신 가로로 스크롤한다. */
function Table({
  columns,
  head,
  minWidth = 'min-w-[640px]',
  children,
}: {
  columns: string;
  head: string[];
  minWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <div className={minWidth}>
        <div
          className={cn(
            'grid border-b border-gray-200 bg-gray-50 py-2.5 text-xs font-semibold text-gray-400',
            columns,
          )}
        >
          {head.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- 삭제된 앱: 마스킹 뷰(기본정보만, 관리 불가) ----

function DeletedAppView({ app }: { app: AppDetailT }) {
  return (
    <div className="max-w-2xl">
      <Card>
        <SectionHead icon={<Info className="h-5 w-5" />} title="기본 정보" />
        <div className="rounded-lg bg-gray-50 px-4 py-3">
          <Row label="이름" value={app.name} />
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
            <span className="text-gray-500">상태</span>
            <StatusBadge status={app.status} deleted />
          </div>
          <Row label="생성일" value={app.createdAt.slice(0, 10)} />
          {app.deletedAt && (
            <Row label="삭제일" value={app.deletedAt.slice(0, 10)} />
          )}
        </div>
        <p className="mt-4 text-sm text-gray-500">
          삭제된 앱입니다. 서비스 키·클라이언트는 비활성화되었으며, 상세 정보는
          표시되지 않습니다.
        </p>
      </Card>
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
    mutationFn: (v: string) => updateApp(appId, { name: v }),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });

  const trimmed = name.trim();
  const valid = APP_NAME_RE.test(trimmed);
  const canSave = valid && trimmed !== app.name;

  return (
    <Card>
      <SectionHead icon={<Info className="h-5 w-5" />} title="기본 정보" />
      <div className="rounded-lg bg-gray-50 px-4 py-3">
        <Row label="앱 ID" value={String(app.id)} />
        {editing ? (
          <div className="py-1">
            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
              <span className="text-sm text-gray-500">이름</span>
              <input
                autoFocus
                value={name}
                onChange={(e) =>
                  setName(
                    (e.nativeEvent as InputEvent).isComposing
                      ? e.target.value
                      : stripNonLatin(e.target.value),
                  )
                }
                onCompositionEnd={(e) =>
                  setName(stripNonLatin(e.currentTarget.value))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) rename.mutate(trimmed);
                  if (e.key === 'Escape') {
                    setName(app.name);
                    setEditing(false);
                  }
                }}
                placeholder="my-service"
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <p
              className={`mt-1.5 text-xs ${
                trimmed.length > 0 && !valid ? 'text-red-500' : 'text-gray-400'
              }`}
            >
              영어와 하이픈(-)만 사용할 수 있습니다.
            </p>
          </div>
        ) : (
          <Row label="이름" value={app.name} />
        )}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
          <span className="text-gray-500">상태</span>
          <StatusBadge status={app.status} reviewState={app.reviewState} />
        </div>
        <Row label="생성일" value={app.createdAt.slice(0, 10)} />
      </div>

      {rename.isError && (
        <p className="mt-2 text-sm text-red-500">
          {errorMessage(rename.error, '이름 변경에 실패했습니다.')}
        </p>
      )}

      <div className="mt-4 flex gap-2">
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

// ---- 서비스 키 (앱당 여러 개, 이름 지정) ----

/** 서비스 키 표의 열 폭. 헤더·행이 같이 쓴다. */
const KEY_COLUMNS =
  'grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_120px_120px_44px] gap-4 px-5';

function ServiceKeySection({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const keys = app.apiKeys;
  const atLimit = keys.length >= app.apiKeyLimit;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const create = useMutation({
    mutationFn: () => createApiKey(appId, name.trim()),
    onSuccess: (r) => {
      setCreated(r);
      setAdding(false);
      setName('');
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: (keyId: number) => deleteApiKey(appId, keyId),
    onSuccess: () => {
      setConfirmDeleteId(null);
      onChange();
    },
  });

  const selected = keys.find((k) => k.id === selectedId) ?? null;

  return (
    <PanelSection>
      <SectionHead
        icon={<KeyRound className="h-5 w-5" />}
        title="서비스 키"
        desc="서버에서 API 를 호출할 때 쓰는 키입니다."
        right={
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-gray-400">
              {keys.length}/{app.apiKeyLimit}
            </span>
            <Button
              variant="outline"
              className="w-auto"
              disabled={atLimit}
              onClick={() => {
                setName('');
                setAdding(true);
              }}
            >
              <Plus className="h-4 w-4" /> 키 발급
            </Button>
          </div>
        }
      />

      {keys.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
          발급된 서비스 키가 없습니다.
        </div>
      ) : (
        <Table
          columns={KEY_COLUMNS}
          head={['이름', '키', '생성일', '마지막 사용', '']}
        >
          {keys.map((k) => (
            <div
              key={k.id}
              onClick={() => setSelectedId(k.id)}
              className={cn(
                'grid w-full cursor-pointer items-center border-b border-gray-100 py-4 text-left text-sm transition last:border-0 hover:bg-gray-50',
                KEY_COLUMNS,
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-800">
                <span className="truncate">{k.name}</span>
                {k.status === 'PENDING' && (
                  <span className="shrink-0 text-xs font-semibold text-amber-600">
                    심사 중
                  </span>
                )}
              </span>
              <code className="truncate font-mono text-gray-500">
                {k.keyPrefix}…
              </code>
              <span className="text-gray-500">{k.createdAt.slice(0, 10)}</span>
              <span className="text-gray-500">
                {k.lastUsedAt ? k.lastUsedAt.slice(0, 10) : '—'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(k.id);
                }}
                className="justify-self-center text-gray-300 transition hover:text-red-600"
                title="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Table>
      )}

      {atLimit && (
        <p className="mt-2 text-xs text-gray-400">
          발급 상한({app.apiKeyLimit}개)에 도달했습니다.
        </p>
      )}

      {create.isError && (
        <p className="mt-2 text-sm text-red-500">
          {errorMessage(create.error, '발급에 실패했습니다.')}
        </p>
      )}
      {confirmDeleteId !== null && (
        <ConfirmDialog
          danger
          title="서비스 키 삭제"
          confirmText="삭제"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        >
          이 키는 즉시 무효화됩니다. 사용 중인 서버·스크립트는 동작을 멈춥니다.
          계속할까요?
        </ConfirmDialog>
      )}

      {created && (
        <ResultModal
          title="서비스 키 발급 완료"
          secret={created.key}
          secretLabel="서비스 키"
          onClose={() => setCreated(null)}
        >
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <Row label="이름" value={created.name} />
            <Row label="키" value={`${created.keyPrefix}…`} />
            <Row label="생성일" value={created.createdAt.slice(0, 10)} />
          </div>
        </ResultModal>
      )}

      {/* 발급 모달 */}
      {adding && (
        <Modal onClose={() => setAdding(false)} title="서비스 키 발급">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
            className="space-y-5"
          >
            <TextField
              label="키 이름"
              hint="어디에 쓰는 키인지 알아볼 수 있게 지으세요."
              placeholder="server-prod"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-auto"
                onClick={() => setAdding(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                className="w-auto"
                loading={create.isPending}
                disabled={!name.trim()}
              >
                발급
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 상세 모달 (행 클릭) */}
      {selected && (
        <Modal onClose={() => setSelectedId(null)} title={selected.name}>
          <KeyDetail
            key={selected.id}
            appId={appId}
            apiKey={selected}
            onChange={onChange}
            onDeleted={() => setSelectedId(null)}
          />
        </Modal>
      )}
    </PanelSection>
  );
}

function KeyDetail({
  appId,
  apiKey,
  onChange,
  onDeleted,
}: {
  appId: number;
  apiKey: ApiKeySummary;
  onChange: () => void;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const regen = useMutation({
    mutationFn: () => regenerateApiKey(appId, apiKey.id),
    onSuccess: (r) => {
      setRevealed(r.key);
      setConfirmRegen(false);
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteApiKey(appId, apiKey.id),
    onSuccess: () => {
      setConfirmDelete(false);
      onChange();
      onDeleted();
    },
  });

  return (
    <div>
      <div className="rounded-lg bg-gray-50 px-4 py-3">
        <Row label="이름" value={apiKey.name} />
        <Row label="키" value={`${apiKey.keyPrefix}…`} />
        <Row label="생성일" value={apiKey.createdAt.slice(0, 10)} />
        <Row
          label="마지막 사용일"
          value={apiKey.lastUsedAt ? apiKey.lastUsedAt.slice(0, 10) : '없음'}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmRegen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
        >
          <RefreshCw className="h-4 w-4" /> 재발급
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> 삭제
        </button>
      </div>

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
          loading={regen.isPending}
          onConfirm={() => regen.mutate()}
          onCancel={() => setConfirmRegen(false)}
        >
          <b>기존 키가 즉시 무효화됩니다.</b> 이 키를 쓰던 서버·스크립트는 새 키로
          교체해야 합니다. 계속할까요?
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog
          danger
          title="서비스 키 삭제"
          confirmText="삭제"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        >
          이 키는 즉시 무효화됩니다. 사용 중인 서버·스크립트는 동작을 멈춥니다.
          계속할까요?
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---- 클라이언트 (앱당 여러 개, 플랫폼별) ----

const TYPE_LABEL: Record<AppClientType, string> = {
  WEB: '웹',
  IOS: 'iOS',
  ANDROID: 'Android',
};

const TYPE_ORDER: AppClientType[] = ['WEB', 'IOS', 'ANDROID'];

/** 클라이언트 표의 열 폭. 헤더·행이 같이 쓴다. */
const CLIENT_COLUMNS =
  'grid-cols-[minmax(0,1.2fr)_100px_minmax(0,1.4fr)_120px_120px] gap-4 px-5';

function TypeBadge({ type }: { type: AppClientType }) {
  const Icon = type === 'WEB' ? Globe : Smartphone;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">
      <Icon className="h-3.5 w-3.5" />
      {TYPE_LABEL[type]}
    </span>
  );
}

function ClientSection({
  appId,
  app,
  onChange,
}: {
  appId: number;
  app: AppDetailT;
  onChange: () => void;
}) {
  const clients = app.clients;
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<AppClientType | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedClient | null>(null);

  const openAdd = () => {
    setAddType(null);
    setAdding(true);
  };
  const closeAdd = () => {
    setAdding(false);
    setAddType(null);
  };

  const create = useMutation({
    mutationFn: (input: CreateClientInput) => createClient(appId, input),
    onSuccess: (r) => {
      setCreated(r);
      closeAdd();
      onChange();
    },
  });

  const selected = clients.find((c) => c.id === selectedId) ?? null;
  const sorted = [...clients].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <PanelSection>
      <SectionHead
        icon={<KeyRound className="h-5 w-5" />}
        title="클라이언트"
        desc="웹·앱에서 로그인을 붙일 때 쓰는 플랫폼별 인증 정보입니다."
        right={
          <Button variant="outline" className="w-auto shrink-0" onClick={openAdd}>
            <Plus className="h-4 w-4" /> 클라이언트 추가
          </Button>
        }
      />

      {clients.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
          등록된 클라이언트가 없습니다.
        </div>
      ) : (
        /* 목록 (행 클릭 → 상세/편집) */
        <Table
          columns={CLIENT_COLUMNS}
          head={['이름', '유형', '클라이언트 ID', '생성일', '마지막 사용']}
        >
          {sorted.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'grid w-full items-center border-b border-gray-100 py-4 text-left text-sm transition last:border-0 hover:bg-gray-50',
                CLIENT_COLUMNS,
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-800">
                <span className="truncate">{c.name}</span>
                {c.status === 'PENDING' && (
                  <span className="shrink-0 text-xs font-semibold text-amber-600">
                    심사 중
                  </span>
                )}
              </span>
              <span>
                <TypeBadge type={c.type} />
              </span>
              <code className="truncate font-mono text-gray-500">
                {c.clientId}
              </code>
              <span className="text-gray-500">{c.createdAt.slice(0, 10)}</span>
              <span className="text-gray-500">
                {c.lastUsedAt ? c.lastUsedAt.slice(0, 10) : '—'}
              </span>
            </button>
          ))}
        </Table>
      )}

      {/* 추가 모달 (플랫폼 선택 → 폼) */}
      {adding && (
        <Modal
          onClose={closeAdd}
          size="lg"
          title={
            addType ? (
              <span className="flex items-center gap-2">
                <TypeBadge type={addType} />
                <span>클라이언트 추가</span>
              </span>
            ) : (
              '클라이언트 추가'
            )
          }
        >
          {!addType ? (
            <div>
              <p className="mb-3 text-sm font-medium text-gray-700">
                플랫폼을 선택하세요
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(['WEB', 'IOS', 'ANDROID'] as AppClientType[]).map((t) => {
                  const Icon = t === 'WEB' ? Globe : Smartphone;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAddType(t)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 py-6 text-sm font-semibold text-gray-700 transition hover:border-primary hover:bg-primary-50"
                    >
                      <Icon className="h-6 w-6 text-primary" />
                      {TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ClientForm
              type={addType}
              showClientId
              submitLabel="등록"
              submitting={create.isPending}
              error={create.isError ? errorMessage(create.error) : undefined}
              onCancel={() => setAddType(null)}
              onSubmit={(v) =>
                create.mutate({ type: addType, ...v } as CreateClientInput)
              }
            />
          )}
        </Modal>
      )}

      {created && (
        <ResultModal
          title="클라이언트 생성 완료"
          size="lg"
          secret={created.secret}
          secretLabel="Client Secret"
          onClose={() => setCreated(null)}
        >
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <Row label="유형" value={TYPE_LABEL[created.type]} />
            <Row label="이름" value={created.name} />
            <Row label="Client ID" value={created.clientId} />
            {created.type === 'IOS' && (
              <>
                <Row label="Bundle ID" value={created.config?.bundleId ?? '—'} />
                <Row label="Team ID" value={created.config?.teamId ?? '—'} />
              </>
            )}
            {created.type === 'ANDROID' && (
              <Row
                label="패키지명"
                value={created.config?.packageName ?? '—'}
              />
            )}
          </div>
          {created.type === 'WEB' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ListBlock
                label="승인된 JavaScript 원본"
                values={created.origins ?? []}
              />
              <ListBlock
                label="승인된 리디렉션 URI"
                values={created.redirectUris ?? []}
              />
            </div>
          )}
          {created.type === 'ANDROID' && (
            <ListBlock
              label="SHA-256 인증서 지문"
              values={created.config?.fingerprints ?? []}
            />
          )}
        </ResultModal>
      )}

      {/* 상세/편집 모달 (행 클릭 시) */}
      {selected && (
        <Modal
          onClose={() => setSelectedId(null)}
          size="lg"
          title={
            <span className="flex items-center gap-2">
              <TypeBadge type={selected.type} />
              <span className="truncate">{selected.name}</span>
            </span>
          }
        >
          <ClientDetail
            key={selected.id}
            appId={appId}
            client={selected}
            onChange={onChange}
            onDeleted={() => setSelectedId(null)}
          />
        </Modal>
      )}
    </PanelSection>
  );
}

function ClientDetail({
  appId,
  client,
  onChange,
  onDeleted,
}: {
  appId: number;
  client: AppClient;
  onChange: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useMutation({
    mutationFn: (v: ClientFormPayload) => updateClient(appId, client.id, v),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const regen = useMutation({
    mutationFn: () => regenerateClientSecret(appId, client.id),
    onSuccess: (r) => {
      setRevealed(r.secret);
      setConfirmRegen(false);
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteClient(appId, client.id),
    onSuccess: () => {
      setConfirmDelete(false);
      onChange();
      onDeleted();
    },
  });

  const cfg = client.config ?? {};

  if (editing) {
    return (
      <div>
        <ClientForm
          type={client.type}
          initial={client}
          submitLabel="저장"
          submitting={update.isPending}
          error={update.isError ? errorMessage(update.error) : undefined}
          onCancel={() => setEditing(false)}
          onSubmit={(v) => update.mutate(v)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-lg bg-gray-50 px-4 py-3">
        <Row label="Client ID" value={client.clientId} />
        <Row label="생성일" value={client.createdAt.slice(0, 10)} />
        <Row
          label="마지막 사용일"
          value={client.lastUsedAt ? client.lastUsedAt.slice(0, 10) : '없음'}
        />

        {client.type === 'WEB' && (
          <>
            <div className="my-2 border-t border-gray-200" />
            <Row
              label="Client Secret"
              value={client.secretSuffix ? `****${client.secretSuffix}` : '—'}
            />
            {client.secretCreatedAt && (
              <Row
                label="Client Secret 생성일"
                value={client.secretCreatedAt.slice(0, 10)}
              />
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setConfirmRegen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 재발급
              </button>
            </div>
          </>
        )}

        {client.type === 'IOS' && (
          <>
            <div className="my-2 border-t border-gray-200" />
            <Row label="Bundle ID" value={cfg.bundleId ?? '—'} />
            <Row label="Team ID" value={cfg.teamId ?? '—'} />
          </>
        )}

        {client.type === 'ANDROID' && (
          <>
            <div className="my-2 border-t border-gray-200" />
            <Row label="패키지명" value={cfg.packageName ?? '—'} />
          </>
        )}
      </div>

      {client.type === 'WEB' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ListBlock
            label="승인된 JavaScript 원본"
            values={client.origins ?? []}
          />
          <ListBlock
            label="승인된 리디렉션 URI"
            values={client.redirectUris ?? []}
          />
        </div>
      )}
      {client.type === 'ANDROID' && (
        <div className="mt-4">
          <ListBlock
            label="SHA-256 인증서 지문"
            values={cfg.fingerprints ?? []}
          />
        </div>
      )}

      <div className="mt-5 flex gap-2">
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
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> 삭제
        </button>
      </div>

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
          이 클라이언트를 삭제하면 해당 client_id 로 붙인 로그인·API 가 즉시
          동작을 멈춥니다. 계속할까요?
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---- 클라이언트 폼 (타입별) ----

/** 폼이 상위로 넘기는 값(생성 시 caller 가 type 을 덧붙인다). */
interface ClientFormPayload {
  name: string;
  clientId?: string;
  origins?: string[];
  redirectUris?: string[];
  bundleId?: string;
  teamId?: string;
  packageName?: string;
  fingerprints?: string[];
}

interface ClientFormFields {
  name: string;
  clientId: string;
  origins: string;
  redirectUris: string;
  bundleId: string;
  teamId: string;
  packageName: string;
  fingerprints: string;
}

function ClientForm({
  type,
  initial,
  showClientId = false,
  submitLabel = '등록',
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  type: AppClientType;
  initial?: AppClient;
  /** 생성 시에만 Client ID 직접 지정 입력을 노출한다(생성 후 변경 불가). */
  showClientId?: boolean;
  submitLabel?: string;
  submitting: boolean;
  error?: string;
  onSubmit: (v: ClientFormPayload) => void;
  onCancel?: () => void;
}) {
  const cfg = initial?.config ?? {};
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ClientFormFields>({
    defaultValues: {
      name: initial?.name ?? '',
      clientId: '',
      origins: (initial?.origins ?? []).join('\n'),
      redirectUris: (initial?.redirectUris ?? []).join('\n'),
      bundleId: cfg.bundleId ?? '',
      teamId: cfg.teamId ?? '',
      packageName: cfg.packageName ?? '',
      fingerprints: (cfg.fingerprints ?? []).join('\n'),
    },
  });
  // Client ID 자동 발급(기본). 체크를 풀면 직접 지정 입력이 나온다.
  const [autoClientId, setAutoClientId] = useState(true);

  const submit = (v: ClientFormFields) => {
    const base: ClientFormPayload = { name: v.name.trim() };
    if (showClientId && !autoClientId && v.clientId.trim()) {
      base.clientId = v.clientId.trim();
    }
    if (type === 'WEB') {
      onSubmit({
        ...base,
        origins: toLines(v.origins),
        redirectUris: toLines(v.redirectUris),
      });
    } else if (type === 'IOS') {
      onSubmit({
        ...base,
        bundleId: v.bundleId.trim(),
        teamId: v.teamId.trim() || undefined,
      });
    } else {
      onSubmit({
        ...base,
        packageName: v.packageName.trim(),
        fingerprints: toLines(v.fingerprints),
      });
    }
  };

  const nameReg = register('name', {
    required: '이름을 입력하세요.',
    pattern: {
      value: APP_NAME_RE,
      message: '영어와 하이픈(-)만 사용할 수 있습니다.',
    },
  });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <TextField
        label="이름"
        hint="영어와 하이픈(-)만 사용할 수 있습니다."
        placeholder={type === 'WEB' ? 'web' : TYPE_LABEL[type]}
        autoFocus
        error={errors.name?.message}
        {...latinRegister(nameReg)}
      />

      {showClientId && (
        <div className="rounded-lg border border-gray-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={autoClientId}
              onChange={(e) => {
                setAutoClientId(e.target.checked);
                if (e.target.checked) setValue('clientId', '');
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            Client ID 자동 발급
          </label>
          {!autoClientId && (
            <div className="mt-3">
              <TextField
                label="Client ID"
                error={errors.clientId?.message}
                {...register('clientId', {
                  pattern: {
                    value: /^[a-z0-9][a-z0-9-]{1,29}$/,
                    message:
                      '소문자·숫자·하이픈만, 2~30자, 하이픈으로 시작할 수 없습니다.',
                  },
                })}
              />
              <p className="mt-2 text-xs text-amber-600">
                ⚠️ 가능하면 <b>자동 발급</b>을 사용하세요. 직접 지정은 여러
                환경(dev·운영)에서 값을 반드시 고정해야 하는 특수한 경우에만
                권장합니다. 저장 시 <code>cl_fixed_</code> 접두사가 붙으며 생성
                후 변경할 수 없습니다.
              </p>
            </div>
          )}
        </div>
      )}

      {type === 'WEB' && (
        <>
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
        </>
      )}

      {type === 'IOS' && (
        // 짧은 값 둘이라 넓은 화면에서는 나란히 놓는다.
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Bundle ID"
            placeholder="com.example.app"
            error={errors.bundleId?.message}
            {...register('bundleId', { required: 'Bundle ID 를 입력하세요.' })}
          />
          <div>
            <TextField
              label="Team ID (선택)"
              placeholder="ABCDE12345"
              error={errors.teamId?.message}
              {...register('teamId')}
            />
            <p className="mt-1 text-xs text-gray-400">
              Universal Links(검증된 딥링크) 검증에 사용됩니다. Apple 개발자
              계정의 Team ID.
            </p>
          </div>
        </div>
      )}

      {type === 'ANDROID' && (
        <>
          <TextField
            label="패키지명"
            placeholder="com.example.app"
            error={errors.packageName?.message}
            {...register('packageName', { required: '패키지명을 입력하세요.' })}
          />
          <TextArea
            label="SHA-256 인증서 지문"
            hint="앱 서명 인증서의 SHA-256 지문. 여러 개면 한 줄에 하나."
            placeholder={'AB:CD:EF:...'}
            error={errors.fingerprints?.message}
            {...register('fingerprints')}
          />
        </>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="w-auto"
            onClick={onCancel}
          >
            취소
          </Button>
        )}
        <Button type="submit" className="w-auto" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---- AI/LLM: 업체 API 키 ----

/**
 * 앱에 물릴 LLM 업체 키(OpenAI·Anthropic 등)를 등록하는 자리.
 *
 * **아직 서버가 없다.** 자리와 설명만 먼저 세워 둔다 — 업체 키는 우리 서비스 키와 달리
 * 해시로 넣을 수 없고(우리가 대신 호출해야 하니 원문이 필요하다) 저장 방식부터
 * 정하고 붙여야 한다.
 */
function ProviderKeySection() {
  return (
    <PanelSection>
      <SectionHead
        icon={<Sparkles className="h-5 w-5" />}
        title="AI/LLM 업체 키"
        desc="OpenAI·Anthropic 같은 업체에서 발급받은 본인 키를 등록해 이 앱의 AI 기능에 씁니다."
        right={
          <Button variant="outline" className="w-auto shrink-0" disabled>
            <Plus className="h-4 w-4" /> 키 등록
          </Button>
        }
      />
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
        <p className="font-medium text-gray-500">준비 중입니다.</p>
        <p>업체 키를 등록하면 이 앱의 AI 호출이 해당 키로 나갑니다.</p>
      </div>
    </PanelSection>
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
    // 넓은 화면에서는 안내가 왼쪽, 삭제 버튼이 오른쪽 끝에 한 줄로 붙는다.
    <section className="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50/40 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <h2 className="font-bold text-red-700">위험 구역</h2>
        <p className="mt-1.5 text-sm text-gray-600">
          앱을 삭제하면 서비스 키·클라이언트가 <b>즉시 비활성화</b>되고 목록에서
          사라집니다.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 sm:self-auto"
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
            삭제하면 이 앱의 서비스 키·클라이언트가 <b>즉시 비활성화</b>되고
            목록에서 사라집니다. 확인을 위해 앱 이름 <b>{appName}</b> 을(를)
            입력하세요.
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
        rows={4}
        className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
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
