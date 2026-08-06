import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    /*
      **공유 패키지도 훑어야 한다.** @hansapp/legal 은 `link:` 로 붙은 소스라 tailwind 가
      기본 glob(./src) 밖에 있다 — 빼면 그 안의 클래스가 전부 purge 되어 약관 화면이
      스타일 없는 맨 글자로 나온다. 빌드는 성공하고 콘솔도 조용해서 눈으로 봐야만 드러난다.
    */
    '../legal/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'sans-serif'],
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
