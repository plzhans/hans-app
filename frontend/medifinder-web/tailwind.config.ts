import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/**
 * 토큰(globals.css 의 CSS 변수)을 tailwind 이름으로 연결한다.
 *
 * `rgb(var(--x) / <alpha-value>)` 로 감싸야 `bg-surface/90` 같은 투명도가 만들어진다.
 * 변수를 그대로 넣으면(`var(--x)`) 색은 나오지만 투명도 수식(`/90`)이 통째로 무시된다 —
 * 스티키 바의 반투명 배경이 그 문법에 걸려 있어서 이걸 놓치면 바가 불투명해진다.
 */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
          기존 primary-* 스케일. 첫 화면·검색이 아직 이 이름을 쓰고 있어 남겨 둔다 —
          상세 계열은 전부 brand 로 옮겼다. 첫 화면 작업 때 함께 걷어낸다.
        */
        primary: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },

        brand: {
          DEFAULT: token('brand'),
          strong: token('brand-strong'),
          light: token('brand-light'),
          tint: token('brand-tint'),
          'tint-strong': token('brand-tint-strong'),
          wash: token('brand-wash'),
        },
        surface: {
          DEFAULT: token('surface'),
          sunken: token('surface-sunken'),
          subtle: token('surface-subtle'),
        },
        ink: {
          DEFAULT: token('ink'),
          body: token('ink-body'),
          muted: token('ink-muted'),
          subtle: token('ink-subtle'),
        },
        line: {
          DEFAULT: token('border'),
          subtle: token('border-subtle'),
        },
        danger: {
          DEFAULT: token('danger'),
          tint: token('danger-tint'),
        },
        ok: {
          DEFAULT: token('ok'),
          tint: token('ok-tint'),
        },
      },

      fontFamily: {
        /*
          Pretendard. **한국어 화면이 앱처럼 보이느냐를 가장 크게 가르는 한 가지다** —
          Noto Sans KR 은 본문 서체라 자간이 넓고 획이 균일해서, 배지·버튼처럼 작고 굵은
          글자에서 뭉툭해진다. Pretendard 는 그 자리를 노리고 만든 UI 서체이고,
          시안도 이 서체로 그려졌다.
          시스템 스택을 뒤에 두어 일본어·중국어는 기기 서체로 떨어진다(Pretendard 미수록).
        */
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
      },

      /*
        세이프에어리어. 노치·홈 인디케이터 뒤로 내용이 들어가지 않게 하는 여백이다.
        `pt-safe-top` / `pb-safe-bottom` 으로 쓴다. 브라우저에서는 값이 0 이라 아무 일도 없다
        (index.html 의 viewport-fit=cover 가 있어야 앱에서 실제 값이 들어온다).
      */
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },

      /*
        **px 이다 — rem 이 아니다.** 기준 글자 크기를 17px 로 올려 뒀는데(globals.css),
        라운드까지 rem 으로 두면 글자만 키우려던 6% 가 모서리에도 붙어 시안보다 둥글어진다.
        값은 시안에서 그대로 가져왔다.
      */
      borderRadius: {
        card: '20px', // 흰 카드
        tile: '16px', // 빠른 실행 4칸
        field: '15px', // 하단 버튼·입력칸
        box: '11px', // 아이콘 판
        chip: '10px', // 진료과목 칩
      },

      boxShadow: {
        /*
          **그림자를 두 겹으로 쌓는다.** 한 겹짜리(tailwind 기본 shadow-md)는 경계가 뚜렷해
          도장을 찍은 것처럼 보인다. 짧고 진한 겹으로 윤곽을, 길고 옅은 겹으로 깊이를 만든다.
          raised 의 긴 겹만 파란빛인 것은 흰 카드가 파란 히어로 위에 겹쳐 뜨기 때문이다 —
          회색 그림자를 쓰면 그 자리에서 때가 탄 것처럼 보인다.
        */
        card: '0 1px 2px rgb(17 24 39 / 0.05), 0 1px 3px rgb(17 24 39 / 0.05)',
        raised:
          '0 6px 20px rgb(30 99 233 / 0.08), 0 2px 6px rgb(17 24 39 / 0.05)',
        pop: '0 24px 60px rgb(21 45 84 / 0.18)',
        /* 채운 파란 버튼이 바닥에서 떠 보이게 하는 색 그림자. */
        brand: '0 10px 22px rgb(30 99 233 / 0.35)',
        'brand-sm': '0 5px 12px rgb(30 99 233 / 0.28)',
        /* 스티키 바가 본문 위로 지나갈 때 경계를 만드는 머리카락 선. */
        nav: '0 1px 0 rgb(17 24 39 / 0.06)',
      },

      screens: {
        mobile: '390px',
      },

      transitionTimingFunction: {
        /* iOS 의 기본 곡선. 뒤끝이 길어 손을 뗀 뒤에도 잠깐 따라오는 느낌이 난다. */
        native: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [typography],
};

export default config;
