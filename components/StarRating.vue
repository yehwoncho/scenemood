<script setup lang="ts">
/**
 * 내 별점(1~5) — 결과 카드(sm) · 상세 모달(md) 공용.
 * "지연 인증": 비로그인 상태에서 별을 누르면 저장 대신 로그인 모달을 띄운다.
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useLibraryStore, type LibraryItem } from '~/stores/library'

const props = withDefaults(defineProps<{ item: LibraryItem, size?: 'sm' | 'md' }>(), {
  size: 'md',
})

const user = useSupabaseUser()
const library = useLibraryStore()
const auth = useAuthStore()

const rating = computed(() => library.ratingOf(props.item.id))
const hovered = ref<number | null>(null)
const displayed = computed(() => hovered.value ?? rating.value ?? 0)
const busy = computed(() => library.isPending(props.item.id))

function rate(n: number) {
  if (!user.value) {
    auth.openLogin()
    return
  }
  library.setRating(props.item, n)
}
</script>

<template>
  <div
    class="star-rating"
    :class="`star-rating--${size}`"
    role="radiogroup"
    aria-label="내 별점"
    @mouseleave="hovered = null"
  >
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      class="star-rating__star"
      :class="{ 'star-rating__star--filled': n <= displayed }"
      role="radio"
      :aria-checked="n === rating"
      :aria-label="`${n}점`"
      :disabled="busy"
      @click.stop="rate(n)"
      @mouseenter="hovered = n"
    >
      ★
    </button>
  </div>
</template>

<style>
.star-rating {
  display: inline-flex;
  gap: 0.15rem;
}
.star-rating__star {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  color: var(--text-mute);
  transition: color var(--dur-fast) var(--ease-out);
}
.star-rating__star:disabled {
  cursor: not-allowed;
}
.star-rating__star--filled {
  color: var(--accent);
}
.star-rating--md .star-rating__star {
  font-size: 20px;
}
.star-rating--sm .star-rating__star {
  font-size: 14px;
}
</style>
