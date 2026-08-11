import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  prepareSocialLink,
  socialLinkUrl,
  unlinkSocial,
  type SocialProvider,
} from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { SocialBadge } from './socialIcons';

/**
 * 화면에 세울 제공자 목록. **연동되지 않은 것도 보여준다** — 무엇을 더 붙일 수 있는지가
 * 여기서 드러나야 한다. 로그인 화면의 순서와 같게 둬서 두 화면이 어긋나 보이지 않게 한다.
 */
const PROVIDERS: {
  key: SocialProvider;
  /** 서버가 쓰는 값(GOOGLE·KAKAO…). me.linkedProviders 와 대조한다. */
  code: string;
  label: string;
}[] = [
  { key: 'google', code: 'GOOGLE', label: '구글' },
  { key: 'kakao', code: 'KAKAO', label: '카카오' },
  { key: 'naver', code: 'NAVER', label: '네이버' },
  { key: 'line', code: 'LINE', label: '라인' },
];

/**
 * 해제 실패를 한국어로 바꾼다.
 *
 * **백엔드 예외 메시지는 영어다**(그 규칙을 여기서 깨지 않는다). 그대로 띄우면 사용자에게
 * 영어 문장이 나가므로, 서버가 낼 수 있는 경우를 여기서 우리말로 옮긴다. 모르는 응답은
 * 지어내지 않고 일반 문구로 떨어뜨린다.
 */
function unlinkError(e: unknown): string {
  const raw = errorMessage(e, '');
  if (raw.includes('last sign-in method')) {
    return '유일한 로그인 수단이라 해제할 수 없습니다. 다른 계정을 먼저 연동하세요.';
  }
  if (raw.includes('not linked')) {
    return '이미 해제된 연동입니다.';
  }
  return '연동을 해제하지 못했습니다.';
}

/**
 * 소셜 계정 연동 관리.
 *
 * **마지막 로그인 수단은 끊을 수 없다.** 비밀번호가 없고 연동이 하나뿐인 계정에서 그것을
 * 지우면 들어올 문이 사라진다. 서버가 거부하지만, 화면에서도 버튼을 죽이고 이유를 적는다 —
 * 눌러 보고 나서 오류로 알게 되는 것과, 왜 못 누르는지 미리 아는 것은 다르다.
 *
 * **빠져나갈 길을 둘 다 안내한다.** 소셜을 하나 더 붙이거나, 비밀번호를 설정하면 된다 —
 * 비밀번호가 없는 계정도 정보 수정에서 현재 비밀번호 없이 설정할 수 있다(로그인 상태가
 * 곧 신원 증명이다). 막힌 이유만 적고 나가는 길을 안 적으면 사용자는 멈춘다.
 *
 * **연동은 로그인과 같은 진입점을 쓴다.** GET /auth/:provider 에 link_token 만 더 실으면
 * 서버가 "로그인" 이 아니라 "이 계정에 붙이기" 로 해석한다. 그래서 provider 를 다녀오는
 * 왕복이 로그인과 똑같고, 돌아온 자리도 같은 콜백이다(linked=1).
 */
export function SocialLinkSection({
  /** 제목 줄 오른쪽에 붙는 것. 마이페이지가 "비밀번호 변경" 을 여기 건다 —
      비밀번호도 로그인 수단이라 소셜 연동과 같은 자리에서 보는 편이 낫다. */
  action,
}: {
  action?: ReactNode;
}) {
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [linkedNotice, setLinkedNotice] = useState(false);

  /*
    연동을 마치고 돌아온 참이면 **프로필을 다시 읽는다.** 목록은 캐시된 me 에서 나오는데,
    방금 늘어난 연동은 거기 없다 — 안 읽으면 연동해 놓고도 "없음" 이 그대로 보인다.
    읽고 나면 주소창의 linked 를 지운다. 새로고침할 때마다 안내가 다시 뜨면 곤란하다.
  */
  useEffect(() => {
    if (params.get('linked') !== '1') return;
    setLinkedNotice(true);
    void refreshMe().catch(() => undefined);
    const next = new URLSearchParams(params);
    next.delete('linked');
    setParams(next, { replace: true });
  }, [params, refreshMe, setParams]);

  if (!me) return null;

  const linked = new Set(me.linkedProviders);
  // 로그인할 수 있는 문이 몇 개인가. 비밀번호도 한 개로 센다.
  const methodCount = linked.size + (me.hasPassword ? 1 : 0);
  const isLastMethod = methodCount <= 1;

  const link = async (provider: SocialProvider) => {
    setError(null);
    setBusy(provider);
    try {
      const { linkToken } = await prepareSocialLink();
      window.location.href = socialLinkUrl(provider, linkToken);
    } catch (e) {
      setError(errorMessage(e, '연동을 시작하지 못했습니다.'));
      setBusy(null);
    }
  };

  const unlink = async (provider: SocialProvider) => {
    setError(null);
    setBusy(provider);
    try {
      await unlinkSocial(provider);
      // 서버가 정본이다. 목록에서 한 줄 빼는 대신 프로필을 다시 읽는다.
      await refreshMe();
    } catch (e) {
      setError(unlinkError(e));
      // 화면이 실제와 어긋나서 막혔을 수 있다(다른 탭에서 먼저 지웠다든지). 다시 맞춘다.
      await refreshMe().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">로그인 수단</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            연동하면 그 계정으로도 로그인할 수 있습니다.
          </p>
        </div>
        {action}
      </div>

      {linkedNotice && (
        <p className="mt-2 text-xs text-primary">소셜 계정을 연동했습니다.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <ul className="mt-2 divide-y divide-gray-100 rounded-lg bg-gray-50">
        {PROVIDERS.map((p) => {
          const on = linked.has(p.code);
          // 끊는 순간 들어올 문이 없어지는 경우. 서버도 같은 기준으로 거부한다.
          const blocked = on && isLastMethod;
          return (
            <li key={p.key} className="flex items-center gap-3 p-3">
              <SocialBadge provider={p.key} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900">{p.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {blocked ? (
                    <>
                      유일한 로그인 수단입니다.{' '}
                      <Link
                        to="/me/password"
                        className="text-primary hover:underline"
                      >
                        비밀번호를 설정
                      </Link>
                      하거나 다른 계정을 먼저 연동하세요.
                    </>
                  ) : on ? (
                    '연동됨'
                  ) : (
                    '연동 안 됨'
                  )}
                </p>
              </div>

              <button
                type="button"
                disabled={busy !== null || blocked}
                onClick={() => void (on ? unlink(p.key) : link(p.key))}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                  on
                    ? 'border-gray-300 text-gray-700 hover:bg-white'
                    : 'border-primary text-primary hover:bg-primary-50'
                }`}
              >
                {busy === p.key ? '처리 중…' : on ? '해제' : '연결'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
