import { useEffect, useRef, useState } from 'react';
import { accountTermsDoc, privacyDoc, type LegalDoc } from '@hansapp/legal';
import { CONTACT_EMAIL } from '@/shared/config/contact';
import { APP_ENV, APP_RELEASE } from '@/shared/config/env';
import { getServerVersion, type BuildInfo } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { LegalModal } from '@/features/auth/components/LegalModal';

/** 인증웹의 본문 폭. 가장 넓은 화면(마이페이지)과 양끝 세로선을 맞춘다. */
const CONTAINER = 'mx-auto w-full max-w-6xl px-4 lg:px-10';

/**
 * 하단 고지. **포털(hansapp-web)의 푸터와 같은 내용이다.**
 *
 * **개인정보처리방침만 굵게 둔다.** 취향이 아니라 요건이다 — 개인정보 보호법은 처리방침을
 * 정보주체가 쉽게 확인할 수 있도록 다른 고지사항과 **구분하여** 표시하도록 요구한다.
 *
 * **포털과 다른 점 하나: 문서를 레이어로 띄운다.** 포털은 /terms·/privacy 라우트가 있지만
 * 인증웹에는 없고, 포털로 내보내면 로그인하러 온 사람이 폼을 채우다 말고 다른 도메인으로
 * 나가게 된다(로컬에서는 포털 주소가 비어 있어 링크가 아예 죽는다). 조문은 가입 화면의
 * 동의 항목과 **같은 파일**(@hansapp/legal)을 읽으므로 개정하면 함께 바뀐다.
 *
 * 사업자 정보(상호·대표·사업자등록번호) 블록은 없다. 개인이 운영하는 무료 서비스라 표시
 * 의무가 있는 항목이 아니다. 유료화하면 그때 이 자리에 생긴다.
 */
export function Footer() {
  const [opened, setOpened] = useState<LegalDoc | null>(null);

  return (
    /*
      **위쪽 여백을 주지 않는다.** App 의 껍데기가 세로 flex 이고 본문이 flex-1 이라 짧은
      화면에서도 푸터가 바닥에 붙는데, 여기에 margin 을 더하면 그만큼 화면을 넘겨
      내용이 없는데도 스크롤바가 생긴다.
    */
    <footer className="border-t border-gray-200 bg-white">
      <div className={cn(CONTAINER, 'py-6 text-xs text-gray-400')}>
        {/* 왼쪽 브랜드, 오른쪽 링크. 좁으면 링크가 다음 줄로 내려간다. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p>
            <span className="font-bold text-gray-500">HansApp</span>
            <span className="ml-2">직접 만든 서비스들을 한 곳에서</span>
          </p>

          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DocLink onOpen={() => setOpened(accountTermsDoc)}>
              이용약관
            </DocLink>
            <Dot />
            <DocLink bold onOpen={() => setOpened(privacyDoc)}>
              개인정보처리방침
            </DocLink>
          </nav>
        </div>

        {/*
          문의는 **운영 주체 옆에** 둔다. 약관 줄에 섞으면 읽는 문서들 사이에 눌러서 메일이
          열리는 것이 하나 끼어 성격이 어긋난다 — 여기는 "누가 운영하고 어디로 연락하나" 다.
        */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-gray-100 pt-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>개인이 운영하는 서비스입니다.</span>
            <span>
              문의:{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-gray-500 hover:text-gray-900"
              >
                {CONTACT_EMAIL}
              </a>
            </span>
          </p>
          <Copyright />
        </div>
      </div>

      <LegalModal doc={opened} onClose={() => setOpened(null)} />
    </footer>
  );
}

/** 문서를 여는 자리. 페이지를 옮기지 않으므로 a 가 아니라 button 이다. */
function DocLink({
  bold = false,
  onOpen,
  children,
}: {
  bold?: boolean;
  onOpen: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'underline hover:text-gray-900',
        bold ? 'font-bold text-gray-600' : 'text-gray-500',
      )}
    >
      {children}
    </button>
  );
}

/** 연속 클릭으로 인정할 간격. 이보다 뜸하면 처음부터 다시 센다. */
const REVEAL_CLICK_GAP_MS = 1500;
/** 몇 번 눌러야 열리나. */
const REVEAL_CLICKS = 5;

/**
 * 저작권 표시. **다섯 번 연달아 누르면 산출물 버전이 나온다.**
 *
 * 버전을 늘 띄워 두지 않는 건, 사용자에게는 아무 의미가 없는데 화면만 어수선해지기
 * 때문이다. 그렇다고 볼 방법이 없으면 "지금 배포된 게 뭔지"를 확인하려고 매번 개발자도구를
 * 열어야 한다 — 아는 사람만 여는 자리를 하나 둔다(포털 푸터와 같은 장치다).
 *
 * **프론트와 백엔드를 따로 적는다.** 둘은 따로 배포되므로 한 줄로 합치면 어느 쪽이 안
 * 올라갔는지 알 수 없다.
 *
 * 버튼으로 만들지 않는다. role 을 붙이는 순간 스크린 리더와 키보드 탭 순서에 "누를 수 있는
 * 것"으로 드러나서, 숨겨 둔 의미가 없어진다.
 */
function Copyright() {
  const [shown, setShown] = useState(false);
  const [server, setServer] = useState<BuildInfo | null>(null);
  const [serverFailed, setServerFailed] = useState(false);
  const clicks = useRef(0);
  const lastClickAt = useRef(0);

  /*
    **열었을 때만 부른다.** 아무도 안 여는 자리 때문에 모든 방문자가 요청을 하나 더 보낼
    이유가 없다. 한 번 받아 두면 다시 열어도 그대로 쓴다(배포 중이 아니면 안 바뀐다).
  */
  useEffect(() => {
    if (!shown || server || serverFailed) return;
    let alive = true;
    void getServerVersion()
      .then((info) => alive && setServer(info))
      // 서버가 없거나 옛 버전이라 /version 이 없을 수도 있다. 화면은 프론트만 보여준다.
      .catch(() => alive && setServerFailed(true));
    return () => {
      alive = false;
    };
  }, [shown, server, serverFailed]);

  function handleClick() {
    const now = Date.now();
    clicks.current =
      now - lastClickAt.current > REVEAL_CLICK_GAP_MS ? 1 : clicks.current + 1;
    lastClickAt.current = now;

    if (clicks.current >= REVEAL_CLICKS) {
      clicks.current = 0;
      // 다시 다섯 번 누르면 닫힌다. 한 번 연 걸 되돌릴 방법이 새로고침뿐이면 곤란하다.
      setShown((prev) => !prev);
    }
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {/*
        다섯 번 누르는 동안 글자가 블록으로 잡히면 지저분하다 — select-none 으로 막고,
        커서도 그대로 둬서 누를 수 있는 자리처럼 보이지 않게 한다.
      */}
      <span onClick={handleClick} className="cursor-default select-none">
        © {'2026'} plzhans.com
      </span>
      {shown && (
        <span className="font-mono text-gray-500">
          <span title="이 화면(인증웹) 산출물">auth v{APP_RELEASE}</span>
          {' · '}
          <span title="백엔드 산출물">
            api{' '}
            {server
              ? `v${server.version}`
              : serverFailed
                ? '확인 실패'
                : '확인 중…'}
          </span>
          {' · '}
          {APP_ENV}
        </span>
      )}
    </p>
  );
}

/** 항목 사이 구분점. 읽어 줄 내용이 없으니 스크린 리더에서는 숨긴다. */
function Dot() {
  return (
    <span aria-hidden className="text-gray-300">
      ·
    </span>
  );
}
