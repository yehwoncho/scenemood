<script lang="ts">
import type { ReviewInsightResponse } from '~/server/api/review-insight'

/**
 * 리뷰 기반 AI 코멘트 — tmdb_id 별 결과를 모듈 스코프에 캐싱한다.
 * - 컴포넌트가 다시 마운트돼도(모달 재오픈) 유지 → 성공분은 재호출 없이 즉시.
 * - 진행 중 요청도 같은 Promise 를 공유해 중복 호출을 막는다.
 * - Promise 는 절대 reject 하지 않는다: 성공이면 문장, 실패/빈 응답이면 null.
 * - 실패분은 캐시에 남기지 않는다(settle 후 삭제) → 쿼터가 회복되면 재오픈 시
 *   다시 시도한다.
 * - settledInsightIds: 응답이 이미 도착한(=성공) id. 재오픈 시 로딩 펄스를
 *   건너뛰고 바로 문장을 보여주는 용도 (없어도 동작에는 지장 없음).
 */
interface InsightOutcome { comment: string | null }
const insightCache = new Map<number, Promise<InsightOutcome>>()
const settledInsightIds = new Set<number>()

function hasInsightResult(id: number): boolean {
  return settledInsightIds.has(id)
}

function fetchInsight(id: number, situation: string, moods: string): Promise<InsightOutcome> {
  const cached = insightCache.get(id)
  if (cached) return cached

  const p = $fetch<ReviewInsightResponse>('/api/review-insight', {
    params: { id, mediaType: 'movie', situation, moods },
  })
    .then((res): InsightOutcome => {
      settledInsightIds.add(id)
      return { comment: res.comment || null }
    })
    .catch((err): InsightOutcome => {
      console.error('[TitleModal] review-insight 요청 실패', err?.data ?? err?.message ?? err)
      insightCache.delete(id) // 실패는 기억하지 않는다 — 다음 오픈에서 재시도
      return { comment: null }
    })
  insightCache.set(id, p)
  return p
}
</script>

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
import { onMounted, onUnmounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { usePickStore } from '~/stores/pick'
import type { PoolItem } from '~/stores/result'
import type { DetailResponse, DetailProvider } from '~/server/api/detail'

const props = defineProps<{ item: PoolItem }>()
const emit = defineEmits<{ close: [] }>()

const backdrop = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLElement | null>(null)

const detail = ref<DetailResponse | null>(null)
const detailError = ref(false)

/**
 * AI 코멘트 상태 (캐시는 위 비-setup <script> 블록의 모듈 스코프 insightCache).
 *
 * - 요청은 무조건 보낸다. 로딩 표시는 지연 게이트 없이 바로 켠다 —
 *   "아예 안 뜸"보다 "잠깐 떴다 사라짐"이 낫다는 판단(급한 수정).
 *   이미 받아둔 결과가 있으면(재오픈) 로딩을 건너뛴다.
 * - Gemini(flash-lite)는 지연 편차가 커서 정상 성공도 2~30s 가 걸린다
 *   (server/api/review-insight.ts, timeout 45s). 그래서 8s 이 지나도 응답이
 *   없으면 문구를 "조금만 기다려주세요…"로 바꿔 "멈춘 게 아니다"를 알린다.
 * - loadInsight 는 실패해도(throw 포함) 절대 멈추지 않도록 try/catch 로 감싼다.
 *   응답 도착 시 모달이 다른 작품으로 바뀌었으면(레이스) 그 응답은 버린다.
 */
const AI_LABEL = '리뷰 분석 중…'
const AI_LABEL_LONG = '조금만 기다려주세요…'

const aiComment = ref<string | null>(null)
const aiLoading = ref(false)
const aiLabel = ref(AI_LABEL)
const LONG_WAIT_MS = 8000
let longWaitTimer: ReturnType<typeof setTimeout> | null = null

function clearLoadingTimers() {
  if (longWaitTimer) {
    clearTimeout(longWaitTimer)
    longWaitTimer = null
  }
}

async function loadInsight(targetId: number) {
  clearLoadingTimers()
  aiComment.value = null
  aiLabel.value = AI_LABEL

  const known = hasInsightResult(targetId)
  aiLoading.value = !known // 재오픈(캐시 있음)이면 로딩 생략, 아니면 바로 표시
  if (!known) {
    // 8s 이 지나도 응답이 없으면 장문 대기 문구로 전환 (지연이 큰 게 정상 범위).
    longWaitTimer = setTimeout(() => {
      if (props.item.id === targetId && aiComment.value === null) aiLabel.value = AI_LABEL_LONG
    }, LONG_WAIT_MS)
  }

  let comment: string | null = null
  try {
    const pick = usePickStore()
    const moods = Array.isArray(pick.moods) ? pick.moods.join(',') : ''
    comment = (await fetchInsight(targetId, pick.situation ?? '', moods)).comment
  }
  catch (err) {
    console.error('[TitleModal] loadInsight 실패', err)
  }

  clearLoadingTimers()
  // 레이스 가드 — 그 사이 모달이 다른 작품으로 바뀌었으면 이 응답은 폐기.
  if (props.item.id !== targetId) return

  aiLoading.value = false
  aiComment.value = comment
}

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

// 열림 + (혹시 인스턴스가 재사용돼) 다른 작품으로 바뀌는 경우 모두 커버.
watch(() => props.item.id, (id) => { loadInsight(id) }, { immediate: true })

onUnmounted(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
  clearLoadingTimers()
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

          <!-- 리뷰 기반 AI 코멘트 — 실패 시 섹션 자체를 숨긴다 -->
          <div v-if="aiLoading || aiComment" class="title-modal__ai">
            <span class="title-modal__eyebrow">AI 코멘트</span>
            <p v-if="aiLoading" class="title-modal__ai-loading">{{ aiLabel }}</p>
            <p v-else class="title-modal__ai-text">{{ aiComment }}</p>
          </div>

          <div class="title-modal__rating">
            <span class="title-modal__rating-value">
              ★ {{ (detail?.voteAverage ?? item.vote_average).toFixed(1) }}
            </span>
            <span class="title-modal__rating-label">TMDB 평점</span>
          </div>

          <!-- 보관함 — 찜하기 · 내 별점 (지연 인증: 비로그인이면 클릭 시 로그인 모달) -->
          <div class="title-modal__my">
            <BookmarkButton :item="item" variant="label" />
            <div class="title-modal__my-rating">
              <span class="title-modal__rating-label">내 별점</span>
              <StarRating :item="item" size="md" />
            </div>
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
  overflow: hidden;
  background: var(--surface-hi);
}
.title-modal__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* 모바일(포스터가 위) — 포스터가 첫 화면을 다 먹지 않게 높이 고정 */
@media (max-width: 767px) {
  .title-modal__poster {
    height: 40vh;
  }
  .title-modal__poster img {
    object-position: center 20%;
  }
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

.title-modal__ai {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  background: var(--surface-hi);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.title-modal__ai-text {
  margin-top: 0.55rem;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
  word-break: keep-all;
}
.title-modal__ai-loading {
  margin-top: 0.55rem;
  font-size: 13px;
  color: var(--text-mute);
  animation: title-modal-pulse 1.4s var(--ease-inout) infinite;
}
@keyframes title-modal-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .title-modal__ai-loading {
    animation: none;
    opacity: 0.7;
  }
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

.title-modal__my {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.1rem;
}
.title-modal__my-rating {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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
