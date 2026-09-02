export default defineNuxtConfig({
  compatibilityDate: '2026-08-26',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', '@nuxtjs/supabase'],

  tailwindcss: {
    configPath: 'tailwind.config.ts',
    // 모듈 기본 경로(assets/css/tailwind.css) 대신 우리 토큰 파일을 진입점으로 지정.
    // 여기서 등록하면 모듈이 자동으로 css 배열에 넣어주므로 별도 css: [...]는 두지 않는다
    // (둘 다 설정하면 @tailwind 디렉티브가 중복 주입된다).
    cssPath: '~/assets/css/main.css',
  },

  // 보관함(찜하기/별점) 로그인 — 이메일 매직링크. anon key 는 RLS 로 보호되는
  // 게 전제라 공개 노출이 정상이다(TMDB/Gemini 키와 달리 runtimeConfig.public).
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    // "지연 인증" — 로그인 안 해도 전 페이지 자유 열람, 찜하기/별점 누를 때만
    // 유도한다. 모듈 기본값(redirect:true)은 미로그인 시 /login 으로 강제
    // 이동시키는 전역 라우트 가드라 이 앱 흐름과 맞지 않아 끈다.
    redirect: false,

    // @nuxtjs/supabase 는 내부적으로 @supabase/ssr 를 쓴다(브라우저=createBrowserClient,
    // 서버=serverSupabaseClient=createServerClient). 세션·PKCE verifier 는 전부 쿠키에
    // 저장되므로 server/routes/auth/confirm.get.ts 가 서버에서 code 를 교환할 수 있다.
    cookieOptions: {
      // 핵심: http://localhost 개발 환경(특히 Safari)은 Secure 쿠키를 저장하지 않아
      // PKCE code-verifier 가 유실된다 → "PKCE code verifier not found in storage".
      // 배포는 HTTPS 라 Secure 유지, 개발에서만 끈다.
      secure: process.env.NODE_ENV === 'production',
    },

    clientOptions: {
      auth: {
        // 매직링크 code→세션 교환은 서버 라우트 /auth/confirm 에서 한다.
        // 브라우저 자동 교환(detectSessionInUrl)은 SSR 하이드레이션과 경쟁하고
        // 실패해도 조용해서(“로그인 안 됨” 화면만 남음) 끈다.
        detectSessionInUrl: false,
      },
    },
  },

  runtimeConfig: {
    // 서버 전용 값. `public`이 아니므로 클라이언트 번들에는 포함되지 않는다.
    //  - 로컬: .env 의 TMDB_API_KEY 를 빌드/실행 시점에 읽는다.
    //  - Vercel 등 배포: 런타임에 환경변수 `NUXT_TMDB_API_KEY` 가 이 값을 덮어쓴다
    //    (Nuxt 규칙: runtimeConfig.<key> ← NUXT_<KEY>). 빌드 없이도 반영되므로
    //    배포 환경변수는 이 이름으로 등록할 것. 아래 기본값은 빌드 시점 폴백.
    tmdbApiKey: process.env.TMDB_API_KEY || process.env.NUXT_TMDB_API_KEY || '',
    // Gemini API 키 — 리뷰 기반 AI 코멘트(server/api/review-insight.ts) 전용.
    // TMDB 키와 동일하게 서버에서만 읽고, 배포 시 NUXT_GEMINI_API_KEY 로 덮어쓴다.
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.NUXT_GEMINI_API_KEY || '',
  },
})
