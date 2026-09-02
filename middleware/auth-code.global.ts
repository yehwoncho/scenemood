/**
 * 안전망 — 매직링크가 예전 경로(/library?code=, /confirm?code=)로 돌아와도
 * 서버 콜백 라우트 /auth/confirm 으로 넘겨 code 를 교환하게 한다.
 *
 * 신규 이메일은 emailRedirectTo 가 이미 /auth/confirm 이라 이 미들웨어를 안 탄다
 * (/auth/confirm 은 Nitro 서버 라우트 — Nuxt 앱 라우터를 거치지 않음).
 * 이 미들웨어는 이미 발송된 구 링크만 처리한다. external:true 로 전체 새로고침
 * 이동을 해야 Nitro 라우트에 실제로 도달한다.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/auth/')) return

  const hasToken = Boolean(to.query.code || to.query.token_hash)
  const hasError = Boolean(to.query.error || to.query.error_description)
  if (!hasToken && !hasError) return

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(to.query)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach(v => v != null && params.append(key, String(v)))
    else params.append(key, String(value))
  }
  const qs = params.toString()

  return navigateTo(`/auth/confirm${qs ? `?${qs}` : ''}`, { external: true, redirectCode: 302 })
})
