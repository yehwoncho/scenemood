<script setup lang="ts">
/**
 * 상세 모달 (PRD §6.5) — 별도 라우팅 없이 오버레이로 처리.
 *
 * - 결과 카드가 이미 가진 값(제목·포스터·시놉시스·평점·러닝타임)으로 즉시 그리고,
 *   /api/detail 로 개봉년도 + 시청 가능 플랫폼(watch/providers, region=KR)을 채운다.
 * - 닫기: 배경 클릭 · ESC · X 버튼. 열려 있는 동안 body 스크롤 잠금.
 * - 애니메이션은 정보 확인용이라 가볍게 — opacity + scale(0.96→1), ~0.35s
 *   (DESIGN §6: transform/opacity 는 GSAP 담당).
 * - Teleport to body — 결과 카드 그리드에 GSAP transform 이 얹혀 있어
 *   position: fixed 가 그 안에서 깨지는 걸 피한다.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'
import type { PoolItem } from '~/stores/result'
import type { DetailResponse, DetailProvider } from '~/server/api/detail'

const props = defineProps<{ item: PoolItem }>()
const emit = defineEmits<{ close: [] }>()

const backdrop = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLElement | null>(null)

const detail = ref<DetailResponse | null>(null)
const detailError = ref(false)

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function posterUrl(path: string | null) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : ''
}

// eyebrow: "1994 · 89분" — 있는 값만 이어붙인다
const eyebrow = ref('')
function buildEyebrow() {
  const parts: string[] = []
  const year = detail.value?.year
  const runtime = detail.value?.runtime ?? props.item.runtime
  if (year) parts.push(year)
  if (runtime) parts.push(`${runtime}분`)
  eyebrow.value = parts.join(' · ')
}

const PROVIDER_GROUPS: { key: keyof DetailResponse['providers'], label: string }[] = [
  { key: 'flatrate', label: '구독' },
  { key: 'rent', label: '대여' },
  { key: 'buy', label: '구매' },
]
function groupsWithItems() {
  const p = detail.value?.providers
  if (!p) return []
  return PROVIDER_GROUPS
    .map((g) => ({ ...g, items: p[g.key] as DetailProvider[] }))
    .filter((g) => g.items.length > 0)
}

let closing = false
function close() {
  if (closing) return
  closing = true
  const done = () => emit('close')
  if (prefersReducedMotion() || !backdrop.value) {
    done()
    return
  }
  gsap.to(panel.value, { opacity: 0, scale: 0.96, duration: 0.25, ease: 'power2.in' })
  gsap.to(backdrop.value, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: done })
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === backdrop.value) close()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(async () => {
  // body 스크롤 잠금
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKeydown)
  closeBtn.value?.focus()

  // 열기 애니메이션
  if (!prefersReducedMotion() && backdrop.value) {
    gsap.fromTo(backdrop.value, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' })
    gsap.fromTo(
      panel.value,
      { opacity: 0, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' },
    )
  }

  // 상세 데이터
  try {
    detail.value = await $fetch<DetailResponse>('/api/detail', { params: { id: props.item.id } })
  }
  catch {
    detailError.value = true
  }
  buildEyebrow()
})

onUnmounted(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
  gsap.killTweensOf([backdrop.value, panel.value])
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="backdrop"
      class="title-modal__backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`${item.title} 상세`"
      @click="onBackdropClick"
    >
      <div ref="panel" class="title-modal__panel">
        <button
          ref="closeBtn"
          type="button"
          class="title-modal__close"
          aria-label="닫기"
          @click="close"
        >
          ✕
        </button>

        <div class="title-modal__poster">
          <img
            v-if="item.poster_path"
            :src="posterUrl(detail?.posterPath ?? item.poster_path)"
            :alt="item.title"
          >
          <span v-else class="title-modal__poster-fallback">{{ item.title }}</span>
        </div>

        <div class="title-modal__body">
          <span v-if="eyebrow" class="title-modal__eyebrow">{{ eyebrow }}</span>
          <h2 class="title-modal__title">{{ detail?.title || item.title }}</h2>

          <p class="title-modal__overview">
            {{ detail?.overview || item.overview || '등록된 시놉시스가 없어요.' }}
          </p>

          <div class="title-modal__rating">
            <span class="title-modal__rating-value">
              ★ {{ (detail?.voteAverage ?? item.vote_average).toFixed(1) }}
            </span>
            <span class="title-modal__rating-label">TMDB 평점</span>
          </div>

          <div class="title-modal__providers">
            <span class="title-modal__eyebrow">시청 가능 플랫폼</span>
            <template v-if="groupsWithItems().length">
              <div
                v-for="g in groupsWithItems()"
                :key="g.key"
                class="title-modal__provider-row"
              >
                <span class="title-modal__provider-group">{{ g.label }}</span>
                <ul class="title-modal__provider-list">
                  <li v-for="p in g.items" :key="p.id" class="title-modal__provider">
                    <img v-if="p.logo" :src="p.logo" :alt="p.name" width="28" height="28">
                    <span>{{ p.name }}</span>
                  </li>
                </ul>
              </div>
              <a
                v-if="detail?.providerLink"
                :href="detail.providerLink"
                target="_blank"
                rel="noopener noreferrer"
                class="title-modal__provider-link"
              >
                JustWatch에서 보기 ↗
              </a>
            </template>
            <p v-else class="title-modal__provider-empty">
              {{ detailError ? '플랫폼 정보를 불러오지 못했어요.' : '한국에서 제공 중인 플랫폼 정보가 없어요.' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/**
 * 상세 모달 — DESIGN §1 토큰 + §2.9 타이포 위계 (eyebrow → 볼드 타이틀 → 본문).
 * transform/opacity 는 GSAP 이 인라인으로 제어하므로 여기선 색·간격·레이아웃만.
 */
.title-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gutter);
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}
.title-modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 880px;
  max-height: calc(100vh - var(--gutter) * 2);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
@media (min-width: 768px) {
  .title-modal__panel {
    flex-direction: row;
  }
}

.title-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-dim);
  background: rgba(10, 10, 10, 0.6);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.title-modal__close:hover,
.title-modal__close:focus-visible {
  color: var(--accent);
  border-color: var(--accent);
  outline: none;
}

.title-modal__poster {
  flex-shrink: 0;
  background: var(--surface-hi);
}
.title-modal__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (min-width: 768px) {
  .title-modal__poster {
    width: 300px;
  }
}
.title-modal__poster-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 1.5rem;
  text-align: center;
  font-size: 14px;
  color: var(--text-dim);
}

.title-modal__body {
  flex: 1;
  padding: 2rem;
}
@media (min-width: 768px) {
  .title-modal__body {
    padding: 2.5rem;
  }
}

.title-modal__eyebrow {
  display: block;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.title-modal__title {
  margin-top: 0.5rem;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--text);
  word-break: keep-all;
}
@media (min-width: 768px) {
  .title-modal__title {
    font-size: 34px;
  }
}
.title-modal__overview {
  margin-top: 1.25rem;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-dim);
  word-break: keep-all;
}

.title-modal__rating {
  margin-top: 1.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.title-modal__rating-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}
.title-modal__rating-label {
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-mute);
}

.title-modal__providers {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}
.title-modal__provider-row {
  margin-top: 0.85rem;
  display: flex;
  gap: 0.9rem;
}
.title-modal__provider-group {
  flex-shrink: 0;
  width: 2.5rem;
  padding-top: 0.4rem;
  font-size: 12px;
  color: var(--text-mute);
}
.title-modal__provider-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.title-modal__provider {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.6rem 0.35rem 0.35rem;
  font-size: 13px;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.title-modal__provider img {
  border-radius: 4px;
}
.title-modal__provider-link {
  display: inline-block;
  margin-top: 1rem;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  transition: color var(--dur-fast) var(--ease-out);
}
.title-modal__provider-link:hover {
  color: var(--accent);
}
.title-modal__provider-empty {
  margin-top: 0.85rem;
  font-size: 13px;
  color: var(--text-mute);
}
</style>
