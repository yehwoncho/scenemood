<script setup lang="ts">
/**
 * 이메일 매직링크 로그인 — "지연 인증" 진입점.
 * app.vue 에 전역으로 한 번 마운트해두고, authStore.showLoginModal 로 열고 닫는다.
 * 호출부(BookmarkButton·StarRating 등)는 로그인 필요 시 authStore.openLogin() 만 부르면 된다.
 *
 * - signInWithOtp 는 비밀번호 없이 이메일로 받은 링크를 클릭하면 로그인되는 방식.
 *   여기서 쓰는 useSupabaseClient() 가 @supabase/ssr 의 createBrowserClient 라,
 *   PKCE code-verifier 를 쿠키에 저장한다.
 *   emailRedirectTo 는 서버 라우트 /auth/confirm — 거기서 요청 쿠키의 verifier 로
 *   exchangeCodeForSession 을 하고 세션 쿠키를 심은 뒤 /library 로 보낸다.
 * - TitleModal 과 같은 오버레이 문법(backdrop·panel·ESC·바깥클릭)을 따른다.
 */
import { nextTick, ref, watch } from 'vue'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const supabase = useSupabaseClient()

type Phase = 'idle' | 'sending' | 'sent' | 'error'
const phase = ref<Phase>('idle')
const email = ref('')
const errorMessage = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => auth.showLoginModal,
  (open) => {
    if (open) {
      phase.value = 'idle'
      errorMessage.value = ''
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown)
      nextTick(() => inputEl.value?.focus())
    }
    else {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

async function sendLink() {
  const value = email.value.trim()
  if (!value || phase.value === 'sending') return
  phase.value = 'sending'
  errorMessage.value = ''
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    if (error) throw error
    phase.value = 'sent'
  }
  catch (err) {
    console.error('[LoginModal] 매직링크 발송 실패', err)
    errorMessage.value = '이메일 전송에 실패했어요. 잠시 후 다시 시도해주세요.'
    phase.value = 'error'
  }
}

function close() {
  auth.closeLogin()
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="auth.showLoginModal"
      class="login-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="로그인"
      @click="onBackdropClick"
    >
      <div class="login-modal__panel">
        <button type="button" class="login-modal__close" aria-label="닫기" @click="close">✕</button>

        <span class="login-modal__eyebrow">LOGIN</span>
        <h2 class="login-modal__title">이메일로 로그인</h2>
        <p class="login-modal__desc">
          찜하기 · 별점은 로그인 후 이용할 수 있어요. 비밀번호 없이 이메일로 받는 링크 하나면 충분해요.
        </p>

        <template v-if="phase !== 'sent'">
          <form class="login-modal__form" @submit.prevent="sendLink">
            <input
              ref="inputEl"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="login-modal__input"
              :disabled="phase === 'sending'"
            >
            <button
              type="submit"
              class="login-modal__submit"
              :disabled="phase === 'sending' || !email"
            >
              {{ phase === 'sending' ? '보내는 중…' : '로그인 링크 보내기' }}
            </button>
          </form>
          <p v-if="phase === 'error'" class="login-modal__error">{{ errorMessage }}</p>
        </template>

        <div v-else class="login-modal__sent">
          <p class="login-modal__sent-text">
            <strong>{{ email }}</strong>로 로그인 링크를 보냈어요.<br>
            이메일을 확인해주세요.
          </p>
          <button type="button" class="login-modal__retry" @click="phase = 'idle'">
            다른 이메일로 받기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.login-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 200; /* TitleModal(100) 위 — 찜하기 클릭 중 뜨는 경우가 많다 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gutter);
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}
.login-modal__panel {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: 2rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.login-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.login-modal__close:hover,
.login-modal__close:focus-visible {
  color: var(--accent);
  border-color: var(--accent);
  outline: none;
}

.login-modal__eyebrow {
  display: block;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.login-modal__title {
  margin-top: 0.5rem;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}
.login-modal__desc {
  margin-top: 0.75rem;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim);
  word-break: keep-all;
}

.login-modal__form {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.login-modal__input {
  width: 100%;
  padding: 0.75rem 0.9rem;
  font-size: 14px;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.login-modal__input::placeholder {
  color: var(--text-mute);
}
.login-modal__input:focus {
  outline: none;
  border-color: var(--accent);
}
.login-modal__input:disabled {
  opacity: 0.6;
}
.login-modal__submit {
  padding: 0.85rem 1rem;
  font-size: 13px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--bg);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.login-modal__submit:hover:not(:disabled) {
  opacity: 0.88;
}
.login-modal__submit:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.login-modal__error {
  margin-top: 0.85rem;
  font-size: 13px;
  color: #ff6b6b;
}

.login-modal__sent {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}
.login-modal__sent-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
  word-break: keep-all;
}
.login-modal__retry {
  margin-top: 1rem;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-mute);
  background: none;
  border: none;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.login-modal__retry:hover {
  color: var(--text-dim);
}
</style>
