import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * /pick 3-STEP 플로우에서 사용자가 고른 값을 전역 보관한다.
 *   STEP 1 situation — 단일 선택 (PRD §6.3 상황별 하드 필터 키와 1:1)
 *   STEP 2 moods     — 다중 선택, 최대 3개 (PRD §6.1 기분 태그 8종)
 *   STEP 3 runtime   — 러닝타임 상한(분). 30~180, 기본 90 (PRD §6.2 조건)
 *
 * situation 값 매핑:
 *   alone    🍚 혼밥    — runtime ≤ 45분, TV 시리즈 가중치
 *   bedtime  🌙 자기 전 — 장르 27·53 제외, runtime ≤ 120
 *   together 👥 함께    — 평점 7.0↑, 인기순, 성인 콘텐츠 제외
 *
 * mood 값 매핑 (PRD §6.1):
 *   cry       😭 울고 싶어       — 장르 18·10749
 *   laugh     😂 웃고 싶어       — 장르 35
 *   numb      🤯 아무 생각 없이  — 장르 28·12
 *   thrill    💓 심장 뛰게       — 장르 53·9648
 *   calm      🌿 잔잔하게        — 장르 18 + 평점 7.0↑ + 러닝타임 120↓
 *   catharsis 🔥 사이다          — 장르 80·28 + 키워드 revenge
 *   voyage    🌌 낯선 세계로     — 장르 878·14
 *   flutter   ❤️‍🔥 설레고 싶어   — 장르 10749
 */
export type Situation = 'alone' | 'bedtime' | 'together'

export type Mood =
  | 'cry'
  | 'laugh'
  | 'numb'
  | 'thrill'
  | 'calm'
  | 'catharsis'
  | 'voyage'
  | 'flutter'

export const MAX_MOODS = 3
export const RUNTIME_MIN = 30
export const RUNTIME_MAX = 180
export const RUNTIME_DEFAULT = 90

export const usePickStore = defineStore('pick', () => {
  const situation = ref<Situation | null>(null)
  // 선택 순서를 보존한다 (FIFO). 4개째를 고르면 가장 먼저 고른 것이 빠진다.
  const moods = ref<Mood[]>([])
  const runtime = ref<number>(RUNTIME_DEFAULT)

  const moodsFull = computed(() => moods.value.length >= MAX_MOODS)

  function setSituation(value: Situation) {
    situation.value = value
  }

  /**
   * 이미 있으면 해제, 없으면 추가.
   * 이미 3개인 상태에서 새로 고르면 가장 먼저 고른 것을 자동 해제하고 추가한다.
   */
  function toggleMood(value: Mood) {
    const i = moods.value.indexOf(value)
    if (i !== -1) {
      moods.value.splice(i, 1)
      return
    }
    if (moods.value.length >= MAX_MOODS) {
      moods.value.shift()
    }
    moods.value.push(value)
  }

  function isMoodSelected(value: Mood) {
    return moods.value.includes(value)
  }

  function setRuntime(value: number) {
    const clamped = Math.min(RUNTIME_MAX, Math.max(RUNTIME_MIN, Math.round(value)))
    runtime.value = clamped
  }

  function reset() {
    situation.value = null
    moods.value = []
    runtime.value = RUNTIME_DEFAULT
  }

  return {
    situation,
    moods,
    runtime,
    moodsFull,
    setSituation,
    toggleMood,
    isMoodSelected,
    setRuntime,
    reset,
  }
})
