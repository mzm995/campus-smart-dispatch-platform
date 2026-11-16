import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import 'element-plus/dist/index.css'
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/element.css'
import '@/styles/utilities.css'

import App from './App.vue'
import router from './router'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { useClassroomStore } from '@/stores/classroom'
import { useLostfoundStore } from '@/stores/lostfound'
import { useGroupBuyStore } from '@/stores/groupbuy'
import { useForumStore } from '@/stores/forum'
import { installDemoApi } from '@/utils/demoApi'

// 静态托管（GitHub Pages 等）没有 Node 后端：先安装浏览器内的演示 API，
// 让登录、通知、共享数据与系统配置接口照常返回，再由业务 store 接管。
if (import.meta.env.VITE_DEMO_API === '1') {
  installDemoApi()
}

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 兜底错误处理：演示现场不把堆栈甩给用户，控制台保留完整信息便于排查。
let errorToastShown = false
app.config.errorHandler = (err, instance, info) => {
  console.error('[campus-smart-dispatch-platform] 未捕获异常:', err, info)
  if (errorToastShown) return
  errorToastShown = true
  ElMessage.error('页面出现一点小问题，请重试当前操作')
  window.setTimeout(() => {
    errorToastShown = false
  }, 6000)
}

// 初始化各业务 store（触发本地持久化数据装载）
useUserStore()
useNotifyStore()
useClassroomStore()
useLostfoundStore()
useGroupBuyStore()
useForumStore()

window.addEventListener('campus-smart-dispatch-platform:storage-degraded', (event) => {
  ElMessage({
    type: event.detail?.indexedDb ? 'warning' : 'error',
    message: event.detail?.message || '本地缓存空间不足，请检查网络并同步云端',
    grouping: true,
    duration: 6500,
  })
})

app.mount('#app')
