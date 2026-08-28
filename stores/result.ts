import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePickStore } from '~/stores/pick'

/**
 * /result — 추천 풀과 현재 노출 중인 3편을 보관한다 (PRD §6.2).
 *
 *   loadPool()  최초 진입 시 1회. /api/recommend 로 30편 풀 확보 → 셔플 → 첫 3편.
 *   drawThree() 풀에서 다음 3편. "재추천" 이 부르는 함수 —
 *               풀에 3편 이상 남아 있으면 API 재호출 없이 커서만 전진하고,
 *               소진됐을 때만 page+1 로 재호출해 이어붙인다. 그마저 없으면 순환.
 *
 * pick 스토어(situation · moods[] · runtime)를 그대로 쿼리로 넘긴다.
 */

export interface PoolItem {
  id: number
  poster_path: string | null
  title: string
  overview: string
  runtime: number | null
  vote_average: number
}

interface RecommendResponse {
  page: number
  hasMore: boolean
  moodsUsed: string[]
  relaxed: boolean
  results: PoolItem[]
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const useResultStore = defineStore('result', () => {
  const pool = ref<PoolItem[]>([])
  const currentThree = ref<PoolItem[]>([])
  const cursor = ref(0) // 다음에 뽑을 pool 인덱스
  const poolPage = ref(1) // 마지막으로 받은 풀 페이지
  const hasMore = ref(false) // 서버에 더 받을 페이지가 있는지
  const status = ref<Status>('idle')
  const errorMessage = ref('')
  // 조건이 좁아 서버가 기분 태그를 완화했을 때 실제 반영된 기분. 결과 카드 칩에 쓴다.
  const moodsUsed = ref<string[]>([])
  const relaxed = ref(false)

  async function requestPool(page: number): Promise<RecommendResponse> {
    const pick = usePickStore()
    return await $fetch<RecommendResponse>('/api/recommend', {
      params: {
        situation: pick.situation ?? '',
        moods: pick.moods.join(','),
        runtime: pick.runtime,
        page,
      },
    })
  }

  async function loadPool() {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      const res = await requestPool(1)
      pool.value = shuffle(res.results)
      poolPage.value = res.page
      hasMore.value = res.hasMore
      moodsUsed.value = res.moodsUsed
      relaxed.value = res.relaxed
      cursor.value = 0
      if (pool.value.length === 0) {
        status.value = 'error'
        errorMessage.value = '조건에 맞는 작품을 찾지 못했어요. 조건을 바꿔볼까요?'
        return
      }
      await drawThree()
      status.value = 'ready'
    }
    catch (err: any) {
      status.value = 'error'
      errorMessage.value
        = err?.data?.statusMessage || err?.statusMessage || '추천을 불러오지 못했어요.'
    }
  }

  async function drawThree() {
    // 남은 게 3편 미만이면 — 더 받을 수 있을 때만 다음 페이지를 이어붙인다.
    if (cursor.value + 3 > pool.value.length && hasMore.value) {
      try {
        const res = await requestPool(poolPage.value + 1)
        poolPage.value = res.page
        hasMore.value = res.hasMore
        const known = new Set(pool.value.map((p) => p.id))
        pool.value = [...pool.value, ...shuffle(res.results.filter((r) => !known.has(r.id)))]
      }
      catch {
        // 이어받기 실패 — 아래 순환 로직으로 폴백
      }
    }

    // 그래도 부족하면 풀을 다시 섞어 처음부터 순환한다.
    if (cursor.value + 3 > pool.value.length) {
      pool.value = shuffle(pool.value)
      cursor.value = 0
    }

    currentThree.value = pool.value.slice(cursor.value, cursor.value + 3)
    cursor.value += 3
  }

  function reset() {
    pool.value = []
    currentThree.value = []
    cursor.value = 0
    poolPage.value = 1
    hasMore.value = false
    moodsUsed.value = []
    relaxed.value = false
    status.value = 'idle'
    errorMessage.value = ''
  }

  return {
    pool,
    currentThree,
    status,
    errorMessage,
    hasMore,
    moodsUsed,
    relaxed,
    loadPool,
    drawThree,
    reset,
  }
})
