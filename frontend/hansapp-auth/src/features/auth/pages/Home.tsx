import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PORTAL_WEB_URL } from '@/shared/config/env';
import { useAuthStore } from '@/shared/auth/authStore';
import { getMyConsents, type ConsentRecord } from '@/shared/api/auth';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { Tabs } from '@/shared/ui/Tabs';
import { Logo } from '../components/AuthCard';
import { SessionList } from '../components/SessionList';
import { SocialLinkSection } from '../components/SocialLinkSection';
import { WithdrawSection } from '../components/WithdrawSection';

/**
 * 마이페이지. 열람·정정·기기 관리·소셜 연동·탈퇴를 한다.
 *
 * **개인정보처리방침 제10조가 약속한 것을 이행하는 자리다.** 방침에 "회원은 계정 설정에서
 * 직접 열람·정정할 수 있다" 고 적어 둔 이상, 그 화면이 없으면 문서가 앞서 나간 상태가 된다.
 *
 * 동의 기록을 함께 보여주는 이유도 같다 — 서버에 `user_consent` 를 쌓아 두기만 하고 본인이
 * 볼 수 없으면 그 기록은 우리 쪽 증빙일 뿐이다.
 *
 * **AuthCard 를 쓰지 않는다.** 로그인·가입은 한 가지 일만 하는 화면이라 좁은 카드가 맞지만,
 * 여기는 읽을 것이 여러 덩어리다 — 좁은 카드에 세로로 쌓으면 PC 에서 스크롤만 길어진다.
 * 모바일은 카드 하나, PC(lg~)는 좌우 두 단이다.
 *
 * **버튼은 모아 두지 않고 각자 다루는 것 옆에 둔다.** "계정 관리" 라는 이름의 버튼 묶음은
 * 무엇을 고치는 버튼인지 이름만 봐서는 알 수 없다 — 정보 수정은 기본 정보 옆, 비밀번호는
 * 로그인 수단 옆이다. 화면을 떠나는 둘(홈으로·로그아웃)만 머리(모바일은 맨 아래)에 둔다.
 */
export default function Home() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);

  useEffect(() => {
    // 실패해도 화면을 세우지 않는다 — 계정 정보는 이미 있고, 동의 기록은 곁들이는 것이다.
    void getMyConsents()
      .then(setConsents)
      .catch(() => setConsents([]));
  }, []);

  const leaveActions = (
    <>
      {/* 미설정(로컬에서 포털을 안 띄운 경우)이면 죽은 링크를 만들지 않고 감춘다. */}
      {PORTAL_WEB_URL && (
        <Button onClick={() => (window.location.href = PORTAL_WEB_URL)}>
          홈으로 가기
        </Button>
      )}
      <Button variant="outline" onClick={() => void signOut()}>
        로그아웃
      </Button>
    </>
  );

  return (
    <div className="flex min-h-full justify-center p-4 lg:p-10">
      <div className="w-full max-w-sm animate-fade-in lg:max-w-6xl">
        {/* 제목은 모바일에서 가운데(다른 인증 화면과 같게), PC 에서는 화면 왼쪽 어깨에 선다. */}
        <header className="mb-5 lg:mb-8 lg:flex lg:items-end lg:justify-between lg:gap-6">
          <div className="text-center lg:text-left">
            <Logo />
            <h1 className="mt-3 text-xl font-bold text-gray-900 lg:text-2xl">
              내 계정
            </h1>
            <p className="mt-1 text-sm text-gray-500 lg:text-base">
              HansApp 계정 정보
            </p>
          </div>
          {/* 나가는 버튼은 PC 에서만 여기 있다. 모바일은 화면 맨 아래(아래 lg:hidden). */}
          <div className="hidden shrink-0 gap-2 lg:flex [&_button]:w-auto [&_button]:px-5">
            {leaveActions}
          </div>
        </header>

        {/*
          **모바일은 흰 판 하나, PC 는 판 여러 개다.** 겉을 감싼 이 상자가 모바일에서 카드
          노릇을 하고(lg 부터는 배경·테두리를 벗는다), 안쪽 Panel 들이 그 반대로 lg 부터
          카드가 된다. 덕분에 모바일 모양은 예전 그대로다.

          **자리 배치는 lg 에서만 지정한다.** DOM 순서는 모바일에서 읽는 순서 그대로 두고
          (기본 정보 → 로그인 수단 → 동의 내역 → 기기 → 나가기 → 탈퇴), PC 배치는 grid 의
          행·열로만 옮긴다.
        */}
        <div
          className={cn(
            'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100',
            'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0',
          )}
        >
          <Panel className="lg:col-start-1 lg:row-start-1">
            <SectionHead
              title="기본 정보"
              action={
                // 고치는 자리는 별도 화면이다. 여기는 읽는 화면이라 보내기만 한다.
                <SectionButton onClick={() => navigate('/me/edit')}>
                  정보 수정
                </SectionButton>
              }
            />
            {me && (
              <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                <Row label="이메일" value={me.email} />
                <Row label="이름" value={me.name ?? '-'} />
                <Row label="가입일" value={formatDate(me.createdAt)} />
                <Row label="가입수단" value={providerLabel(me.joinType)} />
                <Row
                  label="이메일 인증"
                  value={me.emailVerified ? '완료' : '미완료'}
                />
              </dl>
            )}
          </Panel>

          <Panel className="mt-4 lg:col-start-1 lg:row-start-2 lg:mt-0">
            <SocialLinkSection
              action={
                // 비밀번호는 부르는 API 가 달라 화면을 나눠 뒀다. 없는 계정에는 '설정'으로 보인다.
                <SectionButton onClick={() => navigate('/me/password')}>
                  {me?.hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
                </SectionButton>
              }
            />
          </Panel>

          {/* 동의 기능 이전에 가입한 계정은 기록이 없다. 빈 제목만 남기지 않게 있을 때만 그린다. */}
          {consents !== null && consents.length > 0 && (
            <Panel className="mt-4 lg:col-start-1 lg:row-start-3 lg:mt-0">
              <SectionHead title="동의 내역" />
              <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                {consents.map((c) => (
                  <Row
                    key={`${c.type}-${c.agreedAt}`}
                    label={consentLabel(c.type)}
                    value={`${c.version} · ${formatDate(c.agreedAt)}`}
                  />
                ))}
              </dl>
            </Panel>
          )}

          {/*
            오른쪽 단은 탭이다. 지금은 기기 하나뿐이지만, 여기 붙을 것이 더 생겨도 자리가
            그대로다 — 나중에 탭을 도입하면 이미 있던 화면의 제목 자리가 통째로 바뀐다.
          */}
          <Panel className="mt-4 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:mt-0">
            <Tabs
              tabs={[
                { key: 'devices', label: '기기 정보', content: <SessionList /> },
              ]}
            />
          </Panel>

          {/* 나가는 버튼. 모바일에서는 다 읽고 난 끝자리다. */}
          <div className="mt-6 space-y-2 lg:hidden">{leaveActions}</div>

          {/* 탈퇴는 맨 아래. 계정을 보러 온 사람에게 먼저 보일 버튼이 아니다. */}
          <div className="lg:col-span-2 lg:row-start-4">
            <WithdrawSection />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 한 덩어리를 감싸는 판.
 *
 * 모바일에서는 배경을 그리지 않는다 — 바깥 카드가 이미 흰 판이라 여기서 또 그리면 판 안에
 * 판이 겹친다. lg 부터 각자 카드가 되어 화면을 나눠 쓴다.
 *
 * **속이 비면 판도 없앤다(empty:hidden).** 안에 든 것들은 보여줄 게 없으면 스스로 아무것도
 * 그리지 않는데, 그러면 빈 흰 상자만 덩그러니 남는다 — 한 단으로 쌓이던 때는 없던 문제다.
 */
function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'empty:hidden lg:rounded-2xl lg:bg-white lg:p-6 lg:shadow-sm lg:ring-1 lg:ring-gray-100',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 섹션 제목 줄. 오른쪽에 그 섹션에서 하는 일(버튼)이 붙는다. */
function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      {action}
    </div>
  );
}

/** 섹션 제목 옆의 작은 버튼. 소셜 연동의 연결/해제 버튼과 같은 치수다. */
function SectionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
    >
      {children}
    </button>
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
