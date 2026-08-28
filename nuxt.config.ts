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
    // 서버 전용 값. `public`이 아니므로 클라이언트 번들에는 포함되지 않는다.
    //  - 로컬: .env 의 TMDB_API_KEY 를 빌드/실행 시점에 읽는다.
    //  - Vercel 등 배포: 런타임에 환경변수 `NUXT_TMDB_API_KEY` 가 이 값을 덮어쓴다
    //    (Nuxt 규칙: runtimeConfig.<key> ← NUXT_<KEY>). 빌드 없이도 반영되므로
    //    배포 환경변수는 이 이름으로 등록할 것. 아래 기본값은 빌드 시점 폴백.
    tmdbApiKey: process.env.TMDB_API_KEY || process.env.NUXT_TMDB_API_KEY || '',
  },
})
