import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, UserRound } from 'lucide-react';
import { AUTH_WEB_URL } from '@/shared/config/env';
import { displayName } from '@/shared/auth/api';
import { useAuth } from '@/shared/auth/useAuth';
import { useLangPath } from '@/shared/i18n/routing';
import { Spinner } from '@/shared/ui/Spinner';

/**
 * MediFinder 마이페이지.
 *
 * **읽기 전용이다.** 이 앱에는 백엔드가 없어 저장할 곳이 없고, 계정 정보의 주인은 HansApp
 * 계정이다 — 이름·비밀번호·소셜 연동을 고치는 자리는 거기 하나로 둔다(고치는 화면이 둘이면
 * 어느 쪽이 진짜인지 사용자가 판단해야 한다). 여기서는 **로그인한 사람이 자기 계정을
 * 확인하는 것**까지만 한다.
 *
 * 값은 로그인할 때 받아 둔 `GET /users/me` 캐시를 쓴다(useAuth). 화면에 들어올 때마다
 * 다시 부르지 않는다 — 이 화면에서 바뀌는 값이 없기 때문이다. 캐시가 비어 있을 때만 받아온다.
 */
export default function MyPage() {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const me = useAuth((s) => s.me);
  const login = useAuth((s) => s.login);
  const logout = useAuth((s) => s.logout);
  const reloadMe = useAuth((s) => s.reloadMe);
  const navigate = useNavigate();
  const path = useLangPath();

  useEffect(() => {
    if (status === 'authenticated' && !me) void reloadMe();
  }, [status, me, reloadMe]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <Page>
        <div className="rounded-2xl bg-surface p-8 text-center ring-1 ring-line">
          <p className="text-sm font-bold text-ink">{t('me.loginRequired')}</p>
          <button
            type="button"
            onClick={() => void login()}
            className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white"
          >
            {t('auth.login')}
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex items-center gap-3 px-1">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <UserRound className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-ink">
            {displayName(me) || t('auth.account')}
          </p>
          <p className="truncate text-sm text-ink-muted">{me?.email}</p>
        </div>
      </header>

      <Card title={t('me.account')}>
        <Row label={t('me.name')} value={me?.name || '—'} />
        <Row label={t('me.email')} value={me?.email} />
        <Row label={t('me.tier')} value={tierLabel(me?.tier)} />
        <Row label={t('me.joinedAt')} value={formatDate(me?.createdAt)} />
        {/* 회원번호는 맨 아래다. 사용자가 확인하러 오는 값이 아니라 문의할 때 부르는 값이다. */}
        <Row label={t('me.userId')} value={me ? `#${me.id}` : undefined} />
      </Card>

      <Card title={t('me.connection')}>
        {/* 이 앱이 어떤 계정으로 붙어 있는지. 지금 보이는 정보의 출처이기도 하다. */}
        <Row label={t('me.accountType')} value={t('me.hansappAccount')} />
        <Row
          label={t('me.linked')}
          value={
            me?.linkedProviders?.length
              ? me.linkedProviders.map(providerLabel).join(' · ')
              : t('me.linkedNone')
          }
        />
      </Card>

      <div className="space-y-2 px-1">
        {AUTH_WEB_URL && (
          <a
            href={`${AUTH_WEB_URL}/me`}
            className="block rounded-2xl bg-surface px-4 py-3 text-sm font-bold text-ink no-underline ring-1 ring-line active:bg-surface-subtle"
          >
            {t('me.manageAccount')}
            <span className="mt-0.5 block text-xs font-medium text-ink-subtle">
              {t('me.manageAccountHint')}
            </span>
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            /*
              로그아웃하면 이 화면에는 볼 것이 없다. 그대로 두면 방금까지 자기 정보가 있던
              자리에 "로그인이 필요해요" 가 뜨는데, 나가겠다고 누른 사람에게는 다시 들어오라는
              말로 읽힌다. 히스토리에도 남기지 않는다 — 뒤로가기로 그 화면에 되돌아오게 된다.
            */
            void logout().then(() => navigate(path('/'), { replace: true }));
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm font-bold text-ink ring-1 ring-line active:bg-surface-subtle"
        >
          <LogOut className="h-4 w-4" />
          {t('auth.logout')}
        </button>
        {/* 로그아웃이 무엇을 지우는지 밝힌다 — 계정까지 사라지는 것으로 오해하지 않게. */}
        <p className="px-1 text-xs text-ink-subtle">{t('me.logoutHint')}</p>
      </div>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">{children}</div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <h2 className="px-4 pb-1 pt-4 text-xs font-bold text-ink-subtle">{title}</h2>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  );
}

/** 값이 없으면 줄째로 빼지 않고 '—' 를 둔다 — 자리가 있어야 "비어 있음" 이 읽힌다. */
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right text-sm font-medium text-ink">{value || '—'}</dd>
    </div>
  );
}

/**
 * 회원 등급. **번역하지 않고 고유명사로 둔다** — 서비스마다 부르는 이름이 갈리면
 * 사용자가 문의할 때 서로 다른 말을 하게 된다(HansApp 마이페이지·관리자 콘솔도 같은 표기다).
 */
function tierLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const known: Record<string, string> = {
    BASIC: 'Basic',
    PRO: 'Pro',
    UNLIMITED: 'Unlimited',
  };
  return known[code] ?? code;
}

/** 소셜 제공자 코드를 사람이 읽는 이름으로. 모르는 값은 그대로 보여준다. */
function providerLabel(code?: string | null): string {
  if (!code) return '—';
  const known: Record<string, string> = {
    GOOGLE: 'Google',
    KAKAO: 'Kakao',
    NAVER: 'Naver',
    LINE: 'LINE',
    APPLE: 'Apple',
  };
  return known[code] ?? code;
}

/** 가입일. 시각까지는 필요 없다. */
function formatDate(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString();
}
