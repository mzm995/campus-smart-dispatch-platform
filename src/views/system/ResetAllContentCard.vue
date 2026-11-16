<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, WarningFilled } from '@element-plus/icons-vue'
import SectionCard from '@/components/SectionCard.vue'
import { useAvatarDirectoryStore } from '@/stores/avatar'
import { useUserStore } from '@/stores/user'
import { apiRequest } from '@/utils/api'
import { clearBusinessState } from '@/utils/storage'

const auth = useUserStore()
const avatars = useAvatarDirectoryStore()
const resetting = ref(false)

async function resetAllContent() {
  if (resetting.value) return
  try {
    await ElMessageBox.confirm(
      '此操作将永久清除全部业务内容、通知、AI 记录、审计日志、上传图片和所有用户头像。账号密码与系统配置会保留，已清除的数据无法恢复。',
      '一键重置全部内容',
      {
        confirmButtonText: '我已了解，继续',
        cancelButtonText: '取消',
        type: 'error',
        distinguishCancelAndClose: true,
      },
    )
    await ElMessageBox.prompt(
      '请在输入框中完整输入“重置全部内容”，再次确认永久清除。',
      '最终确认',
      {
        confirmButtonText: '永久清除',
        cancelButtonText: '取消',
        type: 'warning',
        inputPattern: /^重置全部内容$/,
        inputErrorMessage: '必须完整输入“重置全部内容”',
        inputPlaceholder: '重置全部内容',
      },
    )
  } catch {
    return
  }

  resetting.value = true
  try {
    const result = await apiRequest('/system/reset-all', {
      method: 'POST',
      body: { confirmation: '重置全部内容' },
      timeoutMs: 30_000,
    })
    clearBusinessState()
    await auth.restoreSession({ force: true })
    await avatars.refresh()
    if (result.uploadErrors > 0) {
      ElMessage.warning(
        `内容已重置，但有 ${result.uploadErrors} 个上传文件未能删除，请稍后重试。`,
      )
    } else {
      ElMessage.success('全部内容已重置，所有头像已恢复默认样式，正在重新加载…')
    }
    window.setTimeout(() => window.location.reload(), 700)
  } catch (error) {
    ElMessage.error(error?.message || '一键重置失败')
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <SectionCard
    title="危险操作"
    desc="仅在演示环境需要彻底清空时使用，普通的数据修复请优先选择上方演示数据重置。"
  >
    <div class="admin-danger">
      <div class="admin-danger__head">
        <span class="admin-danger__icon">
          <el-icon><WarningFilled /></el-icon>
        </span>
        <div>
          <strong>一键重置全部内容</strong>
          <p>清除全部业务数据、上传图片、所有用户头像、通知、AI 记录和审计日志；保留账号密码及系统配置。</p>
        </div>
      </div>
      <el-alert
        title="操作不可撤销，执行前需要完成两次确认。"
        type="error"
        :closable="false"
        show-icon
      />
      <el-button
        type="danger"
        plain
        :loading="resetting"
        @click="resetAllContent"
      >
        <el-icon><Delete /></el-icon>
        一键重置全部内容
      </el-button>
    </div>
  </SectionCard>
</template>

<style scoped>
.admin-danger {
  display: grid;
  gap: 16px;
}

.admin-danger__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.admin-danger__head strong {
  display: block;
  color: var(--text-1);
  font-size: 15px;
}

.admin-danger__head p {
  margin: 5px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.75;
}

.admin-danger__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--radius);
  background: var(--coral-50);
  color: var(--coral-600);
}

.admin-danger > .el-button {
  justify-self: start;
}
</style>
