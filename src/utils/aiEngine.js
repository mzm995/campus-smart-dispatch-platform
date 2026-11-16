/**
 * 校园智能调度平台 · 本地 AI 能力层（演示版）
 * ---------------------------------------------------------------------------
 * 当前作为 DeepSeek 真实模型调用失败时的本地降级层。
 * 演示版用「规则引擎 + 模板生成」模拟同一套输入输出契约，因此页面无需改动即可
 * 平滑替换为真实接口：意图解析 / 文案生成 / 特征匹配 / 论坛匹配 四个能力单元。
 */
import { clamp, overlap, uid, WEEK_CN, dateOfWeekday } from './format'
import { CAMPUS } from '@/mock/campus'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ==========================================================================
   场景元信息
   ========================================================================== */
export const SCENE_META = {
  classroom: {
    key: 'classroom',
    name: '教室借用',
    short: '借教室',
    route: '/classroom',
    icon: 'School',
    tone: 'brand',
    tagline: '说清人数、时段和设备，AI 帮你找空闲场所',
    desc: '自动匹配 A/B 栋空闲教室、会议室、报告厅与特色场地，推荐理由可追溯',
    keywords: ['教室', '投影', '空调', '麦克风', '空教室', '自习', '开会', '座位'],
  },
  lostfound: {
    key: 'lostfound',
    name: '失物招领',
    short: '找失物',
    route: '/lostfound',
    icon: 'Search',
    tone: 'teal',
    tagline: '丢东西或捡到东西，AI 生成文案并双向匹配',
    desc: '按物品特征双向比对，联系方式默认脱敏展示',
    keywords: ['丢失', '捡到', '招领', '寻物', '校园卡', '钥匙', '耳机', '水杯'],
  },
  groupbuy: {
    key: 'groupbuy',
    name: '拼单集市',
    short: '去拼单',
    route: '/groupbuy',
    icon: 'ShoppingCart',
    tone: 'amber',
    tagline: '发起拼单，实时进度，满员或到点自动提醒',
    desc: '凑人、凑单、凑满减，进度与截止时间一目了然',
    keywords: ['拼单', '拼团', '团购', '凑单', '一起买', '满减', '奶茶'],
  },
  forum: {
    key: 'forum',
    name: '校园论坛',
    short: '逛论坛',
    route: '/forum',
    icon: 'ChatDotRound',
    tone: 'coral',
    tagline: '发帖求助、分享讨论，AI 帮你想标题、找同频帖',
    desc: '校园话题一站讨论，AI 生成标题标签并推荐相似帖',
    keywords: ['论坛', '发帖', '求助', '讨论', '分享', '吐槽', '组队', '招新'],
  },
}

export const SCENE_LIST = Object.values(SCENE_META)

export function sceneMeta(key) {
  return SCENE_META[key] || null
}

/* ==========================================================================
   1. 意图识别
   ========================================================================== */
const SCENE_WEIGHTS = {
  classroom: {
    教室: 4,
    空教室: 6,
    投影: 3,
    空调: 2,
    麦克风: 3,
    讲台: 2,
    白板: 2,
    座位: 3,
    坐: 1,
    自习: 3,
    开会: 2,
    班会: 3,
    讲座: 3,
    答辩: 3,
    培训: 2,
    借用: 2,
    借: 1,
    报告厅: 4,
    会议室: 6,
    场地: 4,
    场所: 4,
  },
  lostfound: {
    丢: 4,
    丢了: 5,
    丢失: 5,
    找不到: 4,
    捡到: 5,
    捡: 3,
    拾到: 5,
    失物: 5,
    招领: 5,
    寻物: 5,
    认领: 4,
    校园卡: 3,
    饭卡: 3,
    钥匙: 3,
    耳机: 3,
    水杯: 3,
    钱包: 3,
    雨伞: 3,
    身份证: 3,
    学生证: 3,
    充电宝: 3,
    眼镜: 3,
  },
  groupbuy: {
    拼单: 6,
    拼团: 6,
    团购: 5,
    凑单: 5,
    集单: 5,
    一起买: 4,
    满减: 4,
    拼: 2,
    凑: 2,
    单价: 2,
    人份: 2,
    奶茶: 2,
    咖啡: 2,
    外卖: 2,
    水果: 2,
    零食: 2,
    打印: 2,
    蛋糕: 2,
    炸鸡: 2,
  },
  forum: {
    论坛: 8,
    发帖: 7,
    帖子: 6,
    求助: 4,
    想问: 3,
    问问: 3,
    请问: 2,
    有没有人: 4,
    有没有: 2,
    怎么办: 3,
    讨论: 4,
    分享: 3,
    吐槽: 4,
    组队: 4,
    搭子: 4,
    招新: 4,
    活动: 2,
    兼职: 3,
    考研: 2,
    选课: 2,
    期末: 2,
    食堂: 2,
    快递: 2,
    超市: 4,
    营业: 3,
    几点: 3,
    关门: 3,
    回复: 3,
    评论: 3,
    楼主: 4,
    A栋: 2,
    B栋: 2,
    自习: 3,
    求推荐: 6,
    推荐: 3,
    闲置: 7,
    二手: 6,
    出售: 5,
    转让: 5,
    求购: 5,
    夜跑: 6,
    跑步: 5,
    有人: 2,
    一起: 2,
    开放时间: 5,
    知道: 3,
    几点: 2,
    暑假: 2,
  },
}

function scoreScenes(text) {
  const scores = {}
  Object.entries(SCENE_WEIGHTS).forEach(([scene, weights]) => {
    let score = 0
    Object.entries(weights).forEach(([kw, w]) => {
      if (text.includes(kw)) score += w
    })
    scores[scene] = score
  })
  return scores
}

export function detectScene(text) {
  const scores = scoreScenes(text || '')
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [scene, score] = entries[0] || ['unknown', 0]
  if (!text || score < 3) return { scene: 'unknown', scores, score }
  return { scene, scores, score }
}

/* ==========================================================================
   2. 要素抽取
   ========================================================================== */
const BUILDINGS = [
  ...CAMPUS.places,
  '教学楼',
  '求实楼',
  '明德楼',
  '博学楼',
  '笃行楼',
  '实验楼',
  '综合楼',
  '学术报告厅',
  '会议室',
  '报告厅',
  '东校区',
  '西校区',
]

/** 旧楼栋名统一归并到 A 栋，报告厅别名归并 */
const normalizePlace = (value) => {
  if (!value) return ''
  if (['教学楼', '求实楼', '明德楼', '博学楼', '笃行楼', '实验楼', '综合楼'].includes(value)) return 'A栋'
  if (value === '学术报告厅') return '报告厅'
  return value
}

const EQUIPMENTS = ['投影', '空调', '一体机', '电脑', '麦克风', '音响', '白板', '插座', '录播', '视频会议', '舞台灯光', '台球桌', '电竞椅', '千兆网络']

const ITEMS = [
  '校园卡',
  '饭卡',
  '钥匙',
  '耳机',
  '水杯',
  '钱包',
  '雨伞',
  '身份证',
  '学生证',
  '手机',
  '书包',
  '眼镜',
  '充电宝',
  '笔记本电脑',
  '平板',
]

const COLORS = ['黑色', '白色', '蓝色', '红色', '绿色', '灰色', '黄色', '粉色', '银色', '金色', '透明']

const PURPOSES = ['班会', '开会', '讲座', '面试', '研讨', '自习', '排练', '答辩', '培训', '社团活动', '宣讲']

const PRODUCTS = ['纸箱', '桶装水', '抽纸', '纸巾', '奶茶', '咖啡', '水果', '零食', '打印', '资料', '文具', '快递']


function firstMatch(text, words) {
  return words.find((w) => text.includes(w)) || ''
}

export function extractTime(text) {
  const result = { day: null, dayText: '', start: '', end: '', slotText: '', part: '' }

  const weekMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const weekMatch = text.match(/(?:周|星期)([一二三四五六日天1-7])/)
  if (weekMatch) {
    const raw = weekMatch[1]
    result.day = weekMap[raw] || Number(raw) || null
    result.dayText = result.day ? `周${['一', '二', '三', '四', '五', '六', '日'][result.day - 1]}` : ''
  } else if (text.includes('后天')) {
    const base = new Date()
    base.setDate(base.getDate() + 2)
    result.day = base.getDay() === 0 ? 7 : base.getDay()
    result.dayText = '后天'
  } else if (text.includes('明天')) {
    const base = new Date()
    base.setDate(base.getDate() + 1)
    result.day = base.getDay() === 0 ? 7 : base.getDay()
    result.dayText = '明天'
  } else if (text.includes('今天') || text.includes('今日')) {
    const base = new Date()
    result.day = base.getDay() === 0 ? 7 : base.getDay()
    result.dayText = '今天'
  }

  const part = firstMatch(text, ['上午', '下午', '晚上', '中午', '早上'])
  result.part = part
  const range = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:-|~|—|–|到|至)\s*(\d{1,2})\s*[:：]\s*(\d{2})/)
  if (range) {
    result.start = `${range[1].padStart(2, '0')}:${range[2]}`
    result.end = `${range[3].padStart(2, '0')}:${range[4]}`
  } else {
    const hour = text.match(/(\d{1,2})\s*点(?:到\s*(\d{1,2})\s*点)?/)
    if (hour) {
      let h = Number(hour[1])
      if (part === '下午' || part === '晚上') {
        if (h < 12) h += 12
      }
      const endH = hour[2] ? Number(hour[2]) + (part === '下午' || part === '晚上' ? 12 : 0) : h + 2
      result.start = `${String(h).padStart(2, '0')}:00`
      result.end = `${String(Math.min(endH, 23)).padStart(2, '0')}:00`
    } else if (part === '上午' || part === '早上') {
      result.start = '09:00'
      result.end = '11:00'
    } else if (part === '中午') {
      result.start = '12:00'
      result.end = '14:00'
    } else if (part === '下午') {
      result.start = '14:00'
      result.end = '16:00'
    } else if (part === '晚上') {
      result.start = '18:00'
      result.end = '20:00'
    }
  }
  if (result.start && result.end) result.slotText = `${result.start}–${result.end}`
  return result
}

function extractClassroom(text) {
  const t = extractTime(text)
  const capMatch = text.match(/(\d{1,3})\s*(?:人|位|个座|座)/)
  const equipment = EQUIPMENTS.filter((e) => text.includes(e))
  let kind = firstMatch(text, ['会议室', '报告厅', '台球教室', '电竞教室', '实训室']) || ''
  if (kind === '台球教室') kind = '台球室'
  if (kind === '电竞教室') kind = '电竞室'
  const building = ['会议室', '报告厅'].includes(kind) ? '' : normalizePlace(firstMatch(text, BUILDINGS))
  const purpose = firstMatch(text, PURPOSES)
  const fields = []
  fields.push({
    key: 'time',
    label: '使用时段',
    value: t.start ? `${resultDayLabel(t)} ${t.start}–${t.end}` : '',
    type: 'text',
    required: true,
  })
  fields.push({
    key: 'capacity',
    label: '容纳人数',
    value: capMatch ? `${capMatch[1]} 人` : '',
    type: 'number',
    required: true,
  })
  fields.push({
    key: 'equipment',
    label: '设备要求',
    value: equipment.join('、'),
    type: 'tags',
    required: false,
  })
  fields.push({ key: 'kind', label: '场地类型', value: kind, type: 'text', required: false })
  fields.push({
    key: 'building',
    label: '优先地点',
    value: building,
    type: 'text',
    required: false,
  })
  fields.push({ key: 'purpose', label: '用途', value: purpose, type: 'text', required: false })
  return {
    fields,
    missing: fields.filter((f) => f.required && !f.value).map((f) => f.label),
    slots: { ...t, capacity: capMatch ? Number(capMatch[1]) : null, equipment, building, purpose, kind },
  }
}

function resultDayLabel(t) {
  if (t.dayText) return t.dayText
  if (t.day) return WEEK_CN[t.day % 7]
  return ''
}

function extractLostfound(text) {
  const isFound = /捡到|捡|拾到|拾取|招领|认领/.test(text) && !/丢|丢失|找不到/.test(text)
  const type = isFound ? 'found' : 'lost'
  const item = firstMatch(text, ITEMS)
  const color = firstMatch(text, COLORS)
  const place = normalizePlace(firstMatch(text, BUILDINGS))
  const part = firstMatch(text, ['今天', '昨天', '前天', '上午', '下午', '晚上', '中午'])
  const descMatch = text.match(/(?:里面有|里面有|特征是|描述[:：]?|补充[:：]?)([^。；;]{2,40})/)
  const fields = [
    { key: 'type', label: '信息类型', value: type === 'found' ? '招领（我捡到的）' : '寻物（我丢失的）', type: 'text', required: true },
    { key: 'item', label: '物品名称', value: item, type: 'text', required: true },
    { key: 'color', label: '颜色特征', value: color, type: 'text', required: false },
    { key: 'place', label: '地点', value: place, type: 'text', required: false },
    { key: 'time', label: '时间', value: part || '', type: 'text', required: false },
    { key: 'detail', label: '补充描述', value: descMatch ? descMatch[1].trim() : '', type: 'text', required: false },
  ]
  return {
    fields,
    missing: fields.filter((f) => f.required && !f.value).map((f) => f.label),
    slots: { type, item, color, place, timeText: part },
  }
}

function extractGroupbuy(text) {
  let product = firstMatch(text, PRODUCTS)
  if (!product) {
    const m = text.match(/(?:一起|拼)([\u4e00-\u9fa5]{2,6})(?:，|,|。|$|吧|吗)/)
    if (m) product = m[1]
  }
  const priceMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|块钱)/)
  const targetMatch = text.match(/(\d{1,3})\s*(?:人|杯|份|单|个)/)
  const time = extractTime(text)
  const pickup = firstMatch(text, [...CAMPUS.pickups, '校门口', '东门', '南门', 'B栋门口'])
  const fields = [
    { key: 'product', label: '拼单商品', value: product, type: 'text', required: true },
    { key: 'price', label: '单价', value: priceMatch ? `¥${priceMatch[1]}` : '', type: 'text', required: false },
    { key: 'target', label: '目标人数', value: targetMatch ? `${targetMatch[1]} 人` : '', type: 'number', required: true },
    { key: 'deadline', label: '截止时间', value: time.dayText || time.part || '', type: 'text', required: false },
    { key: 'pickup', label: '取货地点', value: pickup, type: 'text', required: false },
  ]
  return {
    fields,
    missing: fields.filter((f) => f.required && !f.value).map((f) => f.label),
    slots: {
      product,
      price: priceMatch ? Number(priceMatch[1]) : null,
      target: targetMatch ? Number(targetMatch[1]) : null,
      timeText: time.dayText || time.part || '',
      pickup,
    },
  }
}

export const FORUM_CATEGORIES = ['求助问答', '校园分享', '活动招募', '二手闲置', '闲聊灌水']

const FORUM_CATEGORY_HINTS = [
  { category: '二手闲置', words: ['闲置', '二手', '出售', '出闲置', '转让', '收一个', '求购', '小刀'] },
  { category: '活动招募', words: ['招募', '招新', '组队', '搭子', '约跑', '夜跑', '比赛', '活动', '报名'] },
  { category: '校园分享', words: ['分享', '攻略', '测评', '推荐', '安利', '整理', '经验', '打卡'] },
  { category: '闲聊灌水', words: ['吐槽', '闲聊', '聊天', '日常', '报个', '进度', '无聊'] },
  { category: '求助问答', words: ['求助', '怎么办', '有没有', '谁知道', '请问', '想问', '求推荐', '帮忙', '解答'] },
]

const FORUM_TAG_MAP = {
  A栋: '自习',
  B栋: '自习',
  自习: '自习',
  教室: '自习',
  食堂: '食堂',
  美食: '食堂',
  快递: '快递',
  选课: '选课',
  期末: '期末',
  AIGC: 'AI',
  人工智能: 'AI',
  AI: 'AI',
  兼职: '兼职',
  考研: '考研',
  摄影: '摄影',
  夜跑: '夜跑',
  跑步: '夜跑',
  二手: '二手',
  闲置: '二手',
  打印: '推荐',
  推荐: '推荐',
  组队: '组队',
  招新: '活动',
  活动: '活动',
  宿舍: '生活',
}

export function inferForumCategory(text = '') {
  const value = String(text || '')
  for (const hint of FORUM_CATEGORY_HINTS) {
    if (hint.words.some((w) => value.includes(w))) return hint.category
  }
  return '求助问答'
}

export function inferForumTags(text = '', limit = 3) {
  const value = String(text || '')
  const tags = []
  Object.entries(FORUM_TAG_MAP).forEach(([keyword, tag]) => {
    if (value.includes(keyword) && !tags.includes(tag)) tags.push(tag)
  })
  return tags.slice(0, limit)
}

function buildForumTitle(text, category) {
  let core = String(text || '')
    .replace(/^(我想|我想问|想问一下|想问|请问一下|请问|求问|求|有没有人知道|有没有人|有没有|谁能|可以)/, '')
    .replace(/[。！？!?，,；;：:]+$/g, '')
    .trim()
  if (!core) core = '想和大家聊聊这件事'
  if (core.length > 22) core = `${core.slice(0, 22)}…`
  const suffix = {
    求助问答: '，求解答',
    校园分享: '｜经验分享',
    活动招募: '｜组队中',
    二手闲置: '｜可小刀',
    闲聊灌水: '',
  }[category]
  if (!suffix) return core.slice(0, 28)
  if (category === '求助问答' && /[？?]$/.test(core)) return core
  return `${core.replace(/[？?]$/, '')}${suffix}`.slice(0, 30)
}

export function buildForumDraft(raw = '') {
  const text = String(raw || '').trim()
  const category = inferForumCategory(text)
  const tags = inferForumTags(`${text} ${category}`)
  const title = buildForumTitle(text, category)
  const closing = {
    求助问答: '有了解情况的同学欢迎在评论区回复，我会及时更新进展。',
    校园分享: '整理出来供大家参考，欢迎补充和纠正。',
    活动招募: '想参加的同学回帖或私信我，报名截止前会统一确认时间和地点。',
    二手闲置: '可约在东门或宿舍楼下自提，支持当面验货，先到先得。',
    闲聊灌水: '欢迎在评论区一起聊聊，理性讨论、友善交流。',
  }[category]
  const body = text ? `${text}${/[。！？!?]$/.test(text) ? '' : '。'}` : ''
  const tagLine = tags.length ? `\n\n#${tags.join(' #')}` : ''
  const content = `${body}\n\n${closing}${tagLine}`.trim()
  return { title, category, tags, content }
}

function extractForum(text) {
  const draft = buildForumDraft(text)
  const fields = [
    { key: 'category', label: '帖子分类', value: draft.category, type: 'select', options: FORUM_CATEGORIES, required: true },
    { key: 'title', label: '帖子标题', value: draft.title, type: 'text', required: true },
    { key: 'content', label: '正文内容', value: draft.content, type: 'textarea', required: true },
    { key: 'tags', label: '标签', value: draft.tags.join('、'), type: 'text', required: false },
  ]
  return {
    fields,
    missing: [],
    slots: { ...draft, tags: draft.tags.join(',') },
  }
}

/* ==========================================================================
   3. 解析主入口
   ========================================================================== */
export function parseRequirement(rawText) {
  const text = String(rawText || '').trim()
  const { scene, scores, score } = detectScene(text)

  if (!text) {
    return {
      ok: false,
      scene: 'unknown',
      confidence: 0,
      summary: '还没有输入内容。试着说说你遇到的小麻烦，比如「周三下午想借一间能投影的教室」。',
      fields: [],
      missing: [],
      suggestions: ['周三下午想借一间能投影、坐 30 人的教室', '在A栋二楼大厅丢了蓝色水杯，帮忙找找', '宿舍楼下拼奶茶，15 元一杯，还差 3 人'],
      scores,
    }
  }

  if (scene === 'unknown') {
    return {
      ok: false,
      scene: 'unknown',
      confidence: 0.32,
      summary: '我还没太确定这属于哪一类校园需求。可以换个说法，也可以直接从下面选择一个场景继续。',
      fields: [],
      missing: [],
      suggestions: ['周三下午借教室', '捡到一张校园卡', '拼单买奶茶', 'A栋晚自习教室周末开放吗'],
      scores,
    }
  }

  const extractor = {
    classroom: extractClassroom,
    lostfound: extractLostfound,
    groupbuy: extractGroupbuy,
    forum: extractForum,
  }[scene]

  const extracted = extractor(text)
  const filled = extracted.fields.filter((f) => f.value).length
  let confidence = 0.56 + Math.min(filled, 4) * 0.075 + (score >= 8 ? 0.08 : score >= 4 ? 0.04 : 0)
  confidence -= extracted.missing.length * 0.06
  confidence = clamp(Number(confidence.toFixed(2)), 0.45, 0.97)

  const summary = buildSummary(scene, extracted, text)
  const meta = SCENE_META[scene]

  return {
    ok: true,
    scene,
    sceneName: meta.name,
    confidence,
    summary,
    fields: extracted.fields,
    missing: extracted.missing,
    slots: extracted.slots,
    suggestions: [],
    route: meta.route,
    routeQuery: buildRouteQuery(scene, extracted.slots),
    actionHint: ACTION_HINT[scene],
    tags: extracted.fields.filter((f) => f.value).map((f) => `${f.label}：${f.value}`),
    scores,
    engine: '校园智能调度平台本地意图解析引擎 v1.2',
  }
}

const ACTION_HINT = {
  classroom: '确认后，我会在候选场所里按「满足硬性条件 → 就近 → 好评」排序，推荐 2–3 处并说明理由。',
  lostfound: '确认后，我会生成一段规范的招领文案，并把信息同步到失物招领广场参与双向匹配。',
  groupbuy: '确认后，我会创建拼单并实时跟踪进度，满员或到截止时间前 2 小时自动提醒你。',
  forum: '确认后，我会生成一条规范帖子（标题 + 正文 + 标签），发布后自动推荐相似讨论并通知相关同学。',
}

function buildSummary(scene, extracted, text) {
  const s = extracted.slots
  if (scene === 'classroom') {
    const time = s.dayText ? `${s.dayText} ${s.slotText || '（时段待补充）'}` : s.slotText || '近期'
    const cap = s.capacity ? `能坐 ${s.capacity} 人` : '未说明人数'
    const eq = s.equipment?.length ? `、配备${s.equipment.join('、')}` : '、设备不限'
    const place = s.building ? `，地点优先「${s.building}」` : ''
    const kind = s.kind || '教室'
    return `你想在${time}借一间${cap}${eq}的${kind}${place}。`
  }
  if (scene === 'lostfound') {
    const type = s.type === 'found' ? '捡到' : '丢失'
    const item = s.item || '一件物品'
    const color = s.color ? `（${s.color}）` : ''
    const place = s.place ? `在${s.place}附近` : ''
    return `你${place}${type}了${color}${item}，我会帮你生成规范文案并自动匹配线索。`
  }
  if (scene === 'groupbuy') {
    const product = s.product || '商品'
    const price = s.price ? `，单价约 ¥${s.price}` : ''
    const target = s.target ? `，目标 ${s.target} 人` : ''
    return `你想发起「${product}」拼单${price}${target}，我会帮你盯住进度并在截止前提醒。`
  }
  if (scene === 'forum') {
    return `你想在校园论坛发一条「${s.category || '求助问答'}」帖子：${s.title || '（标题待补充）'}。我会帮你补全正文与标签，发布后自动推荐相似讨论。`
  }
  return `我理解了你的需求：${text}`
}

function buildRouteQuery(scene, s) {
  if (scene === 'classroom') {
    return {
      from: 'ai',
      day: s.day || '',
      start: s.start || '',
      end: s.end || '',
      capacity: s.capacity || '',
      equipment: (s.equipment || []).join(','),
      building: s.building || '',
      kind: s.kind || '',
      purpose: s.purpose || '',
    }
  }
  if (scene === 'lostfound') {
    return {
      from: 'ai',
      type: s.type || 'lost',
      item: s.item || '',
      color: s.color || '',
      place: s.place || '',
      time: s.timeText || '',
    }
  }
  if (scene === 'groupbuy') {
    return {
      from: 'ai',
      create: '1',
      product: s.product || '',
      price: s.price || '',
      target: s.target || '',
      pickup: s.pickup || '',
      time: s.timeText || '',
    }
  }
  if (scene === 'forum') {
    return {
      from: 'ai',
      create: '1',
      title: s.title || '',
      category: s.category || '',
      content: s.content || '',
      tags: s.tags || '',
    }
  }
  return { from: 'ai' }
}

/* ==========================================================================
   4. 能力单元：教室智能匹配
   ========================================================================== */
export function roomFreeAt(room, day, start, end) {
  if (!day || !start || !end) return true
  const busy = (room.busy || []).filter((b) => Number(b.day) === Number(day))
  return !busy.some((b) => overlap(start, end, b.start, b.end))
}

export function roomFreeSlots(room, day) {
  const dayBusy = (room.busy || [])
    .filter((b) => Number(b.day) === Number(day))
    .sort((a, b) => a.start.localeCompare(b.start))
  const slots = []
  let cursor = '08:00'
  dayBusy.forEach((b) => {
    if (b.start > cursor) slots.push({ start: cursor, end: b.start })
    if (b.end > cursor) cursor = b.end
  })
  if (cursor < '21:00') slots.push({ start: cursor, end: '21:00' })
  return slots
}

export function recommendClassrooms(rooms, criteria = {}) {
  const { day, start, end, capacity, equipment = [], building, campus, kind } = criteria
  const need = Number(capacity) || 0
  const results = []

  rooms.forEach((room) => {
    if (kind && room.kind !== kind) return
    if (building && room.building !== building) return
    if (need && room.capacity < need) return
    if (!roomFreeAt(room, day, start, end)) return
    const missing = equipment.filter((e) => !room.equipment.includes(e))
    if (missing.length) return

    let score = 0
    const reasons = []

    if (need) {
      score += 30
      if (room.capacity > need * 1.8) score -= 14
      if (room.capacity > need * 2.5) score -= 16
      reasons.push(`可容纳 ${room.capacity} 人，满足 ${need} 人需求`)
    } else if (room.capacity) {
      score += 16
      reasons.push(`可容纳 ${room.capacity} 人`)
    } else {
      score += 8
      reasons.push('容量待核，提交后需管理员确认')
    }

    if (day && start && end) {
      score += 30
      reasons.push(`${WEEK_CN[Number(day) % 7]} ${start}–${end} 时段空闲`)
    }

    if (equipment.length) {
      score += 9 * equipment.length
      reasons.push(`配备${equipment.join('、')}`)
    }

    if (building && room.building === building) {
      score += 16
      reasons.push(`位于${room.building}，离你更近`)
    } else if (campus && room.campus === campus) {
      score += 8
      reasons.push(`位于${room.campus}`)
    }

    if (!kind && ['会议室', '报告厅', '台球室', '电竞室'].includes(room.kind)) {
      score -= 35
    }

    score += room.rating * 4
    if (room.rating >= 4.7) reasons.push(`近 30 天好评率 ${Math.round(room.rating * 20)}%`)

    score += Math.max(0, 22 - room.distance / 18)
    reasons.push(`距 A 栋约 ${room.distance}m`)

    results.push({
      room,
      score,
      matchScore: clamp(Math.round(56 + score * 0.42), 62, 99),
      reasons: reasons.slice(0, 4),
    })
  })

  return results.sort((a, b) => b.score - a.score).slice(0, 3)
}

/* ==========================================================================
   5. 能力单元：失物文案生成 + 特征匹配
   ========================================================================== */
const LOST_CATEGORY_RULES = [
  { category: '证件卡类', words: ['卡', '证', '一卡通', '饭卡', '身份证', '学生证', '校园卡'] },
  {
    category: '数码产品',
    words: ['手机', '耳机', '电脑', '平板', '充电', '数据线', '相机', '手表', 'U盘', '键盘', '鼠标', '耳机盒'],
  },
  { category: '学习用品', words: ['书', '笔', '笔记本', '资料', '文具', '教材', '书包', '绘图'] },
  {
    category: '生活用品',
    words: ['伞', '杯', '水壶', '衣服', '外套', '钥匙', '钱包', '围巾', '帽', '眼镜', '口红', '护肤', '雨披'],
  },
]

/** 根据物品名称推断失物招领类别，用于 AI 生成文案时自动归类 */
export function inferLostCategory(item = '') {
  const text = String(item)
  for (const rule of LOST_CATEGORY_RULES) {
    if (rule.words.some((w) => text.includes(w))) return rule.category
  }
  return '其他'
}

export function buildLostfoundCopy(form = {}) {
  const isFound = form.type === 'found'
  const item = form.item || '物品'
  const name = item.replace(/^(一张|一个|一副|一把|一部|一只|一件)/, '')
  // 物品名称里已含颜色时不再重复拼接，避免出现「黑色黑色雨伞」
  const color = form.color && !name.includes(form.color) ? form.color : ''
  const place = form.place || '校园内'
  const timeText = form.time || '今天'
  const detail = form.detail ? `，${form.detail}` : ''
  const title = isFound ? `【招领】在${place}捡到${color}${name}` : `【寻物】在${place}丢失${color}${name}`

  const content = isFound
    ? `今天在${place}${timeText === '今天' ? '' : `（${timeText}）`}捡到一份${color}${name}${detail}。\n物品现由本人保管，失主请携带能证明物品归属的信息（如卡面信息、特征描述）联系我认领。\n为避免冒领，联系方式已做脱敏处理，可在站内发起沟通。`
    : `今天在${place}${timeText === '今天' ? '' : `（${timeText}）`}不慎丢失一份${color}${name}${detail}，对我很重要。\n如果同学捡到，麻烦联系我，愿意当面致谢。\n联系方式已做脱敏处理，可在站内发起沟通。`

  const tags = [color, name, place, isFound ? '招领' : '寻物'].filter(Boolean)
  return {
    title,
    content,
    tags,
    category: inferLostCategory(name),
    keptSecret: true,
    aiGenerated: true,
    engine: '校园智能调度平台文案生成能力 · 模板 v1.3',
  }
}

export function scoreLostPair(a, b) {
  if (!a || !b || a.type === b.type) return { score: 0, reasons: [] }
  let score = 0
  const reasons = []
  if (a.item && b.item && a.item === b.item) {
    score += 45
    reasons.push('物品类别一致')
  } else if (a.item && b.item && (a.item.includes(b.item) || b.item.includes(a.item))) {
    score += 30
    reasons.push('物品类别相近')
  }
  if (a.color && b.color && a.color === b.color) {
    score += 18
    reasons.push('颜色特征一致')
  }
  if (a.place && b.place && a.place === b.place) {
    score += 18
    reasons.push('地点相同')
  }
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (Math.abs(ta - tb) < 1000 * 60 * 60 * 48) {
    score += 8
    reasons.push('时间相近（48 小时内）')
  }
  return { score: clamp(score, 0, 96), reasons }
}

/* ==========================================================================
   6. 能力单元：论坛内容生成与相似匹配
   ========================================================================== */
/* ==========================================================================
   6. 能力单元：论坛内容生成与相似匹配
   ========================================================================== */
export function scoreForumPost(post, draft = {}) {
  const haystack = `${post.title || ''} ${post.content || ''} ${(post.tags || []).join(' ')} ${post.category || ''}`
  const reasons = []
  let score = 18

  if (draft.category && post.category === draft.category) {
    score += 30
    reasons.push(`同属「${post.category}」分类`)
  }

  const draftTags = draft.tags || []
  const sharedTags = draftTags.filter((t) => (post.tags || []).includes(t))
  if (sharedTags.length) {
    score += sharedTags.length * 14
    reasons.push(`共同标签：${sharedTags.join('、')}`)
  }

  const words = String(draft.title || '')
    .split(/[\s，。！？、,.!?]+/)
    .filter((w) => w.length >= 2)
    .slice(0, 8)
  const hitWords = words.filter((w) => haystack.includes(w))
  if (hitWords.length) {
    score += Math.min(24, hitWords.length * 8)
    reasons.push(`标题关键词命中：${hitWords.slice(0, 3).join('、')}`)
  }

  if (!reasons.length) reasons.push('近期热门讨论')
  return {
    ...post,
    score: Math.min(98, Math.round(score)),
    reasons,
  }
}

export function similarForumPosts(posts = [], draft = {}, limit = 3) {
  return posts
    .filter((p) => p.id !== draft.id)
    .map((p) => scoreForumPost(p, draft))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function summarizeForumReplies(post = {}) {
  const replies = post.replies || []
  const count = replies.length
  if (!count) {
    return {
      count: 0,
      text: '还没有同学回复。建议补充时间、地点或具体需求，AI 也可以帮你润色一下帖子。',
      solved: Boolean(post.solved),
    }
  }
  const names = [...new Set(replies.map((r) => r.author).filter(Boolean))]
  const hasOfficial = replies.some((r) =>
    ['管理员', '高级管理员', '论坛坛主', '论坛版主'].includes(r.authorRole),
  )
  const keyPoints = replies
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 2)
    .map((r) => (r.content || '').replace(/[。！？!?].*$/, ''))
    .filter(Boolean)
  return {
    count,
    text: `${count} 条回复来自 ${names.slice(0, 3).join('、')}${names.length > 3 ? ' 等同学' : ''}${
      hasOfficial ? '，其中有管理员/坛主参与' : ''
    }。${keyPoints.length ? `重点提到：${keyPoints.join('；')}。` : ''}${
      post.solved ? '楼主已标记解决，可先看高赞回复。' : '可按热度查看回复，或继续追问。'
    }`,
    solved: Boolean(post.solved),
  }
}

/* ==========================================================================
   7. 通知文案
   ========================================================================== */
export const NOTICE_TYPES = {
  match: { label: '匹配', tone: 'brand', icon: 'MagicStick' },
  status: { label: '状态', tone: 'teal', icon: 'CircleCheck' },
  deadline: { label: '提醒', tone: 'amber', icon: 'AlarmClock' },
  reply: { label: '回复', tone: 'coral', icon: 'ChatDotRound' },
  system: { label: '系统', tone: 'slate', icon: 'Bell' },
}

export function buildNotice(type, payload = {}) {
  const base = { id: uid('nt'), type, time: new Date().toISOString(), read: false, important: false }
  if (type === 'match') {
    return { ...base, title: payload.title || 'AI 找到新的匹配线索', content: payload.content || '', link: payload.link, important: true }
  }
  if (type === 'status') {
    return { ...base, title: payload.title || '申请状态已更新', content: payload.content || '', link: payload.link }
  }
  if (type === 'deadline') {
    return { ...base, title: payload.title || '拼单即将截止', content: payload.content || '', link: payload.link, important: true }
  }
  if (type === 'reply') {
    return { ...base, title: payload.title || '你的帖子收到新回复', content: payload.content || '', link: payload.link, important: true }
  }
  return { ...base, title: payload.title || '系统通知', content: payload.content || '', link: payload.link }
}
