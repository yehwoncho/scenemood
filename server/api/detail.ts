import type { H3Event } from 'h3'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

/**
 * 상세 모달용 영화 정보 (PRD §6.5).
 *
 *   GET /api/detail?id=550
 *
 * 결과 카드에 이미 있는 값(제목·시놉시스·평점·러닝타임)에 더해 개봉년도와
 * 한국(region=KR) 시청 가능 플랫폼을 채워 돌려준다. providers 는 TMDB 의
 * append_to_response=watch/providers → results.KR 에서 flatrate/rent/buy 만 추린다.
 *
 * - TMDB_API_KEY 는 서버 전용(runtimeConfig). 클라이언트엔 노출되지 않는다.
 * - JustWatch 원천이라 실제 서비스 현황과 시차가 있을 수 있다 (PRD §8).
 */

interface TmdbProvider {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority?: number
}
interface TmdbDetail {
  id: number
  title?: string
  original_title?: string
  overview?: string
  poster_path?: string | null
  runtime?: number | null
  vote_average?: number
  release_date?: string
  'watch/providers'?: {
    results?: Record<string, {
      link?: string
      flatrate?: TmdbProvider[]
      rent?: TmdbProvider[]
      buy?: TmdbProvider[]
    }>
  }
}

export interface DetailProvider {
  id: number
  name: string
  logo: string | null
}
export interface DetailResponse {
  id: number
  title: string
  year: string
  runtime: number | null
  overview: string
  voteAverage: number
  posterPath: string | null
  providerLink: string | null
  providers: {
    flatrate: DetailProvider[]
    rent: DetailProvider[]
    buy: DetailProvider[]
  }
}

const mapProviders = (list: TmdbProvider[] | undefined): DetailProvider[] =>
  (list ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    }))

export default defineEventHandler(async (event: H3Event): Promise<DetailResponse> => {
  const config = useRuntimeConfig()
  if (!config.tmdbApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.',
    })
  }

  const id = Number(getQuery(event).id)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'id 는 양의 정수여야 합니다.' })
  }

  let detail: TmdbDetail
  try {
    detail = await $fetch<TmdbDetail>(`${TMDB_BASE_URL}/movie/${id}`, {
      params: {
        api_key: config.tmdbApiKey,
        language: 'ko-KR',
        append_to_response: 'watch/providers',
      },
    })
  }
  catch (err: any) {
    throw createError({
      statusCode: err?.response?.status ?? 502,
      statusMessage: 'TMDB 상세 요청에 실패했습니다.',
    })
  }

  const kr = detail['watch/providers']?.results?.KR ?? {}

  return {
    id: detail.id,
    title: detail.title || detail.original_title || '',
    year: (detail.release_date ?? '').slice(0, 4),
    runtime: detail.runtime || null,
    overview: detail.overview ?? '',
    voteAverage: detail.vote_average ?? 0,
    posterPath: detail.poster_path ?? null,
    providerLink: kr.link ?? null,
    providers: {
      flatrate: mapProviders(kr.flatrate),
      rent: mapProviders(kr.rent),
      buy: mapProviders(kr.buy),
    },
  }
})
