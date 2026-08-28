<script setup lang="ts">
/**
 * /result — 추천 결과 3편 (PRD §6.2·§6.4, DESIGN §2.9 결과 카드).
 *
 * - 진입 시 useResultStore.loadPool() 로 30편 풀을 확보하고 첫 3편을 노출한다.
 *   API 응답은 0.5초면 오지만 PRD §5 대로 최소 1.4초의 로딩 연출을 유지한다
 *   ("고민해서 골라줬다"는 인상).
 * - "재추천" 은 store.drawThree() — 풀에 남아 있으면 API 재호출 없이 다음 3편.
 * - 역할 분리 (DESIGN §6):
 *     Tailwind/CSS → 레이아웃·색상·타이포. 포스터는 항상 컬러(필터 없음) —
 *                    흑백→컬러 전환의 종착점(DESIGN §2.9).
 *     GSAP        → transform(x/y/scale)·opacity 만. 카드 scatter/gather 담당.
 * - 직접 URL 로 들어와 pick 값이 없으면 /pick 으로 되돌린다.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'
import { usePickStore, type Mood, type Situation } from '~/stores/pick'
import { useResultStore } from '~/stores/result'

const router = useRouter()
const pick = usePickStore()
const result = useResultStore()

const LOADING_MIN_MS = 1400

// PRD §6.4 태그 칩용 라벨 (pick STEP 2/1 카드 타이틀과 동일 문구)
const MOOD_LABEL: Record<Mood, string> = {
  cry: '울고 싶어',
  laugh: '웃고 싶어',
  numb: '아무 생각 없이',
  thrill: '심장 뛰게',
  calm: '잔잔하게',
  catharsis: '사이다',
  voyage: '낯선 세계로',
  flutter: '설레고 싶어',
}
const SITUATION_LABEL: Record<Situation, string> = {
  alone: '혼밥',
  bedtime: '자기 전',
  together: '함께',
}

// #잔잔하게 #90분 이하 #자기 전  (PRD §6.4)
// 조건이 좁아 서버가 기분을 완화했으면 실제 반영된 것만 칩으로 노출한다
// (선택한 태그를 무시하고 고른 카드에 그 태그를 붙이면 6.4의 "투명성"과 어긋난다).
const chips = computed(() => {
  const effectiveMoods = result.relaxed
    ? (result.moodsUsed as Mood[])
    : pick.moods
  const out = effectiveMoods.map((m) => MOOD_LABEL[m]).filter(Boolean)
  out.push(`${pick.runtime}분 이하`)
  if (pick.situation) out.push(SITUATION_LABEL[pick.situation])
  return out
})

// MATCH XX% — vote_average(0~10) × 10, 임시 계산 (DESIGN §2.9)
function matchPct(voteAverage: number) {
  return Math.round(voteAverage * 10)
}
function posterUrl(path: string | null) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : ''
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─────────────────────── 카드 전환 (DESIGN §2.5) ─────────────────────── */

const isRolling = ref(false)

function cardEls() {
  return gsap.utils.toArray<HTMLElement>('.js-result-card')
}

// gather in — 중앙에서 모임 (scale 0.9→1, opacity 0→1, stagger 0.05)
function gatherIn() {
  const els = cardEls()
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
      clearProps: 'all',
    },
  )
}

// scatter out — 흩어지며 사라짐 (랜덤 x/y ±60, opacity 0, stagger 0.03)
function scatterOut(): Promise<void> {
  const els = cardEls()
  if (prefersReducedMotion() || !els.length) return Promise.resolve()
  return new Promise((resolve) => {
    gsap.to(els, {
      x: () => gsap.utils.random(-60, 60),
      y: () => gsap.utils.random(-60, 60),
      opacity: 0,
      duration: 0.5,
      ease: 'power3.in',
      stagger: 0.03,
      onComplete: () => resolve(),
    })
  })
}

async function reRoll() {
  if (isRolling.value || result.status !== 'ready') return
  isRolling.value = true
  await scatterOut()
  await result.drawThree()
  await nextTick()
  gatherIn()
  isRolling.value = false
}

async function retry() {
  await load()
}

async function load() {
  await Promise.all([sleep(LOADING_MIN_MS), result.loadPool()])
  if (result.status === 'ready') {
    await nextTick()
    gatherIn()
  }
}

onMounted(async () => {
  if (!pick.situation) {
    router.replace('/pick')
    return
  }
  if (result.status === 'ready' && result.currentThree.length) {
    await nextTick()
    gatherIn()
    return
  }
  await load()
})

onUnmounted(() => {
  gsap.killTweensOf('.js-result-card')
})
</script>

<template>
  <main
    class="result-root relative flex min-h-screen flex-col bg-bg px-gutter py-24"
    :class="{ 'result-root--locked': isRolling }"
  >
    <div class="mx-auto flex w-full max-w-site flex-1 flex-col justify-center">
      <!-- 로딩 연출 (PRD §5) -->
      <div v-if="result.status === 'loading' || result.status === 'idle'" class="py-32 text-center">
        <p class="result-loading text-h2 text-text-dim">당신을 위한 3편을 고르는 중</p>
      </div>

      <!-- 에러 -->
      <div v-else-if="result.status === 'error'" class="py-32 text-center">
        <p class="text-h2 text-text-dim">{{ result.errorMessage }}</p>
        <button
          type="button"
          class="mt-8 inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent"
          @click="retry"
        >
          다시 시도
        </button>
      </div>

      <!-- 결과 3편 -->
      <template v-else>
        <header class="mb-12 md:mb-16">
          <span class="pick-card__eyebrow">RESULT</span>
          <h1 class="mt-3 max-w-[24ch] text-h1 text-text">이 세 편이면 충분해요</h1>
        </header>

        <div class="grid gap-6 md:grid-cols-3 md:gap-8">
          <article
            v-for="item in result.currentThree"
            :key="item.id"
            class="js-result-card result-card flex flex-col"
          >
            <div class="result-card__poster">
              <img
                v-if="item.poster_path"
                :src="posterUrl(item.poster_path)"
                :alt="item.title"
                loading="lazy"
              >
              <span v-else class="result-card__poster-fallback">{{ item.title }}</span>
            </div>

            <span class="mt-5 text-[12px] uppercase tracking-[0.1em] text-accent">
              MATCH {{ matchPct(item.vote_average) }}%
            </span>
            <h2 class="mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em] text-text">
              {{ item.title }}
            </h2>

            <ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              <li v-for="chip in chips" :key="chip" class="text-[13px] text-text-dim">
                #{{ chip }}
              </li>
            </ul>
          </article>
        </div>

        <div class="mt-14 flex items-center gap-6">
          <NuxtLink
            to="/pick"
            class="text-caption uppercase tracking-[0.1em] text-text-mute transition-colors duration-fast ease-out hover:text-text-dim"
          >
            ← 다시 고르기
          </NuxtLink>
          <button
            type="button"
            class="inline-flex items-center border border-line px-8 py-3.5 text-caption uppercase tracking-[0.25em] text-text transition-colors duration-fast ease-out hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus:outline-none disabled:opacity-40"
            :disabled="isRolling"
            @click="reRoll"
          >
            재추천
          </button>
        </div>
      </template>
    </div>

    <footer class="mx-auto mt-24 w-full max-w-site text-caption text-text-mute">
      데이터 제공: TMDB. 이 제품은 TMDB API를 사용하지만 TMDB의 보증 또는 인증을 받지 않았습니다.
    </footer>
  </main>
</template>

<style>
/**
 * 결과 카드 — DESIGN §2.9. A24 카드 문법 위에 포스터를 크게 얹는다.
 * 포스터는 흑백→컬러 전환의 종착점이므로 filter 를 걸지 않는다 (항상 컬러).
 * GSAP 이 .js-result-card 에 transform/opacity 를 얹으므로, 카드 내부의
 * hover 효과도 transform 을 피해 border/색상만 건드린다.
 */
.result-card__poster {
  position: relative;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.js-result-card:hover .result-card__poster {
  border-color: var(--accent);
}
.result-card__poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.result-card__poster-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  text-align: center;
  font-size: 14px;
  color: var(--text-dim);
}

/* eyebrow — 상황/기분 카드와 동일 (pick.vue 미마운트 시 대비해 여기서도 정의) */
.pick-card__eyebrow {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* 전환 중 클릭 잠금 (DESIGN §2.5) */
.result-root--locked {
  pointer-events: none;
}

/* 로딩 텍스트 — opacity 펄스. 순수 CSS 라 GSAP(카드 전용)과 충돌 없음. */
.result-loading {
  animation: result-pulse 1.4s var(--ease-inout) infinite;
}
@keyframes result-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .result-loading {
    animation: none;
    opacity: 0.7;
  }
}
</style>
