import type { H3Event } from 'h3'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

const ALLOWED_MEDIA_TYPES = ['movie', 'tv'] as const
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

// TMDB /discover로 그대로 전달할 파라미터 화이트리스트.
// (PRD §6.2 추천 로직: 기분→장르/키워드, 조건→러닝타임, 상황→하드 필터)
const PASSTHROUGH_KEYS = [
  'with_genres',
  'without_genres',
  'sort_by',
  'page',
  'vote_average.gte',
  'vote_count.gte',
  'with_runtime.gte',
  'with_runtime.lte',
  'with_keywords',
  'without_keywords',
  'language',
  'region',
] as const

/**
 * TMDB /discover 프록시.
 *
 * - TMDB_API_KEY는 .env → nuxt.config.ts의 runtimeConfig(서버 전용)에서만 읽는다.
 *   `public`이 아니므로 클라이언트 번들/응답 어디에도 키가 노출되지 않는다.
 * - 클라이언트는 이 라우트만 호출한다.
 *   예: GET /api/discover?mediaType=movie&with_genres=18,10749&with_runtime.lte=90
 * - include_adult는 항상 false로 고정한다 (클라이언트가 override 불가, PRD §8 "성인 콘텐츠 제외").
 */
export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig(event)

  if (!config.tmdbApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.',
    })
  }

  const query = getQuery(event)
  const mediaTypeParam = typeof query.mediaType === 'string' ? query.mediaType : 'movie'

  if (!ALLOWED_MEDIA_TYPES.includes(mediaTypeParam as MediaType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `mediaType은 ${ALLOWED_MEDIA_TYPES.join(' | ')} 중 하나여야 합니다.`,
    })
  }
  const mediaType = mediaTypeParam as MediaType

  const tmdbParams: Record<string, string> = {
    language: 'ko-KR',
    region: 'KR',
    sort_by: 'popularity.desc',
  }

  for (const key of PASSTHROUGH_KEYS) {
    const value = query[key]
    if (value !== undefined && value !== null && value !== '') {
      tmdbParams[key] = String(value)
    }
  }

  // 클라이언트가 무엇을 보내든 항상 강제로 고정 — 서버가 보장하는 안전 기본값.
  tmdbParams.include_adult = 'false'

  try {
    return await $fetch(`${TMDB_BASE_URL}/discover/${mediaType}`, {
      params: {
        ...tmdbParams,
        api_key: config.tmdbApiKey,
      },
    })
  }
  catch (err: any) {
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'TMDB 요청에 실패했습니다.',
    })
  }
})
