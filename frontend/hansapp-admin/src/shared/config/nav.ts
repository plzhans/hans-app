import { Boxes, Mail, Plug, Sparkles, Users, type LucideIcon } from 'lucide-react';

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
    // 성격이 다른 것을 한 화면에 몰지 않는다 — 메일과 연동키는 고치는 사람도 시점도 다르다.
    title: '설정',
    items: [
      { to: '/settings/mail', label: '메일', icon: Mail },
      { to: '/settings/integrations', label: '외부 연동', icon: Plug },
      { to: '/settings/llm', label: 'LLM', icon: Sparkles },
    ],
  },
];
