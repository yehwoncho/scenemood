<script setup lang="ts">
/**
 * /pick — 선택 플로우 (3-STEP). STEP 1 상황 · STEP 2 기분 · STEP 3 조건.
 *
 * - 스텝 상태는 라우팅이 아니라 ?step= 쿼리로만 관리한다 (PRD §5, DESIGN §2.5).
 *   뒤로가기·새로고침 대응: step 은 route.query 파생값이고, 변경을 watch 해서
 *   gather-in 을 다시 태운다.
 * - 카드 타이포 위계는 DESIGN §2.9 (A24): eyebrow → 대형 볼드 타이틀 → 설명.
 * - 역할 분리 (DESIGN §6):
 *     Tailwind/CSS → 레이아웃·색상·타이포·간격, 그리고 border-color / background 트랜지션.
 *     GSAP        → transform(x/y/scale)·opacity 만. 스텝 전환(scatter/gather) 담당.
 *     카드 호버 translateY 는 Tailwind 에 transform 유틸이 없으므로 <style> 의
 *     순수 CSS :hover 로 처리한다 (GSAP 이 건드리는 엘리먼트와 분리).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import gsap from 'gsap'
import {
  usePickStore,
  RUNTIME_MIN,
  RUNTIME_MAX,
  MAX_MOODS,
  type Situation,
  type Mood,
} from '~/stores/pick'

const route = useRoute()
const router = useRouter()
const pick = usePickStore()

const TOTAL_STEPS = 3

// ?step= → 1..3 로 정규화. 범위 밖/누락이면 1.
const step = computed(() => {
  const n = Number(route.query.step)
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_STEPS ? n : 1
})
const pad2 = (n: number) => String(n).padStart(2, '0')

/* ────────────────────────────── STEP 1 · 상황 ────────────────────────────── */

interface SituationCard {
  value: Situation
  eyebrow: string
  title: string
  description: string
}

// PRD §6.3 상황 3종. eyebrow 는 DESIGN §2.9 "SITUATION 0N" 포맷.
const situations: SituationCard[] = [
  { value: 'alone', eyebrow: 'SITUATION 01', title: '혼밥', description: '20~45분, 가볍게 보기 좋은 한 편' },
  { value: 'bedtime', eyebrow: 'SITUATION 02', title: '자기 전', description: '자극 없이, 두 시간 안에 끝나는' },
  { value: 'together', eyebrow: 'SITUATION 03', title: '함께', description: '실패 없는 선택, 다 같이 봐도 좋은' },
]

/* ────────────────────────────── STEP 2 · 기분 ────────────────────────────── */

interface MoodCard {
  value: Mood
  eyebrow: string
  emoji: string
  title: string
  description: string
}

// PRD §6.1 기분 태그 8종. 4×2 그리드에 정확히 떨어진다.
const moods: MoodCard[] = [
  { value: 'cry', eyebrow: 'MOOD 01', emoji: '😭', title: '울고 싶어', description: '드라마·로맨스, 마음껏 울 수 있는' },
  { value: 'laugh', eyebrow: 'MOOD 02', emoji: '😂', title: '웃고 싶어', description: '코미디, 실없이 웃긴 한 편' },
  { value: 'numb', eyebrow: 'MOOD 03', emoji: '🤯', title: '아무 생각 없이', description: '액션·모험, 머리 비우고 보는' },
  { value: 'thrill', eyebrow: 'MOOD 04', emoji: '💓', title: '심장 뛰게', description: '스릴러·미스터리, 긴장의 연속' },
  { value: 'calm', eyebrow: 'MOOD 05', emoji: '🌿', title: '잔잔하게', description: '평점 높은 드라마, 120분 이하' },
  { value: 'catharsis', eyebrow: 'MOOD 06', emoji: '🔥', title: '사이다', description: '범죄·복수극, 통쾌하게' },
  { value: 'voyage', eyebrow: 'MOOD 07', emoji: '🌌', title: '낯선 세계로', description: 'SF·판타지, 여기가 아닌 어딘가' },
  { value: 'flutter', eyebrow: 'MOOD 08', emoji: '❤️‍🔥', title: '설레고 싶어', description: '로맨스, 설렘이 필요한 밤' },
]

/* ────────────────────────────── STEP 3 · 조건 ────────────────────────────── */

// 슬라이더 채움 비율 (%) — CSS 변수로 넘겨 트랙 그라디언트에 사용.
const runtimePct = computed(
  () => ((pick.runtime - RUNTIME_MIN) / (RUNTIME_MAX - RUNTIME_MIN)) * 100,
)

function onRuntimeInput(e: Event) {
  pick.setRuntime(Number((e.target as HTMLInputElement).value))
}

/* ──────────────────────────── 스텝 전환 (DESIGN §2.5) ─────────────────────── */

const mounted = ref(false)
const isTransitioning = ref(false)

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 현재 스텝의 애니메이션 대상. v-if 로 한 스텝만 렌더되므로 전역 셀렉터로 충분.
function stepEls() {
  return gsap.utils.toArray<HTMLElement>('.js-step-el')
}

// gather in: 중앙에서 모임 (scale 0.9 → 1, opacity 0 → 1, stagger 0.05)
function gatherIn() {
  const els = stepEls()
  if (!els.length) return
  if (prefersReducedMotion()) {
    gsap.set(els, { clearProps: 'all' })
    return
  }
  gsap.fromTo(
    els,
    { opacity: 0, scale: 0.9 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.05,
      clearProps: 'all', // 끝나면 인라인 transform/opacity 제거 → CSS :hover 가 온전히 인계
    },
  )
}

// scatter out: 흩어지며 사라짐 (랜덤 x/y ±60, opacity 0, stagger 0.03) 후 콜백.
function scatterOut(done: () => void) {
  const els = stepEls()
  if (prefersReducedMotion() || !els.length) {
    done()
    return
  }
  gsap.to(els, {
    x: () => gsap.utils.random(-60, 60),
    y: () => gsap.utils.random(-60, 60),
    opacity: 0,
    duration: 0.5,
    ease: 'power3.in',
    stagger: 0.03,
    onComplete: done,
  })
}

function goToStep(next: number) {
  if (isTransitioning.value) return
  if (next < 1 || next > TOTAL_STEPS) return
  if (next === 3 && pick.moods.length === 0) return // 기분 없이 조건 설정으로 못 감
  isTransitioning.value = true // 전환 중 클릭 잠금 (중복 트리거 방지)
  scatterOut(() => {
    router.push({ query: { ...route.query, step: String(next) } })
    isTransitioning.value = false
  })
}

// 기분 0개면 STEP 3 진입·결과 보기를 막는다 (직접 URL·뒤로가기로 도달한 경우까지).
const noMoods = computed(() => pick.moods.length === 0)

function goToResult() {
  if (isTransitioning.value || noMoods.value) return
  isTransitioning.value = true
  scatterOut(() => {
    router.push('/result')
  })
}

function selectSituation(card: SituationCard) {
  if (isTransitioning.value) return
  pick.setSituation(card.value)
  goToStep(2)
}

function toggleMood(card: MoodCard) {
  if (isTransitioning.value) return
  pick.toggleMood(card.value)
}

// 스텝이 바뀔 때마다(선택·뒤로가기·직접 URL) 새 스텝 요소를 gather in.
// 좌하단 인디케이터 숫자도 짧게 크로스페이드.
watch(step, async () => {
  await nextTick()
  gatherIn()
  if (!prefersReducedMotion()) {
    gsap.fromTo(
      '.js-step-indicator',
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power2.out' },
    )
  }
})

onMounted(() => {
  mounted.value = true
  gatherIn()
})

onUnmounted(() => {
  gsap.killTweensOf('.js-step-el')
  gsap.killTweensOf('.js-step-indicator')
})
</script>

<template>
  <main
    class="pick-root relative flex min-h-screen flex-col justify-center bg-bg px-gutter py-24"
    :class="{ 'pick-root--ready': mounted, 'pick-root--locked': isTransitioning }"
  >
    <div class="mx-auto w-full max-w-site">
      <!-- ─────────────────── STEP 1 — 상황 선택 ─────────────────── -->
      <section v-if="step === 1">
        <h1 class="js-step-el max-w-[16ch] text-h1 text-text">
          지금, 어떤 상황이에요?
        </h1>

        <div class="mt-12 grid gap-4 md:mt-16 md:grid-cols-3">
          <button
            v-for="card in situations"
            :key="card.value"
            type="button"
            class="js-step-el block w-full text-left"
            :disabled="isTransitioning"
            @click="selectSituation(card)"
          >
            <article
              class="pick-card flex min-h-[260px] flex-col justify-between border border-line bg-surface p-6 md:min-h-[440px] md:p-8"
              :class="{ 'pick-card--selected': pick.situation === card.value }"
            >
              <span class="pick-card__eyebrow">{{ card.eyebrow }}</span>
              <div>
                <h2 class="pick-card__title">{{ card.title }}</h2>
                <p class="mt-3 text-[14px] leading-relaxed text-text-dim">{{ card.description }}</p>
              </div>
            </article>
          </button>
        </div>
      </section>

      <!-- ─────────────────── STEP 2 — 기분 선택 ─────────────────── -->
      <section v-else-if="step === 2">
        <h1 class="js-step-el max-w-[20ch] text-h1 text-text">
          어떤 기분이 필요해요?
        </h1>
        <p class="js-step-el mt-3 text-[14px] text-text-dim">
          최대 {{ MAX_MOODS }}개까지 · 지금 {{ pick.moods.length }}개 선택
        </p>

        <div class="mt-10 grid grid-cols-2 gap-4 md:mt-14 md:grid-cols-4">
          <button
            v-for="card in moods"
            :key="card.value"
            type="button"
            class="js-step-el block w-full text-left"
            :disabled="isTransitioning"
            @click="toggleMood(card)"
          >
            <article
              class="pick-card flex min-h-[168px] flex-col justify-between border border-line bg-surface p-5 md:min-h-[212px] md:p-6"
              :class="{ 'pick-card--selected': pick.isMoodSelected(card.value) }"
            >
              <span class="pick-card__eyebrow">{{ card.eyebrow }}</span>
              <div>
                <h2 class="pick-card__title pick-card__title--sm">
                  <span class="pick-card__emoji">{{ card.emoji }}</span>
                  {{ card.title }}
                </h2>
                <p class="mt-2 text-[13px] leading-relaxed text-text-dim">{{ card.description }}</p>
              </div>
            </article>
          </button>
        </div>

        <div class="js-step-el mt-12">
          <div class="flex items-center gap-6">
            <button
              type="button"
              class="text-caption uppercase tracking-[0.1em] text-text-mute transition-colors duration-fast ease-out hover:text-text-dim"
              :disabled="isTransitioning"
              @click="goToStep(1)"
            >
              ← 상황 다시
            </button>
            <button
              type="button"
              class="inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-text"
              :disabled="isTransitioning || noMoods"
              @click="goToStep(3)"
            >
              다음
            </button>
          </div>
          <p v-if="noMoods" class="mt-3 text-caption text-text-mute">
            기분을 1개 이상 선택해주세요
          </p>
        </div>
      </section>

      <!-- ─────────────────── STEP 3 — 조건 설정 ─────────────────── -->
      <section v-else class="max-w-2xl">
        <h1 class="js-step-el max-w-[20ch] text-h1 text-text">
          얼마나 볼 수 있어요?
        </h1>

        <div class="js-step-el mt-14">
          <div class="flex items-baseline justify-between">
            <span class="pick-card__eyebrow">RUNTIME</span>
            <span class="text-h2 tabular-nums text-text">
              {{ pick.runtime }}<span class="ml-1 text-[14px] text-text-dim">분 이하</span>
            </span>
          </div>

          <input
            class="runtime-slider mt-6 w-full"
            type="range"
            :min="RUNTIME_MIN"
            :max="RUNTIME_MAX"
            step="5"
            :value="pick.runtime"
            :style="{ '--pct': runtimePct + '%' }"
            :disabled="isTransitioning"
            aria-label="러닝타임 상한 (분)"
            @input="onRuntimeInput"
          />

          <div class="mt-3 flex justify-between text-caption text-text-mute">
            <span>{{ RUNTIME_MIN }}분</span>
            <span>{{ RUNTIME_MAX }}분</span>
          </div>
        </div>

        <div class="js-step-el mt-14">
          <div class="flex items-center gap-6">
            <button
              type="button"
              class="text-caption uppercase tracking-[0.1em] text-text-mute transition-colors duration-fast ease-out hover:text-text-dim"
              :disabled="isTransitioning"
              @click="goToStep(2)"
            >
              ← 기분 다시
            </button>
            <button
              type="button"
              class="inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-text"
              :disabled="isTransitioning || noMoods"
              @click="goToResult"
            >
              결과 보기
            </button>
          </div>
          <p v-if="noMoods" class="mt-3 text-caption text-text-mute">
            기분을 1개 이상 선택해주세요 — 왼쪽 “기분 다시”에서 고를 수 있어요
          </p>
        </div>
      </section>
    </div>

    <!-- STEP 진행 인디케이터 (DESIGN §2.9) — 좌하단 고정, 현재 숫자만 --accent -->
    <div
      class="js-step-indicator pointer-events-none fixed bottom-gutter left-gutter z-50 flex items-center gap-3 text-caption tracking-[0.1em]"
    >
      <span class="text-accent">{{ pad2(step) }}</span>
      <span class="text-text-mute">—</span>
      <span class="text-text-dim">{{ pad2(TOTAL_STEPS) }}</span>
    </div>
  </main>
</template>

<style>
/**
 * 카드 호버/선택 — DESIGN §2.9: border color → --accent, translateY(-4px), 바운스 없이.
 * 선택 상태(--selected)는 테두리 accent + 배경을 한 단계 밝게(--surface-hi).
 *
 * translateY 는 <button class="js-step-el">(GSAP 이 scatter/gather 로 transform 을
 * 얹는 엘리먼트)가 아니라 그 자식 .pick-card 에 건다. 두 transform 이 다른
 * 엘리먼트에 있어 GSAP 인라인 스타일과 CSS :hover 가 충돌하지 않는다 (DESIGN §6).
 */
.pick-card {
  transition:
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}
.js-step-el:hover .pick-card {
  transform: translateY(-4px);
  border-color: var(--accent);
}
.pick-card--selected {
  border-color: var(--accent);
  background-color: var(--surface-hi);
}
.js-step-el:disabled {
  pointer-events: none;
}

/* A24 타이포 위계 (DESIGN §2.9) */
.pick-card__eyebrow {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.pick-card__title {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--text);
  word-break: keep-all; /* 좁은 화면에서 '설레고 싶어' 가 '싶/어' 로 쪼개지지 않게 */
}
.pick-card__title--sm {
  font-size: 20px;
}
.pick-card__emoji {
  margin-right: 0.35em;
  font-size: 1.1em;
}
@media (min-width: 768px) {
  .pick-card__title {
    font-size: 40px;
  }
  .pick-card__title--sm {
    font-size: 22px;
  }
}

/**
 * 러닝타임 슬라이더 (DESIGN §1 토큰) — 트랙 --line, 채움+핸들 --accent.
 * transform/opacity 를 건드리지 않으므로 순수 CSS 로 처리해도 GSAP 과 충돌 없음.
 */
.runtime-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 2px;
  background: linear-gradient(
    to right,
    var(--accent) 0 var(--pct),
    var(--line) var(--pct) 100%
  );
  cursor: pointer;
}
.runtime-slider:disabled {
  cursor: default;
}
.runtime-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  margin-top: -7px;
}
.runtime-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
}
.runtime-slider::-webkit-slider-runnable-track {
  height: 2px;
}
.runtime-slider::-moz-range-track {
  height: 2px;
  background: transparent;
}
.runtime-slider:focus-visible {
  outline: none;
}
.runtime-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px rgba(198, 255, 0, 0.25);
}
.runtime-slider:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px rgba(198, 255, 0, 0.25);
}

/* 전환 중 클릭 잠금 (DESIGN §2.5) */
.pick-root--locked {
  pointer-events: none;
}

/* SSR 페인트 → onMounted(gather in) 사이의 깜빡임 방지.
   마운트 전엔 요소를 숨겨 두고, gather in 이 opacity 를 살린다.
   모션 축소 환경에선 애니메이션을 건너뛰므로 항상 보이게 한다. */
.pick-root:not(.pick-root--ready) .js-step-el {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .pick-card {
    transition:
      border-color var(--dur-fast) var(--ease-out),
      background-color var(--dur-fast) var(--ease-out);
  }
  .js-step-el:hover .pick-card {
    transform: none;
  }
  .pick-root:not(.pick-root--ready) .js-step-el {
    opacity: 1;
  }
}
</style>
