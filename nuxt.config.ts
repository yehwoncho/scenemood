export default defineNuxtConfig({
  compatibilityDate: '2026-08-26',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  tailwindcss: {
    configPath: 'tailwind.config.ts',
    // 모듈 기본 경로(assets/css/tailwind.css) 대신 우리 토큰 파일을 진입점으로 지정.
    // 여기서 등록하면 모듈이 자동으로 css 배열에 넣어주므로 별도 css: [...]는 두지 않는다
    // (둘 다 설정하면 @tailwind 디렉티브가 중복 주입된다).
    cssPath: '~/assets/css/main.css',
  },

  runtimeConfig: {
    // 서버 전용 값. .env의 TMDB_API_KEY가 매핑되며, `public`이 아니므로
    // 클라이언트 번들에는 절대 포함되지 않는다. (server/api/discover.ts에서만 사용)
    tmdbApiKey: process.env.TMDB_API_KEY,
  },
})
