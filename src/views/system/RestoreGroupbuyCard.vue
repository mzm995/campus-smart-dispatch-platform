<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, ShoppingCart } from '@element-plus/icons-vue'
import SectionCard from '@/components/SectionCard.vue'
import { apiRequest } from '@/utils/api'
import { removeState } from '@/utils/storage'

const restoring = ref(false)

async function restoreGroupbuyData() {
  if (restoring.value) return
  try {
    await ElMessageBox.confirm(
      '将用 6 条原始拼单替换当前拼单数据，并清除旧的拼单支付、跑腿、争议与相关通知。截止时间会从今天重新计算，其他校园场景不受影响。',
      '还原拼单原始数据',
      {
        confirmButtonText: '确认还原',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  restoring.value = true
  try {
    const result = await apiRequest('/system/restore-groupbuy', {
      method: 'POST',
      body: { confirmation: '还原拼单原始数据' },
      timeoutMs: 30_000,
    })
    removeState('v3:groupBuys')
    window.dispatchEvent(
      new CustomEvent('campus-smart-dispatch-platform:groupbuy-restored'),
    )
    ElMessage.success(
      `已还原 ${result.itemCount} 条原始拼单，刷新拼单集市即可查看。`,
    )
  } catch (error) {
    ElMessage.error(error?.message || '拼单数据还原失败')
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <SectionCard
    title="拼单数据维护"
    desc="恢复项目内置的 6 条原始拼单，并按当前日期重新生成有效期。"
  >
    <div class="groupbuy-restore">
      <div class="groupbuy-restore__summary">
        <span class="groupbuy-restore__icon">
          <el-icon><ShoppingCart /></el-icon>
        </span>
        <div>
          <strong>还原拼单原始数据</strong>
          <p>清除当前拼单及其支付、跑腿和争议记录，重新载入 6 条内置演示数据。</p>
        </div>
      </div>
      <div class="groupbuy-restore__meta">
        <span><b>6</b> 条原始拼单</span>
        <span><b>5</b> 条招募中</span>
        <span><b>1</b> 条已满员</span>
      </div>
      <el-button
        type="primary"
        plain
        :loading="restoring"
        @click="restoreGroupbuyData"
      >
        <el-icon><Refresh /></el-icon>
        还原拼单原始数据
      </el-button>
    </div>
  </SectionCard>
</template>

<style scoped>
.groupbuy-restore {
  display: grid;
  gap: 14px;
}

.groupbuy-restore__summary {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.groupbuy-restore__summary strong {
  display: block;
  color: var(--text-1);
  font-size: 15px;
}

.groupbuy-restore__summary p {
  margin: 5px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.7;
}

.groupbuy-restore__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--radius);
  background: var(--brand-50);
  color: var(--brand-600);
}

.groupbuy-restore__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.groupbuy-restore__meta span {
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 12px;
}

.groupbuy-restore__meta b {
  color: var(--brand-700);
}

.groupbuy-restore > .el-button {
  justify-self: start;
}
</style>
