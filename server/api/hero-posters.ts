import type { H3Event } from 'h3'
import { HERO_POSTERS } from '~/data/heroPosters'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

interface HeroPosterResult {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  poster_path: string
}

/**
 * 히어로 클러스터용 고정 포스터 조회.
 *
 * data/heroPosters.ts 의 큐레이션 목록(id + mediaType)을 받아 TMDB 상세에서
 * poster_path 와 제목만 뽑아 돌려준다. 랜덤 요소 없음 — 목록이 곧 화면이다.
 *
 * - TMDB_API_KEY 는 서버 전용(runtimeConfig). 클라이언트엔 노출되지 않는다.
 * - 개별 항목이 실패하거나 poster_path 가 없으면 조용히 제외한다 (일부 id 가
 *   잘못돼도 나머지로 화면은 채워진다). 배치 로직이 N 장에 대응한다.
 * - 목록이 완전 고정이므로 1시간 캐시 (쿼리 없음 → 단일 캐시 엔트리).
 */
export default defineCachedEventHandler(async (event: H3Event): Promise<HeroPosterResult[]> => {
  const config = useRuntimeConfig()

  if (!config.tmdbApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.',
    })
  }

  const settled = await Promise.allSettled(
    HERO_POSTERS.map(async (ref) => {
      const detail = await $fetch<{ poster_path?: string | null, title?: string, name?: string }>(
        `${TMDB_BASE_URL}/${ref.mediaType}/${ref.id}`,
        { params: { api_key: config.tmdbApiKey, language: 'ko-KR' } },
      )
      return {
        id: ref.id,
        mediaType: ref.mediaType,
        title: detail.title ?? detail.name ?? '',
        poster_path: detail.poster_path ?? '',
      }
    }),
  )

  const posters = settled
    .filter((r): r is PromiseFulfilledResult<HeroPosterResult> =>
      r.status === 'fulfilled' && !!r.value.poster_path)
    .map((r) => r.value)

  if (posters.length === 0) {
    throw createError({ statusCode: 502, statusMessage: 'TMDB 포스터 조회에 모두 실패했습니다.' })
  }

  return posters
}, {
  maxAge: 60 * 60,
  name: 'hero-posters',
  // 캐시 키에 목록 시그니처를 넣어, data/heroPosters.ts 를 편집하면 즉시 새로 조회되게 한다
  // (안 그러면 목록을 바꿔도 maxAge 동안 옛 응답이 나온다).
  getKey: () => `v${HERO_POSTERS.length}-${HERO_POSTERS.reduce((sum, p) => sum + p.id, 0)}`,
})
