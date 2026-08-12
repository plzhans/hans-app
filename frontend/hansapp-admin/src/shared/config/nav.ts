import {
  Boxes,
  MessageSquareText,
  KeyRound,
  Mail,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  /** 구분선 위에 붙는 작은 제목. 없으면 제목 없이 항목만 그린다. */
  title?: string;
  items: NavItem[];
}

/**
 * 사이드바 메뉴.
 *
 * **화면이 있는 것만 넣는다.** 메뉴에 있는데 눌러도 아무 일이 없으면 "고장난 것" 으로
 * 읽힌다 — 준비 중인 기능은 만들고 나서 여기 더한다.
 *
 * 구역(NavSection)으로 나눠 둔 것은 지금 필요해서가 아니라, 메뉴가 늘 때 이 파일만
 * 고치면 되게 하려는 것이다. 항목이 적을 때는 제목을 생략한다.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/users', label: '회원', icon: Users },
      { to: '/apps', label: '앱', icon: Boxes },
    ],
  },
  {
    // 커뮤니티. 지금은 게시판 하나뿐이고, 글 관리 화면이 생기면 여기 붙는다.
    title: '커뮤니티',
    items: [{ to: '/boards', label: '게시판', icon: MessageSquareText }],
  },
  {
    /*
      **읽는 화면들의 자리다.** 설정이 값을 고치는 곳이라면 여기는 쌓인 것을 들여다보는
      곳이다 — `설정 > LLM`(키·모델을 고친다)과 `로그 > LLM 사용`(호출을 본다)이 이름은
      겹쳐도 하는 일이 반대라, 같은 구역에 두면 매번 어느 쪽인지 헷갈린다.

      **여기 있는 것은 전부 "대상을 안 가리고 기간으로 훑는" 화면이다.** 회원 한 명의
      기록은 여기가 아니라 그 회원 상세의 탭이다 — 둘은 조회 방향도 인덱스도 다르다.
      서비스 행위 로그(좋아요·조회)가 생기면 그것도 여기 붙는다.
    */
    title: '로그',
    items: [
      { to: '/logs/auth', label: '인증', icon: KeyRound },
      { to: '/logs/llm', label: 'LLM 사용', icon: ScrollText },
    ],
  },
  {
    // 성격이 다른 것을 한 화면에 몰지 않는다 — 메일과 연동키는 고치는 사람도 시점도 다르다.
    title: '설정',
    items: [
      { to: '/settings/mail', label: '메일', icon: Mail },
      { to: '/settings/integrations', label: '외부 연동', icon: Plug },
      { to: '/settings/llm', label: 'LLM', icon: Sparkles },
    ],
  },
  {
    /*
      **콘솔 자신을 다루는 자리다.** 회원·앱이 서비스를 들여다보는 화면이라면 여기는
      "이 콘솔에 누가 들어올 수 있는가" 다 — 설정 구역에 섞으면 값을 고치는 화면들 사이에
      계정 삭제가 끼어 성격이 흐려진다.
    */
    title: '콘솔',
    items: [{ to: '/admins', label: '관리자', icon: ShieldCheck }],
  },
];
