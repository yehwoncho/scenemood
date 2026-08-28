import type { H3Event } from 'h3'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_MODEL = 'gemini-3.6-flash'

const ALLOWED_MEDIA_TYPES = ['movie', 'tv'] as const
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

const MAX_REVIEWS = 5
const REVIEW_CHAR_CAP = 1200 // 리뷰 1건당 프롬프트에 넣을 최대 길이 (토큰 방어)

/**
 * 성공 응답 인메모리 캐시 (TTL 6h). 같은 작품+상황+기분 조합을 다시 물어봐도
 * Gemini 를 재호출하지 않는다 — 무료 티어 분당 요청 한도(20 RPM)를 아끼는 게 핵심.
 * 서버 프로세스 단위라 재시작하면 비워진다. 프로세스 간 공유가 필요하면 KV 로 승격.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const responseCache = new Map<string, { value: ReviewInsightResponse, expires: number }>()

/**
 * 상세 모달용 "리뷰 기반 AI 추천 코멘트" (PRD §6.5 확장).
 *
 *   GET /api/review-insight?id=550&mediaType=movie&situation=alone&moods=calm,cry
 *
 * 1. TMDB 에서 작품 정보(줄거리·장르)와 관람평(reviews) 최대 5개를 가져온다.
 * 2. 리뷰가 있으면 리뷰 텍스트를, 없으면 줄거리+장르를 근거로 Gemini 에
 *    "지금 사용자의 상황·기분에 왜 잘 맞는지" 2문장 이내 한국어 추천사를 요청한다.
 * 3. 실패하면 502 로 던진다 — 클라이언트는 이 섹션을 조용히 숨기면 된다.
 *
 * - TMDB_API_KEY / GEMINI_API_KEY 는 서버 전용(runtimeConfig). 클라이언트엔 노출되지 않는다.
 * - situation / moods 는 pick 스토어 키를 그대로 받아 여기서 한국어 라벨로 바꾼다.
 */

// stores/pick.ts 의 라벨과 1:1 (사용자에게 보여준 문구 그대로 프롬프트에 넣는다)
const SITUATION_LABEL: Record<string, string> = {
  alone: '혼밥',
  bedtime: '자기 전',
  together: '함께',
}
const MOOD_LABEL: Record<string, string> = {
  cry: '울고 싶은',
  laugh: '웃고 싶은',
  numb: '아무 생각 없이',
  thrill: '심장 뛰게',
  calm: '잔잔하게',
  catharsis: '사이다',
  voyage: '낯선 세계로',
  flutter: '설레고 싶은',
}

interface TmdbGenre { id: number, name: string }
interface TmdbReview { id: string, content?: string, author?: string }
interface TmdbDetailWithReviews {
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  genres?: TmdbGenre[]
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
}

export interface ReviewInsightResponse {
  comment: string
  source: 'reviews' | 'overview'
}

function buildContextLine(situation: string, moods: string[]): string {
  const sit = SITUATION_LABEL[situation]
  const moodLabels = moods.map((m) => MOOD_LABEL[m]).filter(Boolean)
  const parts: string[] = []
  if (sit) parts.push(`"${sit}" 상황`)
  if (moodLabels.length) parts.push(`"${moodLabels.join(', ')}" 기분`)
  if (!parts.length) return '지금 이 작품을 볼까 고민 중인'
  return `지금 ${parts.join('이고 ')}인`
}

function buildReviewPrompt(title: string, reviews: string[], contextLine: string): string {
  const joined = reviews.map((r, i) => `${i + 1}. ${r}`).join('\n\n')
  return [
    `너는 영화·드라마 추천을 돕는 사람이야. 아래는 '${title}'에 대한 실제 관람평 발췌야.`,
    '',
    joined,
    '',
    `사용자는 ${contextLine} 사람이야.`,
    '',
    '이 관람평들을 바탕으로, 왜 이 작품이 지금 사용자의 상황과 기분에 잘 맞는지 한국어로 2문장 이내로 설명해줘.',
    '조건:',
    '- "리뷰에 따르면", "관람평에서는" 같은 표현이나 직접 인용은 쓰지 마.',
    '- 별점·수치·과장된 홍보 문구 없이, 친구가 자연스럽게 건네는 추천사처럼.',
    '- review-bombing 하는 티가 나지 않게 담백한 존댓말로.',
    '- 이모지·해시태그·큰따옴표 금지.',
    '설명 문장만 출력해.',
  ].join('\n')
}

function buildFallbackPrompt(title: string, overview: string, genres: string, contextLine: string): string {
  return [
    `너는 영화·드라마 추천을 돕는 사람이야. 아래는 '${title}'의 정보야.`,
    '',
    `줄거리: ${overview || '(제공된 줄거리 없음)'}`,
    `장르: ${genres || '(미상)'}`,
    '',
    `사용자는 ${contextLine} 사람이야.`,
    '',
    '이 정보를 바탕으로, 왜 이 작품이 지금 사용자의 상황과 기분에 잘 맞는지 한국어로 2문장 이내로 설명해줘.',
    '조건:',
    '- 줄거리를 그대로 요약하지 말고, 지금 이 사람에게 어떤 경험이 될지에 초점을 둬.',
    '- 별점·수치·과장된 홍보 문구 없이, 친구가 자연스럽게 건네는 추천사처럼.',
    '- 담백한 존댓말. 이모지·해시태그·큰따옴표 금지.',
    '설명 문장만 출력해.',
  ].join('\n')
}

export default defineEventHandler(async (event: H3Event): Promise<ReviewInsightResponse> => {
  const config = useRuntimeConfig(event)
  if (!config.tmdbApiKey || !config.geminiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'TMDB_API_KEY 또는 GEMINI_API_KEY 가 설정되지 않았습니다. .env 파일을 확인하세요.',
    })
  }

  const q = getQuery(event)
  const id = Number(q.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'id 는 양의 정수여야 합니다.' })
  }
  const mediaTypeParam = typeof q.mediaType === 'string' ? q.mediaType : 'movie'
  if (!ALLOWED_MEDIA_TYPES.includes(mediaTypeParam as MediaType)) {
    throw createError({ statusCode: 400, statusMessage: 'mediaType 은 movie | tv 여야 합니다.' })
  }
  const mediaType = mediaTypeParam as MediaType

  const situation = typeof q.situation === 'string' ? q.situation : ''
  const moods = (typeof q.moods === 'string' ? q.moods : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // ── 0. 캐시 조회 ──────────────────────────────────────────────────────
  const cacheKey = `${mediaType}:${id}:${situation}:${[...moods].sort().join(',')}`
  const hit = responseCache.get(cacheKey)
  if (hit && hit.expires > Date.now()) {
    return hit.value
  }

  // ── 1. TMDB — 작품 정보(ko-KR) + 리뷰(언어 무관, 대개 영어) ──────────────
  // 리뷰는 language 를 붙이면 한국어 리뷰만 걸러져 대부분 0건이 된다. 별도 호출로
  // 전체 언어 리뷰를 받는다 (프롬프트에서 "한국어로 답하라"고 강제하므로 무방).
  let detail: TmdbDetailWithReviews
  let reviewResults: TmdbReview[] = []
  try {
    const [d, rev] = await Promise.all([
      $fetch<TmdbDetailWithReviews>(`${TMDB_BASE_URL}/${mediaType}/${id}`, {
        params: { api_key: config.tmdbApiKey, language: 'ko-KR' },
      }),
      $fetch<{ results?: TmdbReview[] }>(`${TMDB_BASE_URL}/${mediaType}/${id}/reviews`, {
        params: { api_key: config.tmdbApiKey, page: '1' },
      }).catch(() => ({ results: [] as TmdbReview[] })),
    ])
    detail = d
    reviewResults = rev.results ?? []
  }
  catch (err: any) {
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'TMDB 리뷰 요청에 실패했습니다.',
    })
  }

  const title = detail.title || detail.name || detail.original_title || detail.original_name || ''
  const overview = (detail.overview ?? '').trim()
  const genres = (detail.genres ?? []).map((g) => g.name).filter(Boolean).join(', ')
  const contextLine = buildContextLine(situation, moods)

  const reviews = reviewResults
    .map((r) => (r.content ?? '').replace(/\s+/g, ' ').trim())
    .filter((c) => c.length >= 40)
    .slice(0, MAX_REVIEWS)
    .map((c) => (c.length > REVIEW_CHAR_CAP ? `${c.slice(0, REVIEW_CHAR_CAP)}…` : c))

  const source: ReviewInsightResponse['source'] = reviews.length ? 'reviews' : 'overview'
  const prompt = reviews.length
    ? buildReviewPrompt(title, reviews, contextLine)
    : buildFallbackPrompt(title, overview, genres, contextLine)

  // ── 2. Gemini — 추천 코멘트 생성 ───────────────────────────────────────
  let gemini: GeminiResponse
  try {
    gemini = await $fetch<GeminiResponse>(
      `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        query: { key: config.geminiApiKey },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            // 2문장이면 충분하지만 thinking 이 예산을 먼저 소비하므로 넉넉히.
            maxOutputTokens: 2048,
            // 짧은 추천사엔 깊은 추론이 필요 없다 — 지연을 줄이려 thinking 최소화.
            thinkingConfig: { thinkingLevel: 'low' },
            responseMimeType: 'text/plain',
          },
        },
        timeout: 20_000,
        retry: 0,
      },
    )
  }
  catch (err: any) {
    // 키가 쿼리스트링에 들어가므로 err.message(전체 URL 포함)는 로깅하지 않는다.
    console.error('[review-insight] Gemini 호출 실패', err?.response?.status ?? err?.name ?? 'unknown')
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'AI 코멘트 생성에 실패했습니다.',
    })
  }

  const raw = (gemini.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .replace(/\s+/g, ' ') // 줄바꿈·중복 공백 정리 (한 문단으로 노출)
    .trim()
    // 혹시 모델이 따옴표로 감쌌으면 벗겨낸다
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()

  if (!raw) {
    throw createError({ statusCode: 502, statusMessage: 'AI 코멘트가 비어 있습니다.' })
  }

  const result: ReviewInsightResponse = { comment: raw, source }
  responseCache.set(cacheKey, { value: result, expires: Date.now() + CACHE_TTL_MS })
  return result
})
