import { useCallback, useEffect, useState } from 'react';
import {
  getMySessions,
  revokeAllSessions,
  revokeSession,
  type Session,
} from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';

/**
 * 로그인한 기기 목록. **계정 이용약관 제6조④가 약속한 것을 이행하는 자리다.**
 *
 * 개인정보처리방침 제1조에 "로그인 세션에 IP 와 기기 정보를 담는다" 고 적어 둔 이상, 본인이
 * 그것을 보고 지울 수 있어야 한다. 계정이 도용됐을 때 남의 기기를 끊는 유일한 수단이기도 하다.
 *
 * **지금 이 기기는 지울 수 없게 둔다.** 여기서 자기를 끊으면 화면이 로그아웃되는데, 그건
 * "기기 관리" 가 아니라 그냥 로그아웃이다. 그 버튼은 따로 있다.
 */
export function SessionList() {
  const signOut = useAuthStore((s) => s.signOut);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 지금 처리 중인 대상. 세션 하나면 그 식별자, 전체 로그아웃이면 `'all'`. */
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  /**
   * "모든 기기에서 로그아웃" 재확인 단계인가.
   *
   * 되돌릴 수 없고 **자기 자신도 끊기는** 동작이라 한 번 더 묻는다. 탈퇴처럼 접어 두지는
   * 않는다 — 계정을 도용당한 사람이 급히 찾는 버튼이라 눈에 보여야 한다.
   */
  const [confirmingAll, setConfirmingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await getMySessions());
    } catch (e) {
      setError(errorMessage(e, '기기 목록을 불러오지 못했습니다.'));
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: number) => {
    setError(null);
    setBusy(sessionId);
    try {
      await revokeSession(sessionId);
      // 서버가 지운 뒤 다시 읽는다 — 목록에서 한 줄 빼는 것보다 실제 상태에 맞다.
      await load();
    } catch (e) {
      setError(errorMessage(e, '로그아웃시키지 못했습니다.'));
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async () => {
    setError(null);
    setBusy('all');
    try {
      await revokeAllSessions();
      /*
        서버가 세션을 다 폐기하고 쿠키도 지웠지만 **이 오리진의 저장소는 남아 있다**.
        signOut 이 토큰·프로필 캐시를 치우고 다른 탭에도 알리면, 라우터가 비로그인
        상태를 보고 로그인 화면으로 내려놓는다. 탈퇴와 같은 마무리다.
      */
      await signOut();
    } catch (e) {
      setError(errorMessage(e, '모든 기기에서 로그아웃하지 못했습니다.'));
      setBusy(null);
      setConfirmingAll(false);
    }
  };

  if (!sessions || sessions.length === 0) return null;

  return (
    /* 제목은 없다 — 이 목록은 "기기 정보" 탭 안에 들어가고, 그 이름이 곧 제목이다. */
    <section>
      <p className="text-xs text-gray-400">
        모르는 기기가 있으면 로그아웃시키고 비밀번호를 바꾸세요.
      </p>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <ul className="mt-2 divide-y divide-gray-100 rounded-lg bg-gray-50">
        {sessions.map((s) => (
          <li key={s.sessionId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-900">
                {describeDevice(s.userAgent)}
                {s.current && (
                  <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-xs font-semibold text-primary">
                    이 기기
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {[s.ip, `최근 활동 ${formatDate(s.updatedAt)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {/* 지금 이 기기는 여기서 못 끊는다(위 주석 참고). */}
            {!s.current && (
              <button
                type="button"
                disabled={busy === s.sessionId}
                onClick={() => void revoke(s.sessionId)}
                className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:opacity-50"
              >
                {busy === s.sessionId ? '처리 중…' : '로그아웃'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/*
        **하나씩 끊는 것으로 안 되는 경우가 있다.** 목록을 보는 사이에 새 세션이 생기면
        무엇을 놓쳤는지 알 수 없다. 의심스러우면 다 지우고 다시 로그인하는 편이 확실하다.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {confirmingAll ? (
          <>
            <span className="mr-auto text-xs text-gray-500">
              지금 이 기기도 로그아웃됩니다. 계속할까요?
            </span>
            <button
              type="button"
              disabled={busy === 'all'}
              onClick={() => setConfirmingAll(false)}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy === 'all'}
              onClick={() => void revokeAll()}
              className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {busy === 'all' ? '처리 중…' : '모두 로그아웃'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            className="text-xs font-semibold text-gray-500 underline transition hover:text-red-500"
          >
            모든 기기에서 로그아웃
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * User-Agent 를 사람이 읽는 한 줄로.
 *
 * **정확한 파싱을 하지 않는다.** UA 는 브라우저마다 서로를 흉내 내는 문자열이라 제대로 하려면
 * 라이브러리가 필요한데, 여기서 필요한 것은 "내 기기가 맞나" 를 알아볼 정도다. 못 알아보면
 * 원문을 그대로 보여준다 — 짐작해서 틀린 이름을 대는 것보다 낫다.
 */
function describeDevice(ua?: string | null): string {
  if (!ua) return '알 수 없는 기기';

  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;

  // 순서가 중요하다 — Edge·Chrome 은 UA 에 서로의 이름을 담는다.
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : null;

  if (os && browser) return `${browser} · ${os}`;
  return os ?? browser ?? ua;
}

/** 날짜까지만. 초 단위를 보여줄 화면이 아니다. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
