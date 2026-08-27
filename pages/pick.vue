<script setup lang="ts">
/**
 * /pick — 선택 플로우 (3-STEP). 이번 세션은 STEP 1(상황 선택)만 구현한다.
 *
 * - 스텝 상태는 라우팅이 아니라 ?step= 쿼리로만 관리한다 (PRD §5, DESIGN §2.5).
 *   뒤로가기·새로고침 대응: step 은 route.query 파생값이고, 변경을 watch 해서
 *   gather-in 을 다시 태운다.
 * - 카드 타이포 위계는 DESIGN §2.9 (A24): eyebrow → 대형 볼드 타이틀 → 설명.
 * - 역할 분리 (DESIGN §6):
 *     Tailwind/CSS → 레이아웃·색상·타이포·간격, 그리고 border-color 트랜지션.
 *     GSAP        → transform(x/y/scale)·opacity 만. 스텝 전환(scatter/gather) 담당.
 *     카드 호버 translateY 는 Tailwind 에 transform 유틸이 없으므로 <style> 의
 *     순수 CSS :hover 로 처리한다 (GSAP 이 건드리는 엘리먼트와 분리 — 아래 주석).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { usePickStore, type Situation } from '~/stores/pick'

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

const mounted = ref(false)
const isTransitioning = ref(false)

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 현재 스텝의 애니메이션 대상. v-if 로 한 스텝만 렌더되므로 전역 셀렉터로 충분.
function stepEls() {
  return gsap.utils.toArray<HTMLElement>('.js-step-el')
}

// DESIGN §2.5 — gather in: 중앙에서 모임 (scale 0.9 → 1, opacity 0 → 1, stagger 0.05)
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

// DESIGN §2.5 — scatter out: 흩어지며 사라짐 (랜덤 x/y ±60, opacity 0, stagger 0.03)
// 그 다음 ?step= 을 갱신한다. STEP 2 는 다음 세션 구현 — 지금은 자리표시.
function goToStep(next: number) {
  if (isTransitioning.value) return
  isTransitioning.value = true // 전환 중 클릭 잠금 (중복 트리거 방지)

  const finish = () => {
    router.push({ query: { ...route.query, step: String(next) } })
    isTransitioning.value = false
  }

  const els = stepEls()
  if (prefersReducedMotion() || !els.length) {
    finish()
    return
  }

  gsap.to(els, {
    x: () => gsap.utils.random(-60, 60),
    y: () => gsap.utils.random(-60, 60),
    opacity: 0,
    duration: 0.5,
    ease: 'power3.in',
    stagger: 0.03,
    onComplete: finish,
  })
}

function selectSituation(card: SituationCard) {
  if (isTransitioning.value) return
  pick.setSituation(card.value)
  // STEP 2 미구현 — 선택값은 스토어에 저장되고, 전환 연출만 확인용으로 태운다.
  console.log('[pick] situation selected →', card.value, '| store:', pick.situation)
  goToStep(2)
}

// 스텝이 바뀔 때마다(선택·뒤로가기·직접 URL) 새 스텝 요소를 gather in
watch(step, async () => {
  await nextTick()
  gatherIn()
})

onMounted(() => {
  mounted.value = true
  gatherIn()
})

onUnmounted(() => {
  gsap.killTweensOf('.js-step-el')
})
</script>

<template>
  <main
    class="pick-root relative flex min-h-screen flex-col justify-center bg-bg px-gutter py-24"
    :class="{ 'pick-root--ready': mounted, 'pick-root--locked': isTransitioning }"
  >
    <div class="mx-auto w-full max-w-site">
      <!-- STEP 1 — 상황 선택 -->
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

      <!-- STEP 2 — 다음 세션 구현. 지금은 전환(scatter/gather) 확인용 자리표시. -->
      <section v-else class="text-center">
        <p class="js-step-el text-h2 text-text-dim">
          STEP {{ step }} · 다음 세션에서 구현 예정
        </p>
        <p class="js-step-el mt-4 text-[14px] text-text-mute">
          선택한 상황: <span class="text-accent">{{ pick.situation ?? '없음' }}</span>
        </p>
        <button
          type="button"
          class="js-step-el mt-8 text-caption uppercase tracking-[0.1em] text-accent"
          @click="goToStep(1)"
        >
          ← STEP 1로 돌아가기
        </button>
      </section>
    </div>

    <!-- STEP 진행 인디케이터 (DESIGN §2.9) — 좌하단 고정, 현재 숫자만 --accent -->
    <div
      class="pointer-events-none fixed bottom-gutter left-gutter z-50 flex items-center gap-3 text-caption tracking-[0.1em]"
    >
      <span class="text-accent">{{ pad2(step) }}</span>
      <span class="text-text-mute">—</span>
      <span class="text-text-dim">{{ pad2(TOTAL_STEPS) }}</span>
    </div>
  </main>
</template>

<style>
/**
 * 카드 호버 — DESIGN §2.9: border color → --accent, translateY(-4px), 바운스 없이.
 *
 * translateY 는 <button class="js-step-el">(GSAP 이 scatter/gather 로 transform 을
 * 얹는 엘리먼트)가 아니라 그 자식 .pick-card 에 건다. 두 transform 이 다른
 * 엘리먼트에 있어 GSAP 인라인 스타일과 CSS :hover 가 충돌하지 않는다 (DESIGN §6).
 * border-color 트랜지션은 GSAP 소관이 아니므로 CSS 로 처리해도 무방.
 */
.pick-card {
  transition:
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.js-step-el:hover .pick-card {
  transform: translateY(-4px);
  border-color: var(--accent);
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
}
@media (min-width: 768px) {
  .pick-card__title {
    font-size: 40px;
  }
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
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .js-step-el:hover .pick-card {
    transform: none;
  }
  .pick-root:not(.pick-root--ready) .js-step-el {
    opacity: 1;
  }
}
</style>
