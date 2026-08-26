import type { Config } from 'tailwindcss'

/**
 * DESIGN.md §6 원칙:
 * "GSAP이 제어할 속성은 Tailwind 클래스로 잡지 않는다."
 *
 * 이 설정에는 transform(x/y/scale/rotate) · opacity · clip-path 관련 유틸리티를
 * 절대 추가하지 않는다 (animation/keyframes 포함). 그 영역은 전부 GSAP이 인라인
 * 스타일로 제어한다. 이 파일이 다루는 건 레이아웃 · 색상 · 타이포 · 간격 ·
 * 반응형뿐이며, 값은 전부 assets/css/main.css의 CSS 변수를 참조해
 * 두 시스템이 같은 토큰을 공유하도록 한다.
 */
export default <Partial<Config>>{
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-hi': 'var(--surface-hi)',
        text: {
          DEFAULT: 'var(--text)',
          dim: 'var(--text-dim)',
          mute: 'var(--text-mute)',
        },
        accent: 'var(--accent)',
        line: 'var(--line)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        kr: 'var(--font-kr)',
      },
      // DESIGN.md §1 타이포 스케일
      fontSize: {
        display: [
          'clamp(48px, 8vw, 120px)',
          { lineHeight: '1.02', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        h1: [
          'clamp(32px, 4vw, 56px)',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        h2: ['24px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.6' }],
        caption: ['13px', { lineHeight: '1.4' }],
      },
      maxWidth: {
        site: 'var(--max-w)', // 1440px
      },
      spacing: {
        gutter: 'var(--gutter)', // 24px
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        base: 'var(--radius)', // 4px — 시네마틱 무드, 라운드 최소화
      },
      // 참고: transitionDuration/TimingFunction은 filter·color 같은
      // "GSAP이 다루지 않는" 얕은 CSS 트랜지션 전용이다.
      // transform/opacity 트랜지션에는 절대 쓰지 말 것 (GSAP 소유 영역).
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        inout: 'var(--ease-inout)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
    },
  },
  plugins: [],
}
