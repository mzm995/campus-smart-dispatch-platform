import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const mobileNavOpen = ref(false)
  const aiDialog = ref({ visible: false, text: '' })
  const pageLoading = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function openAiDialog(text = '') {
    aiDialog.value = { visible: true, text }
  }

  function closeAiDialog() {
    aiDialog.value = { visible: false, text: aiDialog.value.text }
  }

  function setPageLoading(v) {
    pageLoading.value = Boolean(v)
  }

  return { sidebarCollapsed, mobileNavOpen, aiDialog, pageLoading, toggleSidebar, openAiDialog, closeAiDialog, setPageLoading }
})
