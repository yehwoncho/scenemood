<script setup lang="ts">
/**
 * 찜하기 토글 — 결과 카드(작게, 아이콘만) · 상세 모달(크게, 라벨 포함) 공용.
 * "지연 인증": 비로그인 상태에서 누르면 저장을 시도하지 않고 로그인 모달을 띄운다.
 */
import { computed } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useLibraryStore, type LibraryItem } from '~/stores/library'

const props = withDefaults(defineProps<{ item: LibraryItem, variant?: 'icon' | 'label' }>(), {
  variant: 'icon',
})

const user = useSupabaseUser()
const library = useLibraryStore()
const auth = useAuthStore()

const active = computed(() => library.isBookmarked(props.item.id))
const busy = computed(() => library.isPending(props.item.id))

function onClick() {
  if (!user.value) {
    auth.openLogin()
    return
  }
  library.toggleBookmark(props.item)
}
</script>

<template>
  <button
    type="button"
    class="bookmark-btn"
    :class="[`bookmark-btn--${variant}`, { 'bookmark-btn--active': active }]"
    :disabled="busy"
    :aria-pressed="active"
    :aria-label="active ? '찜 해제' : '찜하기'"
    @click.stop="onClick"
  >
    <span class="bookmark-btn__icon" aria-hidden="true">{{ active ? '♥' : '♡' }}</span>
    <span v-if="variant === 'label'" class="bookmark-btn__label">{{ active ? '찜 완료' : '찜하기' }}</span>
  </button>
</template>

<style>
.bookmark-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-dim);
  transition: color var(--dur-fast) var(--ease-out);
}
.bookmark-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.bookmark-btn:hover:not(:disabled),
.bookmark-btn--active {
  color: var(--accent);
}
.bookmark-btn__icon {
  font-size: 16px;
  line-height: 1;
}

/* icon 변형 — 결과 카드 포스터 위 원형 배지 */
.bookmark-btn--icon {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  width: 32px;
  height: 32px;
  justify-content: center;
  background: rgba(10, 10, 10, 0.55);
  border-radius: 999px;
  backdrop-filter: blur(2px);
}
.bookmark-btn--icon .bookmark-btn__icon {
  font-size: 17px;
}

/* label 변형 — 상세 모달 */
.bookmark-btn--label {
  padding: 0.55rem 0.9rem;
  font-size: 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.bookmark-btn--label:hover:not(:disabled),
.bookmark-btn--label.bookmark-btn--active {
  border-color: var(--accent);
}
</style>
