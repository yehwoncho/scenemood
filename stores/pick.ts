import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * /pick 3-STEP 플로우에서 사용자가 고른 값을 전역 보관한다.
 * STEP 1(상황)만 우선 구현 — 기분/러닝타임은 다음 세션에서 이 스토어에 필드를 추가한다.
 *
 * situation 값은 PRD §6.3 상황별 하드 필터의 키와 1:1로 대응한다.
 *   alone    🍚 혼밥    — runtime ≤ 45분, TV 시리즈 가중치
 *   bedtime  🌙 자기 전 — 장르 27·53 제외, runtime ≤ 120
 *   together 👥 함께    — 평점 7.0↑, 인기순, 성인 콘텐츠 제외
 */
export type Situation = 'alone' | 'bedtime' | 'together'

export const usePickStore = defineStore('pick', () => {
  // 단일 선택 (STEP 1). 아직 안 고른 상태는 null.
  const situation = ref<Situation | null>(null)

  function setSituation(value: Situation) {
    situation.value = value
  }

  function reset() {
    situation.value = null
  }

  return { situation, setSituation, reset }
})
