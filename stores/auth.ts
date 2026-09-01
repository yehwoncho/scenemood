import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * "지연 인증" 상태 — 로그인 자체는 어디서든 자유롭게 볼 수 있고, 찜하기·별점처럼
 * 실제로 계정이 필요한 동작을 시도할 때만 LoginModal 을 띄운다.
 * 실제 인증 상태(useSupabaseUser)는 @nuxtjs/supabase 모듈이 관리하므로 여기선
 * "모달을 보여줄지"만 들고 있는다.
 */
export const useAuthStore = defineStore('auth', () => {
  const showLoginModal = ref(false)

  function openLogin() {
    showLoginModal.value = true
  }
  function closeLogin() {
    showLoginModal.value = false
  }

  return { showLoginModal, openLogin, closeLogin }
})
