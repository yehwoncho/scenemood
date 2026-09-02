import { serverSupabaseClient } from '#supabase/server'

/**
 * GET /auth/confirm — 이메일 매직링크 콜백 (서버 사이드 code 교환).
 *
 * 왜 서버 라우트인가 (Nuxt 3 SSR + PKCE 정석):
 * - @supabase/ssr 의 브라우저 클라이언트가 signInWithOtp 시점에 PKCE code-verifier 를
 *   "쿠키"로 저장한다. 매직링크 클릭 → supabase.co/auth/v1/verify → 302 로 이 라우트에
 *   `?code=<uuid>` 를 달고 최상위 이동(top-level GET)하므로, SameSite=Lax 인 그 쿠키가
 *   요청에 함께 실려 온다.
 * - 여기서 serverSupabaseClient(event)(= createServerClient) 로 요청 쿠키의 verifier 를
 *   읽어 exchangeCodeForSession 을 수행하고, 새 세션 쿠키를 응답에 Set-Cookie 로 심는다.
 * - 그 상태로 /library 에 302 → SSR 이 처음부터 로그인된 화면을 그리고, 쿠키 기반이라
 *   새로고침 후에도 세션이 유지된다. 클라이언트 하이드레이션 레이스가 없다.
 *
 * 예전 클라이언트 사이드 교환(pages/confirm.vue)은 "PKCE code verifier not found in
 * storage" 에 취약했다 — verifier 쿠키가 http://localhost 의 Secure 속성 때문에 저장이
 * 안 되거나(Safari 등), SSR 하이드레이션과 경쟁해서다. nuxt.config 의 cookieOptions.secure
 * (개발환경 false) + 이 서버 교환으로 함께 해결한다.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : undefined
  const tokenHash = typeof query.token_hash === 'string' ? query.token_hash : undefined
  const type = typeof query.type === 'string' ? query.type : 'email'
  const urlError
    = (typeof query.error_description === 'string' && query.error_description)
      || (typeof query.error === 'string' && query.error)
      || undefined

  const fail = (message: string) =>
    sendRedirect(event, `/library?auth_error=${encodeURIComponent(message)}`, 302)

  if (urlError) {
    return fail(decodeURIComponent(String(urlError)).replace(/\+/g, ' '))
  }
  if (!code && !tokenHash) {
    return fail('로그인 링크에 인증 정보가 없어요. 링크를 다시 요청해주세요.')
  }

  const supabase = await serverSupabaseClient(event)

  try {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: type as 'email' | 'magiclink' | 'signup' | 'recovery',
        })
    if (error) {
      console.error('[auth/confirm] 세션 교환 실패', error)
      return fail('로그인 링크가 만료되었거나 이미 사용됐어요. 다시 시도해주세요.')
    }
  }
  catch (err) {
    console.error('[auth/confirm] 세션 교환 예외', err)
    return fail('로그인 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.')
  }

  return sendRedirect(event, '/library', 302)
})
