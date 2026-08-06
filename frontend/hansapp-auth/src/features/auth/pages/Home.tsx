import { useEffect, useState } from 'react';
import { PORTAL_WEB_URL } from '@/shared/config/env';
import { useAuthStore } from '@/shared/auth/authStore';
import { getMyConsents, type ConsentRecord } from '@/shared/api/auth';
import { Button } from '@/shared/ui/Button';
import { AuthCard } from '../components/AuthCard';

/**
 * 마이페이지. 지금은 **열람**만 한다(정정·기기 관리·탈퇴는 다음 단계).
 *
 * **개인정보처리방침 제10조가 약속한 것을 이행하는 자리다.** 방침에 "회원은 계정 설정에서
 * 직접 열람·정정할 수 있다" 고 적어 둔 이상, 그 화면이 없으면 문서가 앞서 나간 상태가 된다.
 *
 * 동의 기록을 함께 보여주는 이유도 같다 — 서버에 `user_consent` 를 쌓아 두기만 하고 본인이
 * 볼 수 없으면 그 기록은 우리 쪽 증빙일 뿐이다. 무엇에 언제 어느 판으로 동의했는지는
 * 정보주체가 확인할 수 있어야 한다.
 */
export default function Home() {
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);

  useEffect(() => {
    // 실패해도 화면을 세우지 않는다 — 계정 정보는 이미 있고, 동의 기록은 곁들이는 것이다.
    void getMyConsents()
      .then(setConsents)
      .catch(() => setConsents([]));
  }, []);

  return (
    <AuthCard title="내 계정" subtitle="HansApp 계정 정보">
      {me && (
        <dl className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
          <Row label="이메일" value={me.email} />
          <Row label="이름" value={me.name ?? '-'} />
          <Row label="가입일" value={formatDate(me.createdAt)} />
          <Row label="가입수단" value={providerLabel(me.joinType)} />
          <Row
            label="연동된 계정"
            value={
              me.linkedProviders.length
                ? me.linkedProviders.map(providerLabel).join(', ')
                : '없음'
            }
          />
          <Row label="이메일 인증" value={me.emailVerified ? '완료' : '미완료'} />
        </dl>
      )}

      {/* 동의 기능 이전에 가입한 계정은 기록이 없다. 빈 제목만 남기지 않게 있을 때만 그린다. */}
      {consents !== null && consents.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold text-gray-900">동의 내역</h2>
          <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
            {consents.map((c) => (
              <Row
                key={`${c.type}-${c.agreedAt}`}
                label={consentLabel(c.type)}
                value={`${c.version} · ${formatDate(c.agreedAt)}`}
              />
            ))}
          </dl>
        </section>
      )}

      <div className="mt-6 space-y-2">
        {/* 미설정(로컬에서 포털을 안 띄운 경우)이면 죽은 버튼을 만들지 않고 감춘다. */}
        {PORTAL_WEB_URL && (
          <Button onClick={() => (window.location.href = PORTAL_WEB_URL)}>
            홈으로 가기
          </Button>
        )}
        <Button variant="outline" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </div>
    </AuthCard>
  );
}

/** `EMAIL`·`GOOGLE` 같은 서버 값을 사람이 읽는 말로. 모르는 값은 그대로 보여준다. */
function providerLabel(value: string): string {
  const labels: Record<string, string> = {
    EMAIL: '이메일',
    GOOGLE: '구글',
    NAVER: '네이버',
    KAKAO: '카카오',
    LINE: '라인',
  };
  return labels[value] ?? value;
}

function consentLabel(type: string): string {
  const labels: Record<string, string> = {
    TERMS: '이용약관',
    PRIVACY: '개인정보 수집·이용',
    AGE_14: '만 14세 이상',
  };
  return labels[type] ?? type;
}

/** 날짜까지만. 동의 시각을 초 단위로 보여줄 자리가 아니다. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
