<script setup>
import { computed } from 'vue'
import { Coin, Warning } from '@element-plus/icons-vue'

const props = defineProps({
  item: { type: Object, required: true },
  commerceStatus: { type: String, default: '' },
  commerceText: { type: String, default: '' },
  viewer: { type: Object, default: () => ({}) },
  isOwner: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  myPickupTicket: { type: Object, default: null },
  acting: { type: Boolean, default: false },
})

const targetId = defineModel('targetId', { type: String, default: '' })
const pickupCode = defineModel('pickupCode', { type: String, default: '' })
const emit = defineEmits(['advance', 'redeem', 'confirm', 'dispute', 'resolve'])
const redeemableParticipants = computed(() =>
  (props.item.participants || []).filter(
    (participant) => participant.userId && participant.userId !== props.item.ownerId,
  ),
)

function money(value) {
  return (Math.max(0, Number(value) || 0) / 100).toFixed(2)
}
</script>

<template>
  <section class="card side-card commerce-card">
    <div class="side-head">
      <span class="side-head__icon side-head__icon--teal"><Coin /></span>
      <div>
        <h2>托管与履约</h2>
        <p>{{ commerceText }} · 资金和交接状态分阶段释放</p>
      </div>
    </div>
    <div class="commerce-grid">
      <div>
        <span>成员应付</span>
        <strong>¥{{ money(item.commerce.requiredCents) }}</strong>
      </div>
      <div>
        <span>已入托管</span>
        <strong>¥{{ money(item.commerce.fundedCents) }}</strong>
      </div>
      <div>
        <span>已领取</span>
        <strong>{{ item.commerce.redeemedCount || 0 }} / {{ item.commerce.ticketCount || 0 }}</strong>
      </div>
      <div>
        <span>我的支付</span>
        <strong>
          {{
            viewer.paymentStatus === 'captured'
              ? '已托管'
              : viewer.paymentStatus === 'authorized'
                ? '已冻结'
                : '未支付'
          }}
        </strong>
      </div>
    </div>

    <div v-if="myPickupTicket" class="pickup-code-box">
      <span>我的一次性取货码</span>
      <strong class="mono">{{ myPickupTicket.code || '已完成' }}</strong>
      <small>仅本账号可见。到场出示给发起人或中间人，不要在群内公开转发。</small>
      <el-button
        v-if="myPickupTicket.status === 'pending' && myPickupTicket.code"
        type="primary"
        :loading="acting"
        @click="emit('confirm')"
      >
        确认已当面领取
      </el-button>
    </div>

    <template v-if="isOwner">
      <div class="commerce-actions">
        <el-button
          v-if="['funded', 'formed'].includes(commerceStatus)"
          type="primary"
          :loading="acting"
          @click="emit('advance', 'purchase')"
        >
          {{
            item.commerce.settlementMode === 'host_advance'
              ? '确认已代付采购'
              : '确认已完成采购'
          }}
        </el-button>
        <el-button
          v-if="commerceStatus === 'purchasing'"
          type="primary"
          :loading="acting"
          @click="emit('advance', 'ship')"
        >
          开始配送
        </el-button>
        <el-button
          v-if="commerceStatus === 'shipping'"
          type="primary"
          :loading="acting"
          @click="emit('advance', 'ready')"
        >
          标记到货
        </el-button>
      </div>

      <div v-if="commerceStatus === 'ready'" class="pickup-redeem">
        <p>成员到场后，让你输入对方页面显示的 6 位取货码。</p>
        <el-select v-model="targetId" placeholder="选择领取成员">
          <el-option
            v-for="person in redeemableParticipants"
            :key="person.userId || person.name"
            :label="`${person.name} · ${person.count || 1} 份`"
            :value="person.userId"
            :disabled="!person.userId"
          />
        </el-select>
        <div class="pickup-redeem__row">
          <el-input
            v-model="pickupCode"
            maxlength="6"
            inputmode="numeric"
            placeholder="6 位取货码"
          />
          <el-button type="primary" :loading="acting" @click="emit('redeem')">
            核销交接
          </el-button>
        </div>
      </div>
    </template>

    <div
      v-if="['formed', 'funded', 'purchasing', 'shipping', 'ready'].includes(commerceStatus)"
      class="commerce-dispute"
    >
      <el-button text @click="emit('dispute')">
        <el-icon><Warning /></el-icon>
        发起交易争议
      </el-button>
      <span>争议期间托管资金冻结，发起人不能单方面结算。</span>
    </div>

    <div v-if="isAdmin && item.dispute" class="commerce-dispute admin-resolution">
      <b>管理员争议处理</b>
      <span>{{ item.dispute.reason }}</span>
      <div>
        <el-button type="danger" plain @click="emit('resolve', true)">
          支持退款
        </el-button>
        <el-button @click="emit('resolve', false)">驳回争议</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.side-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.side-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  font-size: 18px;
}

.side-head__icon--teal {
  background: var(--teal-50);
  color: var(--teal-600);
}

.side-head > div {
  flex: 1;
  min-width: 0;
}

.side-head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.side-head p {
  margin-top: 0;
  font-size: 12px;
  color: var(--text-3);
}

.commerce-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.commerce-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.commerce-grid span,
.pickup-code-box > span,
.pickup-code-box small,
.pickup-redeem p,
.commerce-dispute span {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}

.commerce-grid strong {
  font-size: 14px;
  color: var(--text-1);
}

.pickup-code-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--teal-100);
  background: var(--teal-50);
}

.pickup-code-box > strong {
  font-size: 28px;
  letter-spacing: 0.16em;
  color: var(--teal-700);
}

.commerce-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pickup-redeem {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.pickup-redeem p,
.commerce-dispute span {
  margin: 0;
}

.pickup-redeem__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.commerce-dispute {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.commerce-actions :deep(.el-button),
.pickup-code-box :deep(.el-button),
.pickup-redeem__row :deep(.el-button),
.commerce-dispute :deep(.el-button) {
  width: auto;
  margin-left: 0;
}

.admin-resolution {
  padding: 10px;
  border: 1px solid var(--coral-100);
  background: var(--coral-50);
}

.admin-resolution > div {
  display: flex;
  gap: 8px;
}

.commerce-actions :deep(.el-button) {
  width: 100%;
}

.pickup-redeem :deep(.el-select) {
  width: 100%;
}

.commerce-dispute :deep(.el-button) {
  justify-content: flex-start;
  padding-left: 0;
  color: var(--coral-600);
}
</style>
