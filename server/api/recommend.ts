import type { H3Event } from 'h3'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

/**
 * /result 추천 엔드포인트 (PRD §6.2 · §6.3).
 *
 * 클라이언트(stores/result.ts)가 pick 스토어의 situation · moods[] · runtime 을
 * 그대로 넘기면, 여기서 TMDB /discover 파라미터로 조합한다. 매핑·하드 필터·
 * 가중 정렬은 전부 서버에서 끝내고, 클라이언트에는 화면에 필요한 필드만 담은
 * 30편 풀을 돌려준다.
 *
 *   GET /api/recommend?situation=bedtime&moods=calm,cry&runtime=90&page=1
 *
 * - page 는 "풀 페이지" 다. 풀 1페이지 = TMDB 2페이지(40편) → 가중 정렬 후 상위 30.
 *   재추천으로 풀이 소진되면 클라이언트가 page+1 로 다시 부른다 (PRD §6.2 마지막 줄).
 * - TMDB_API_KEY 는 서버 전용(runtimeConfig). 클라이언트엔 노출되지 않는다.
 */

const POOL_SIZE = 30
const TMDB_PAGES_PER_POOL = 2 // 풀 1페이지가 소비하는 TMDB 페이지 수 (20편 × 2 = 40편)

// PRD §6.1 기분 태그 8종 → TMDB 장르 ID
const MOOD_GENRES: Record<string, number[]> = {
  cry: [18, 10749], // 드라마 · 로맨스
  laugh: [35], // 코미디
  numb: [28, 12], // 액션 · 모험
  thrill: [53, 9648], // 스릴러 · 미스터리
  calm: [18], // 드라마 (+ 평점 7.0↑ · 러닝타임 120↓ — 아래 특수 규칙)
  catharsis: [80, 28], // 범죄 · 액션 (+ 키워드 revenge)
  voyage: [878, 14], // SF · 판타지
  flutter: [10749], // 로맨스
}

const REVENGE_KEYWORD_ID = 9748 // TMDB 키워드 'revenge' — 사이다(catharsis) 보강
const CALM_MAX_RUNTIME = 120
const CALM_MIN_RATING = 7.0

// PRD §6.3 상황별 하드 필터
interface SituationFilter {
  runtimeCap?: number
  withoutGenres?: number[]
  minRating?: number
}
const SITUATION_FILTERS: Record<string, SituationFilter> = {
  // 혼밥 — 짧은 러닝타임. (TV 시리즈 가중치는 Phase 2, 지금은 영화만 다룬다)
  alone: { runtimeCap: 45 },
  // 자기 전 — 공포(27) · 스릴러(53) 제외, 2시간 이하
  bedtime: { runtimeCap: 120, withoutGenres: [27, 53] },
  // 함께 — 대중적 평점 7.0↑ (성인 콘텐츠 제외는 아래에서 항상 강제)
  together: { minRating: 7.0 },
}

const RUNTIME_MIN = 30
const RUNTIME_MAX = 180
const RUNTIME_DEFAULT = 90
const MAX_MOODS = 3

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const asString = (v: unknown): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : ''

interface TmdbMovie {
  id: number
  title?: string
  overview?: string
  poster_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
}
interface TmdbDiscoverResponse {
  page: number
  total_pages: number
  results: TmdbMovie[]
}

export interface RecommendItem {
  id: number
  poster_path: string | null
  title: string
  overview: string
  runtime: number | null
  vote_average: number
}
export interface RecommendResponse {
  page: number
  hasMore: boolean
  results: RecommendItem[]
}

export default defineEventHandler(async (event: H3Event): Promise<RecommendResponse> => {
  const config = useRuntimeConfig()
  if (!config.tmdbApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.',
    })
  }
  const apiKey = config.tmdbApiKey

  const q = getQuery(event)
  const runtime = clamp(Number(asString(q.runtime)) || RUNTIME_DEFAULT, RUNTIME_MIN, RUNTIME_MAX)
  const poolPage = Math.max(1, Math.floor(Number(asString(q.page)) || 1))
  const situation = asString(q.situation)
  const moods = asString(q.moods)
    .split(',')
    .map((s) => s.trim())
    .filter((m) => m in MOOD_GENRES)
    .slice(0, MAX_MOODS)

  const sf = SITUATION_FILTERS[situation]

  // 2. 기분 → 장르 (최대 3개, OR 결합 = 콤마). PRD §6.1
  const genreSet = new Set<number>()
  for (const m of moods) {
    for (const g of MOOD_GENRES[m]) genreSet.add(g)
  }

  // 1 + 3. 러닝타임 상한 — STEP 3 값 vs 상황 하드 필터 vs 잔잔함 규칙 중 가장 엄격한(작은) 값
  let runtimeCap = runtime
  if (sf?.runtimeCap) runtimeCap = Math.min(runtimeCap, sf.runtimeCap)
  if (moods.includes('calm')) runtimeCap = Math.min(runtimeCap, CALM_MAX_RUNTIME)

  // 평점 하한 — 상황(함께) vs 잔잔함 중 높은 값
  let minRating = 0
  if (sf?.minRating) minRating = Math.max(minRating, sf.minRating)
  if (moods.includes('calm')) minRating = Math.max(minRating, CALM_MIN_RATING)

  const withoutGenres = sf?.withoutGenres ?? []
  const withKeywords = moods.includes('catharsis') ? String(REVENGE_KEYWORD_ID) : ''

  const baseParams: Record<string, string> = {
    api_key: apiKey,
    language: 'ko-KR',
    region: 'KR',
    include_adult: 'false', // PRD §8 — 클라이언트가 무엇을 보내든 항상 고정
    sort_by: 'popularity.desc',
    'vote_count.gte': '100', // 표본 없는 고평점·단편 노이즈 제거
    // TMDB /discover 의 with_runtime 은 runtime 미상(0) 항목을 걸러주지 못해
    // 신뢰할 수 없다. 여기선 힌트로만 넣고, 실제 상한 적용은 상세에서 받은
    // runtime 으로 아래에서 다시 필터한다.
    'with_runtime.gte': '1',
    'with_runtime.lte': String(runtimeCap),
  }
  if (genreSet.size) baseParams.with_genres = [...genreSet].join(',')
  if (withoutGenres.length) baseParams.without_genres = withoutGenres.join(',')
  if (minRating > 0) baseParams['vote_average.gte'] = String(minRating)
  if (withKeywords) baseParams.with_keywords = withKeywords

  // 4. /discover 호출 — 풀 페이지가 소비하는 TMDB 페이지 2개를 병렬로
  const startPage = (poolPage - 1) * TMDB_PAGES_PER_POOL + 1
  const pageNums = Array.from({ length: TMDB_PAGES_PER_POOL }, (_, i) => startPage + i)

  let responses: TmdbDiscoverResponse[]
  try {
    responses = await Promise.all(
      pageNums.map((p) =>
        $fetch<TmdbDiscoverResponse>(`${TMDB_BASE_URL}/discover/movie`, {
          params: { ...baseParams, page: String(p) },
        }),
      ),
    )
  }
  catch (err: any) {
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'TMDB 요청에 실패했습니다.',
    })
  }

  const totalPages = responses[0]?.total_pages ?? 1
  const hasMore = startPage + TMDB_PAGES_PER_POOL <= totalPages

  // id 중복 제거 + poster_path 있는 것만
  const seen = new Set<number>()
  const merged: TmdbMovie[] = []
  for (const r of responses) {
    for (const m of r.results ?? []) {
      if (!m.poster_path || seen.has(m.id)) continue
      seen.add(m.id)
      merged.push(m)
    }
  }

  // 5. 정렬 — 평점 × 인기도 가중 (PRD §6.2)
  const score = (m: TmdbMovie) =>
    (m.vote_average ?? 0) * Math.log10(Math.max(m.popularity ?? 0, 1) + 10)
  merged.sort((a, b) => score(b) - score(a))

  // runtime 은 /discover 응답에 없어 상세에서 채운다 (후보 전체, 병렬).
  // 받은 runtime 으로 상한을 실제 적용하고 — 실패해 runtime 을 모르는 항목은
  // 살려 둔다 (화면엔 "러닝타임 이하" 칩만 붙으므로 오차 허용).
  const details = await Promise.allSettled(
    merged.map((m) =>
      $fetch<{ runtime?: number | null }>(`${TMDB_BASE_URL}/movie/${m.id}`, {
        params: { api_key: apiKey, language: 'ko-KR' },
      }),
    ),
  )

  const withRuntime: RecommendItem[] = merged.map((m, i) => {
    const d = details[i]
    return {
      id: m.id,
      poster_path: m.poster_path ?? null,
      title: m.title ?? '',
      overview: m.overview ?? '',
      runtime: d.status === 'fulfilled' ? (d.value.runtime ?? null) : null,
      vote_average: m.vote_average ?? 0,
    }
  })

  const passed = withRuntime.filter((r) => r.runtime == null || r.runtime <= runtimeCap)
  // 상한이 너무 빡빡해 3편도 못 남으면 상한 필터를 포기하고 가중 상위로 채운다.
  const results = (passed.length >= 3 ? passed : withRuntime).slice(0, POOL_SIZE)

  return { page: poolPage, hasMore, results }
})
