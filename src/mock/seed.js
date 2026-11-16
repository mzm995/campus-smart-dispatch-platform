import dayjs from 'dayjs'

/**
 * 演示种子数据
 * 说明：全部为模拟数据，不含任何真实师生隐私信息。
 */

const now = dayjs()
const iso = (d) => d.toISOString()
const hoursAgo = (h) => iso(now.subtract(h, 'hour'))
const daysLater = (d, hour = 20) => iso(now.add(d, 'day').hour(hour).minute(0).second(0))

/* ==========================================================================
   用户
   ========================================================================== */
export const demoAccounts = [
  { studentNo: '2024010123', name: '林小满', role: '学生', college: 'AI+人工智能', bio: '爱拍照，也爱在论坛帮助同学' },
  { studentNo: '2023020456', name: '陈子昂', role: '班委', college: '电子竞技', bio: '负责班级事务，常年借教室、组织活动' },
  { studentNo: '2022050789', name: '苏念', role: '论坛坛主', college: 'AI+影视', bio: '校园论坛内容运营，喜欢张罗线上线下讨论' },
  { studentNo: '2021000001', name: '周老师', role: '管理员', college: '学生工作处', bio: '校园资源调度与论坛内容管理员' },
]

/* ==========================================================================
   教室资源
   ========================================================================== */
const room = (
  id,
  code,
  building,
  campus,
  floor,
  capacity,
  equipment,
  rating,
  distance,
  tone,
  busy,
  extra = {},
) => ({
  id,
  code,
  building,
  campus,
  floor,
  capacity,
  equipment,
  rating,
  distance,
  tone,
  busy,
  kind: extra.kind || '教室',
  className: extra.className || '',
  headTeacher: extra.headTeacher || '',
  teacher: extra.teacher || '',
  computer: extra.computer || '',
})

/* 东校区教学场所（数据源：10.26 教学场所表）
 * 桌椅为空时容量记为 0，页面显示「容量待核」；投影/空调按教学场所基础配置补充，
 * 电脑列含「一体机」时额外计入一体机，仅用于演示筛选。 */
const venueRows = [
  ['1109', 1, 0, '', 'AI+新媒体电商与短视频运营2604', '白振冰', '张亚宁'],
  ['1111', 1, 48, '3台一体机', 'AI+新媒体电商与短视频运营2605', '白振冰', '康金歌'],
  ['1113', 1, 41, '8台一体机', 'A1+人工智能应用工程师2602', '李鑫', '任晶晶'],
  ['1114', 1, 57, '5台一体机', 'AI+互联网应用全能2604', '李凯', '杨晓燕'],
  ['1116', 1, 57, '6台一体机', 'AI+新媒体电商与短视频运营2603', '马家骥', '舒挺'],
  ['1117', 1, 41, '', 'AI+新媒体与短视频运营2602', '张俊锋', '张雅博'],
  ['1118', 1, 0, '', '数媒2401', '石俊杰', '王小宽'],
  ['1206', 2, 16, '', '电商实训', '', '袁笙淋'],
  ['1207', 2, 49, '7台一体机', '短期', '李德翠、黄子戌', ''],
  ['1208', 2, 0, '0', 'AI+形象设计与短剧运营2501、AI+形象设计与短剧运营2503', '白振冰', '狄亚亚、金库'],
  ['1209', 2, 47, '6台 一体机', 'AI+电商与新媒体运营2502、AI+电商与新媒体运营2501', '王小宽', '刘贺娟'],
  ['1210', 2, 0, '0', '护肤实训', '白振冰', '谢秋月'],
  ['1211', 2, 57, '16台一体机', 'AI+互联网应用全能2601', '张政', '谢俊卿'],
  ['1212西', 2, 24, '', 'AI+全媒体影视动漫设计师2601', '张俊锋', '谢俊卿'],
  ['1212东', 2, 24, '3台一体机', '数字媒体艺术设计师2501', '李凯', '张亚宁'],
  ['1213', 2, 0, '0', '电商实训', '', '袁笙淋'],
  ['1215', 2, 5, '', '电商实训', '', '袁笙淋'],
  ['1216', 2, 37, '', 'AI+全媒体影视动漫设计师2501、AI+全媒体影视动漫设计师2502', '李鑫、白振冰', '张雅博'],
  ['1217', 2, 40, '40台一体机', '电商实训', '', '曹亚辉'],
  ['1218', 2, 41, '1台一体机', 'AI+互联网应用全能2602', '李鑫', '常瑞霞'],
  ['1219', 2, 20, 'AIGC2503', 'AI漫剧实训', '', '华视影业'],
  ['1220', 2, 46, '4台一体机', 'AI+新媒体与短视频运营2601', '李凯', '张蒙蒙'],
  ['1221', 2, 32, '', '影视实训', '', '薛常行'],
  ['1222', 2, 46, '', '', '', ''],
  ['1223', 2, 20, '', '影视实训', '', '薛常行'],
  ['1305', 3, 49, '7台 一体机', '', '', ''],
  ['1307', 3, 3, '0', '', '', ''],
  ['1310', 3, 41, '', '大数据与人工智能2502', '白振冰', '张齐'],
  ['1312', 3, 41, '', 'A1+人工智能应用工程师2601', '石俊杰', '张全伟'],
  ['1313', 3, 5, '', '人工智能实训', '', '韩国涛'],
  ['1314', 3, 49, '', '', '', '王宝娟'],
  ['1315', 3, 55, '', '', '', ''],
  ['1316', 3, 49, '', 'AI+互联网应用全能班2504', '张俊锋', '张蒙蒙'],
  ['1317', 3, 49, '13台一体机', '', '', ''],
  ['1320', 3, 43, '', '互联网应用技术2501、AI+互联网应用全能班2503', '张政', '常瑞霞'],
  ['1321', 3, 65, '', '三维实训', '张俊锋、齐敏生', '武永波'],
]

const venueSlots = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['12:00', '14:00'],
  ['14:00', '16:00'],
  ['16:00', '18:00'],
  ['18:00', '20:00'],
]

const venueTone = (index) => ['brand', 'teal', 'amber', 'slate', 'coral'][index % 5]

const venueEquipment = (pc) => {
  const list = ['投影', '空调']
  if (pc.includes('一体机')) list.push('一体机', '电脑')
  else if (pc && pc !== '0') list.push('电脑')
  return list
}

const venueBusy = (row, index) => {
  if (!row[4]) return []
  const day = (index % 5) + 1
  const slot = venueSlots[(index * 2) % venueSlots.length]
  return [{ day, start: slot[0], end: slot[1], label: '班级上课' }]
}

const teachingRooms = venueRows.map((row, index) => {
  const [code, floor, capacity, pc, className, headTeacher, teacher] = row
  return room(
    `cr_${code}`,
    code,
    'A栋',
    '东校区',
    floor,
    capacity,
    venueEquipment(pc),
    Number((4.6 + (index % 4) * 0.1).toFixed(1)),
    90 + floor * 120 + (index % 5) * 20,
    venueTone(index),
    venueBusy(row, index),
    {
      kind: className.includes('实训') ? '实训室' : '教室',
      className,
      headTeacher,
      teacher,
      computer: pc,
    },
  )
})

const specialRooms = [
  room('cr_meeting', '会议室', 'A栋', '东校区', 3, 30, ['投影', '空调', '麦克风', '视频会议', '白板'], 4.9, 300, 'brand', [
    { day: 3, start: '14:00', end: '16:00', label: '部门例会' },
  ], { kind: '会议室', headTeacher: '教务处', teacher: '信息中心' }),
  room('cr_hall', '报告厅', 'A栋', '东校区', 1, 200, ['投影', '音响', '麦克风', '空调', '录播', '舞台灯光'], 4.9, 120, 'teal', [
    { day: 5, start: '18:00', end: '20:00', label: '校园活动彩排' },
  ], { kind: '报告厅', headTeacher: '学生工作处', teacher: '宣传中心' }),
  room('cr_billiards', '台球教室', 'B栋', '东校区', 1, 40, ['台球桌', '空调'], 4.7, 340, 'amber', [
    { day: 2, start: '16:00', end: '18:00', label: '台球社训练' },
  ], { kind: '台球室', className: '台球社', headTeacher: '李教练', teacher: '李教练' }),
  room('cr_esports1', '电竞教室 1', 'B栋', '东校区', 2, 48, ['电脑', '电竞椅', '投影', '空调', '千兆网络'], 4.8, 360, 'brand', [
    { day: 3, start: '18:00', end: '20:00', label: '电竞社训练赛' },
  ], { kind: '电竞室', className: '电竞社', headTeacher: '王教练', teacher: '王教练', computer: '48 台电竞主机' }),
  room('cr_esports2', '电竞教室 2', 'B栋', '东校区', 2, 40, ['电脑', '电竞椅', '投影', '空调', '千兆网络'], 4.8, 380, 'teal', [
    { day: 4, start: '18:00', end: '20:00', label: '校队训练' },
  ], { kind: '电竞室', className: '电竞社', headTeacher: '王教练', teacher: '王教练', computer: '40 台电竞主机' }),
  room('cr_esports3', '电竞教室 3', 'B栋', '东校区', 2, 32, ['电脑', '电竞椅', '投影', '空调', '千兆网络'], 4.6, 400, 'coral', [
    { day: 5, start: '16:00', end: '18:00', label: '社团开放日' },
  ], { kind: '电竞室', className: '电竞社', headTeacher: '王教练', teacher: '王教练', computer: '32 台电竞主机' }),
]

export const classrooms = [...teachingRooms, ...specialRooms]

/* ==========================================================================
   失物招领
   ========================================================================== */
export const lostfoundPosts = [
  {
    id: 'lf_001',
    type: 'found',
    title: '【招领】在A栋二楼大厅捡到蓝色水杯',
    item: '水杯',
    category: '生活用品',
    color: '蓝色',
    place: 'A栋',
    timeText: '今天下午',
    description: '蓝色保温杯，杯身有一张贴纸，杯盖外侧有轻微磕碰。已交至A栋一楼值班室，可凭特征认领。',
    contact: '站内联系 · 林小满',
    contactMasked: '林**',
    aiGenerated: true,
    status: 'claimed_pending',
    tone: 'teal',
    createdAt: hoursAgo(3),
    postNo: 'LF20261030-018',
    tags: ['蓝色', '水杯', 'A栋二楼大厅'],
    claims: [{
      id: 'claim_seed_found_001',
      kind: 'found_claim',
      helperId: 'u_moderator_su',
      claimantId: 'u_moderator_su',
      claimantName: '苏念',
      helperName: '苏念',
      lostPostId: 'lf_002',
      lostPostTitle: '【寻物】在A栋丢了蓝色保温杯',
      mode: 'found_claim',
      description: '保温杯底部有我贴的社团编号贴纸，杯盖边缘有一处磕碰。',
      contact: '站内联系 · 苏念',
      rewardEnabled: true,
      rewardAmount: 10,
      status: 'approved',
      createdAt: hoursAgo(1.5),
      reviewedAt: hoursAgo(1),
    }],
  },
  {
    id: 'lf_002',
    type: 'lost',
    title: '【寻物】在A栋丢了蓝色保温杯',
    item: '水杯',
    category: '生活用品',
    color: '蓝色',
    place: 'A栋',
    timeText: '今天上午',
    description: '蓝色保温杯，杯身有一张社团贴纸，杯盖有磕碰。可能遗落在A栋三楼靠窗的座位。',
    contact: '站内联系 · 苏念',
    contactMasked: '苏**',
    aiGenerated: true,
    status: 'claimed_pending',
    tone: 'amber',
    createdAt: hoursAgo(2),
    postNo: 'LF20261030-021',
    tags: ['蓝色', '水杯', 'A栋二楼大厅'],
    rewardEnabled: true,
    rewardAmount: 10,
    rewardNote: '确认认领后打赏，感谢帮忙保管',
    claims: [],
  },
  {
    id: 'lf_003',
    type: 'found',
    title: '【招领】在食堂门口捡到校园卡',
    item: '校园卡',
    category: '证件卡类',
    color: '白色',
    place: '食堂门口',
    timeText: '今天中午',
    description: '卡面姓名已做打码处理，尾号为 27。请失主描述卡面信息后认领。',
    contact: '站内联系 · 陈子昂',
    contactMasked: '陈**',
    aiGenerated: true,
    status: 'open',
    tone: 'brand',
    createdAt: hoursAgo(6),
    postNo: 'LF20261030-012',
    tags: ['校园卡', '食堂门口', '尾号27'],
  },
  {
    id: 'lf_004',
    type: 'lost',
    title: '【寻物】在操场丢失黑色耳机',
    item: '耳机',
    category: '数码产品',
    color: '黑色',
    place: '操场',
    timeText: '昨天晚上',
    description: '黑色无线耳机，充电盒右下角有一道划痕。最后一次使用是在操场看台。',
    contact: '站内联系 · 赵一鸣',
    contactMasked: '赵**',
    aiGenerated: true,
    status: 'matching',
    tone: 'slate',
    createdAt: hoursAgo(14),
    postNo: 'LF20261029-007',
    tags: ['耳机', '操场', '黑色'],
    rewardEnabled: true,
    rewardAmount: 8,
    rewardNote: '提供有效线索或归还后确认打赏',
    claims: [],
  },
  {
    id: 'lf_005',
    type: 'found',
    title: '【招领】在A栋捡到一串钥匙',
    item: '钥匙',
    category: '生活用品',
    color: '银色',
    place: 'A栋',
    timeText: '昨天下午',
    description: '一串钥匙，共四把，挂着一个红色小挂件。目前由A栋一楼值班室保管。',
    contact: 'A栋值班室',
    contactMasked: '值班室',
    aiGenerated: true,
    status: 'open',
    tone: 'amber',
    createdAt: hoursAgo(20),
    postNo: 'LF20261029-013',
    tags: ['钥匙', 'A栋', '红色挂件'],
  },
  {
    id: 'lf_006',
    type: 'lost',
    title: '【寻物】在A栋丢失银色钥匙串',
    item: '钥匙',
    category: '生活用品',
    color: '银色',
    place: 'A栋',
    timeText: '昨天下午',
    description: '四把钥匙，带红色小挂件，可能是从书包侧袋滑落。',
    contact: '站内联系 · 林小满',
    contactMasked: '林**',
    aiGenerated: true,
    status: 'matching',
    tone: 'coral',
    createdAt: hoursAgo(18),
    postNo: 'LF20261029-016',
    tags: ['钥匙', 'A栋', '银色'],
  },
  {
    id: 'lf_007',
    type: 'found',
    title: '【招领】在学生超市捡到学生证',
    item: '学生证',
    category: '证件卡类',
    color: '蓝色',
    place: '学生超市',
    timeText: '今天上午',
    description: '学生证外壳为蓝色，内页姓名首字为「周」。已交至学生超市收银台，请失主认领。',
    contact: '学生超市收银台',
    contactMasked: '周**',
    aiGenerated: true,
    status: 'open',
    tone: 'teal',
    createdAt: hoursAgo(8),
    postNo: 'LF20261030-009',
    tags: ['学生证', '学生超市'],
  },
  {
    id: 'lf_008',
    type: 'lost',
    title: '【寻物】在B栋丢失白色充电宝',
    item: '充电宝',
    category: '数码产品',
    color: '白色',
    place: 'B栋',
    timeText: '今天上午',
    description: '白色充电宝，表面有一道明显的蓝色胶带标记，容量 20000mAh，可能落在 B栋二楼电竞教室外休息区。',
    contact: '站内联系 · 陈子昂',
    contactMasked: '陈**',
    aiGenerated: true,
    status: 'matching',
    tone: 'slate',
    createdAt: hoursAgo(5),
    postNo: 'LF20261030-015',
    tags: ['充电宝', 'B栋', '白色'],
  },
  {
    id: 'lf_009',
    type: 'found',
    title: '【招领】在篮球场捡到黑色运动水壶',
    item: '水杯',
    category: '生活用品',
    color: '黑色',
    place: '篮球场',
    timeText: '昨天傍晚',
    description: '黑色运动水壶，壶身印有「SPORT」字样，已交给 A栋一楼值班室。',
    contact: 'A栋一楼值班室',
    contactMasked: '器材室',
    aiGenerated: true,
    status: 'open',
    tone: 'brand',
    createdAt: hoursAgo(26),
    postNo: 'LF20261029-002',
    tags: ['水杯', '篮球场', '黑色'],
  },
  {
    id: 'lf_010',
    type: 'lost',
    title: '【寻物】在东门附近丢失雨伞',
    item: '雨伞',
    category: '生活用品',
    color: '透明',
    place: '东门',
    timeText: '前天晚上',
    description: '透明长柄雨伞，伞柄是木质弯钩，伞面有一处小补丁。',
    contact: '站内联系 · 苏念',
    contactMasked: '苏**',
    aiGenerated: true,
    status: 'open',
    tone: 'teal',
    createdAt: hoursAgo(40),
    postNo: 'LF20261028-006',
    tags: ['雨伞', '东门', '透明'],
  },
]

/* ==========================================================================
   拼单集市
   ========================================================================== */
export const groupBuys = [
  {
    id: 'gb_001',
    title: '校门口奶茶拼单，满 10 杯每杯减 1 元',
    product: '珍珠奶茶 / 冰鲜柠檬水',
    category: '饮品',
    unitPrice: 6.5,
    targetCount: 10,
    participants: [
      { name: '林小满', count: 1 },
      { name: '陈子昂', count: 2 },
      { name: '苏念', count: 1 },
      { name: '赵一鸣', count: 1 },
      { name: '周雨桐', count: 1 },
    ],
    deadline: daysLater(2, 20),
    pickup: 'A栋一楼大厅',
    owner: '林小满',
    note: '校门口奶茶店满 10 杯起送：珍珠奶茶 7.5 元、冰鲜柠檬水 4 元，统一按 6.5 元预收，多退少补；21:00 送到 A栋一楼大厅。',
    tone: 'amber',
    createdAt: hoursAgo(9),
    errand: {
      enabled: true,
      tip: 6,
      description: '成团后帮忙从校门口奶茶店取货并送到 A栋一楼大厅',
      status: 'open',
      runnerId: '',
      runnerName: '',
    },
  },
  {
    id: 'gb_002',
    title: '东门快递驿站纸箱拼单，5 元/个',
    product: '五层加厚纸箱',
    category: '生活用品',
    unitPrice: 5,
    targetCount: 8,
    participants: [
      { name: '陈子昂', count: 2 },
      { name: '李思远', count: 1 },
      { name: '吴桐', count: 1 },
    ],
    deadline: daysLater(1, 18),
    pickup: '宿舍楼下',
    owner: '陈子昂',
    note: '东门快递驿站五层加厚纸箱 5 元/个，满 8 个免费送到宿舍楼下；搬宿舍、寄行李都能用。',
    tone: 'brand',
    createdAt: hoursAgo(22),
    errand: {
      enabled: true,
      tip: 8,
      description: '从东门快递驿站取纸箱并送到宿舍楼下',
      status: 'open',
      runnerId: '',
      runnerName: '',
    },
  },
  {
    id: 'gb_003',
    title: '校门口水果摊砂糖橘，5.8 元/斤拼箱',
    product: '砂糖橘',
    category: '生鲜水果',
    unitPrice: 5.8,
    targetCount: 10,
    participants: [
      { name: '苏念', count: 2 },
      { name: '周雨桐', count: 1 },
      { name: '林小满', count: 1 },
      { name: '赵一鸣', count: 2 },
      { name: '吴桐', count: 1 },
      { name: '李思远', count: 1 },
    ],
    deadline: daysLater(1, 21),
    pickup: '宿舍楼下',
    owner: '苏念',
    note: '当季砂糖橘 5.8 元/斤，10 斤起送，按 1 斤 1 份拼；坏果包换，到货后楼下自取。',
    tone: 'teal',
    createdAt: hoursAgo(30),
  },
  {
    id: 'gb_004',
    title: '宿舍桶装水拼单，8 元/桶送到楼下',
    product: '桶装纯净水',
    category: '生活用品',
    unitPrice: 8,
    targetCount: 8,
    participants: [
      { name: '周雨桐', count: 1 },
      { name: '李思远', count: 1 },
      { name: '林小满', count: 1 },
    ],
    deadline: daysLater(1, 22),
    pickup: '宿舍楼下',
    owner: '周雨桐',
    note: '校内水站 18.9L 桶装水 8 元/桶，满 8 桶免配送费；送到宿舍楼下，空桶回收。',
    tone: 'slate',
    createdAt: hoursAgo(4),
  },
  {
    id: 'gb_005',
    title: '宿舍抽纸拼单，10 卷/提只要 9.9',
    product: '抽纸（10 卷装）',
    category: '生活用品',
    unitPrice: 9.9,
    targetCount: 8,
    participants: [
      { name: '苏念', count: 1 },
      { name: '吴桐', count: 1 },
    ],
    deadline: daysLater(3, 18),
    pickup: '宿舍楼下',
    owner: '苏念',
    note: '校内超市 10 卷装抽纸 9.9 元/提，满 8 提送到宿舍楼下；日常消耗品，可以放心囤。',
    tone: 'slate',
    createdAt: hoursAgo(12),
  },
  {
    id: 'gb_006',
    title: '期末资料打印装订，双面 0.15 元/页（已满员）',
    product: '资料打印装订',
    category: '学习用品',
    unitPrice: 6,
    targetCount: 5,
    participants: [
      { name: '陈子昂', count: 1 },
      { name: '林小满', count: 1 },
      { name: '周雨桐', count: 1 },
      { name: '李思远', count: 1 },
      { name: '吴桐', count: 1 },
    ],
    deadline: daysLater(-1, 18),
    pickup: '东门打印店',
    owner: '陈子昂',
    note: '东门打印店双面 0.15 元/页，满 200 页 8 折；每人约 40 页，已满员，统一装订后按名单分发。',
    tone: 'brand',
    createdAt: hoursAgo(52),
  },
]

/* ==========================================================================
   校园论坛
   ========================================================================== */
export const forumCategories = ['全部', '求助问答', '校园分享', '活动招募', '二手闲置', '闲聊灌水']

export const forumTagOptions = [
  'A栋', 'B栋', '学生超市', '食堂', '宿舍', '快递', '操场', 'AI', 'AIGC',
  '自习', '选课', '期末', '兼职', '考研', '电竞', '摄影', '夜跑',
  '二手', '活动', '组队', '推荐', '求助',
]

export const forumPosts = [
  {
    id: 'fp_001',
    title: 'A栋三楼晚自习教室，插座多吗？',
    category: '求助问答',
    content:
      '准备期末周去A栋晚自习教室泡一天，想问问三楼靠窗的位置插座够不够用？需要自己带插排吗？顺便求一个安静的座位区域推荐。',
    author: '赵一鸣',
    authorRole: '学生',
    avatarTone: 'brand',
    tags: ['A栋', '自习', '期末'],
    likes: 24,
    views: 312,
    solved: true,
    aiGenerated: false,
    createdAt: hoursAgo(2),
    replies: [
      { id: 'fr_001_1', author: '林小满', authorRole: '学生', content: '靠窗那一排基本都有插座，但下午两点后很抢手，建议早点去。', createdAt: hoursAgo(1.6), likes: 6 },
      { id: 'fr_001_2', author: '苏念', authorRole: '论坛坛主', content: '三楼东侧新加了两排插排，不用自己带；西侧还是老样子，插座比较少。', createdAt: hoursAgo(1.2), likes: 9 },
      { id: 'fr_001_3', author: '周老师', authorRole: '管理员', content: 'A栋 8:00 开门，期末周座位紧张，请勿占座，离开超过 30 分钟会清理物品。', createdAt: hoursAgo(0.7), likes: 12 },
    ],
  },
  {
    id: 'fp_002',
    title: '整理了A栋 5 间人少又安静的晚自习教室',
    category: '校园分享',
    content:
      '连续蹲了一周晚自习，整理出 5 间 18:00 之后人少、空调稳定、插座够用的教室：1305、1314、1320、1222、1315。晚自习高峰在 19:00 之后，建议提前占座。',
    author: '林小满',
    authorRole: '学生',
    avatarTone: 'brand',
    tags: ['自习', '教室', '推荐'],
    likes: 56,
    views: 780,
    solved: false,
    aiGenerated: true,
    createdAt: hoursAgo(5),
    replies: [
      { id: 'fr_002_1', author: '顾清禾', authorRole: '学生', content: '太实用了，1305 确实安静，就是有点远。', createdAt: hoursAgo(4.2), likes: 4 },
      { id: 'fr_002_2', author: '陈子昂', authorRole: '班委', content: '补充：其中两间周四晚上有社团活动，20:00 之后才空。', createdAt: hoursAgo(3.5), likes: 7 },
    ],
  },
  {
    id: 'fp_003',
    title: '周五晚「校园夜跑」组队，配速 6 分半，求搭子',
    category: '活动招募',
    content:
      "每周五 19:30 在操场集合，绕校道跑 5 公里，配速 6'30'' 左右，跑完一起拉伸。新手也欢迎，可以慢跑聊天，安全第一。",
    author: '陈子昂',
    authorRole: '班委',
    avatarTone: 'teal',
    tags: ['夜跑', '组队', '活动'],
    likes: 18,
    views: 260,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(8),
    replies: [
      { id: 'fr_003_1', author: '吴桐', authorRole: '学生', content: '算我一个，正好想找个搭子监督。', createdAt: hoursAgo(6), likes: 3 },
      { id: 'fr_003_2', author: '许知野', authorRole: '学生', content: '周五有课到 19:00，晚十分钟到操场可以吗？', createdAt: hoursAgo(5.5), likes: 1 },
    ],
  },
  {
    id: 'fp_004',
    title: '出闲置三脚架，九成新，50 元可小刀',
    category: '二手闲置',
    content:
      '去年买的铝合金三脚架，最高 1.6 米，带云台和收纳袋，只用过三次。东门自提，可当场验货，50 元可小刀。',
    author: '苏念',
    authorRole: '论坛坛主',
    avatarTone: 'coral',
    tags: ['摄影', '二手', '三脚架'],
    likes: 9,
    views: 140,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(26),
    replies: [
      { id: 'fr_004_1', author: '林小满', authorRole: '学生', content: '请问重量多少？想带去拍活动。', createdAt: hoursAgo(20), likes: 2 },
    ],
  },
  {
    id: 'fp_005',
    title: '暑假留校，快递还能寄到学校吗？',
    category: '求助问答',
    content:
      '暑假不回家，想往学校寄几本书，但听说菜鸟驿站会关门。有没有留校的同学知道现在快递怎么收？可以寄到哪个门？',
    author: '吴桐',
    authorRole: '学生',
    avatarTone: 'amber',
    tags: ['快递', '暑假', '求助'],
    likes: 12,
    views: 198,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(3),
    replies: [
      { id: 'fr_005_1', author: '周老师', authorRole: '管理员', content: '暑假期间东门收发室保留值班，工作日 9:00–16:00，寄件前建议先电话确认。', createdAt: hoursAgo(2.2), likes: 8 },
      { id: 'fr_005_2', author: '李思远', authorRole: '学生', content: '我上周寄到东门收发室，能收，就是取件要带学生证。', createdAt: hoursAgo(1.5), likes: 2 },
    ],
  },
  {
    id: 'fp_006',
    title: '食堂一楼新出的砂锅，测评来了（附价格）',
    category: '校园分享',
    content:
      '试了一楼新窗口的三款砂锅：番茄牛腩 15 元、菌菇鸡 13 元、酸菜鱼 16 元。分量够一个男生吃，番茄牛腩汤底最稳，酸菜鱼偏辣。11:30 前去不用排队。',
    author: '李思远',
    authorRole: '学生',
    avatarTone: 'brand',
    tags: ['食堂', '美食', '推荐'],
    likes: 41,
    views: 520,
    solved: false,
    aiGenerated: true,
    createdAt: hoursAgo(36),
    replies: [
      { id: 'fr_006_1', author: '顾清禾', authorRole: '学生', content: '菌菇鸡真的可以，汤很鲜。', createdAt: hoursAgo(30), likes: 5 },
      { id: 'fr_006_2', author: '赵一鸣', authorRole: '学生', content: '酸菜鱼辣度能选吗？不太能吃辣。', createdAt: hoursAgo(28), likes: 1 },
      { id: 'fr_006_3', author: '李思远', authorRole: '学生', content: '可以跟阿姨说少辣，会单独给你舀汤。', createdAt: hoursAgo(27), likes: 4 },
    ],
  },
  {
    id: 'fp_007',
    title: '摄影社招新：本周三晚 7 点，暗房开放体验',
    category: '活动招募',
    content:
      '光影摄影社秋季招新，本周三 19:00 在 A栋 3 楼 1315 面试+作品交流，暗房同时开放体验。零基础也收，带上手机里最满意的一张照片就行。',
    author: '苏念',
    authorRole: '论坛坛主',
    avatarTone: 'coral',
    tags: ['摄影', '招新', '活动'],
    likes: 33,
    views: 460,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(48),
    replies: [
      { id: 'fr_007_1', author: '林小满', authorRole: '学生', content: '已经报名！想问暗房体验需要自带胶卷吗？', createdAt: hoursAgo(40), likes: 3 },
      { id: 'fr_007_2', author: '苏念', authorRole: '论坛坛主', content: '不用，社里提供练习卷，冲印药水也在。', createdAt: hoursAgo(39), likes: 5 },
      { id: 'fr_007_3', author: '沈星回', authorRole: '学生', content: '非本专业可以加吗？', createdAt: hoursAgo(32), likes: 2 },
      { id: 'fr_007_4', author: '苏念', authorRole: '论坛坛主', content: '当然可以，社团不分专业，欢迎来玩。', createdAt: hoursAgo(31), likes: 6 },
    ],
  },
  {
    id: 'fp_008',
    title: '被 AIGC 作业折磨的晚上，来互相报个进度吧',
    category: '闲聊灌水',
    content:
      '第三个 AIGC 案例还剩一半，越做越怀疑人生。大家做到哪了？找个搭子明天一起去 A栋晚自习教室互相监督，别互相放弃。',
    author: '顾清禾',
    authorRole: '学生',
    avatarTone: 'teal',
    tags: ['AIGC', '自习', '闲聊'],
    likes: 27,
    views: 350,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(0.6),
    replies: [
      { id: 'fr_008_1', author: '吴桐', authorRole: '学生', content: '刚跑通第一个案例，你已经很快了。', createdAt: hoursAgo(0.4), likes: 1 },
      { id: 'fr_008_2', author: '赵一鸣', authorRole: '学生', content: 'A栋三楼见，我带了两套案例素材。', createdAt: hoursAgo(0.2), likes: 3 },
    ],
  },
  {
    id: 'fp_009',
    title: '求推荐：东门附近打印店哪家便宜？',
    category: '求助问答',
    content:
      '要打印一本 80 页的课程材料，黑白双面，问一下东门附近哪家价格合适、能当天取？',
    author: '林小满',
    authorRole: '学生',
    avatarTone: 'brand',
    tags: ['打印', '推荐', '东门'],
    likes: 5,
    views: 88,
    solved: false,
    aiGenerated: false,
    createdAt: hoursAgo(0.7),
    replies: [],
  },
]

/* ==========================================================================
   通知中心
   ========================================================================== */
export const notifications = [
  {
    id: 'nt_001',
    type: 'match',
    title: 'AI 找到 2 条失物匹配线索',
    content: '「A栋蓝色水杯」与你发布的寻物信息相似度 91%，已同步到失物招领广场。',
    time: hoursAgo(0.5),
    read: false,
    important: true,
    link: '/lostfound',
  },
  {
    id: 'nt_002',
    type: 'status',
    title: '教室申请已通过',
    content: '你申请的「A栋 1222 · 周三 15:00–17:00」已通过审核，请按时使用并保持教室整洁。',
    time: hoursAgo(2),
    read: false,
    important: false,
    link: '/classroom',
  },
  {
    id: 'nt_003',
    type: 'deadline',
    title: '拼单「校门口奶茶」还差 4 杯',
    content: '距离截止还有 1 天 3 小时，满 10 杯可享第二杯半价，记得提醒同学接龙。',
    time: hoursAgo(3),
    read: false,
    important: true,
    link: '/groupbuy',
  },
  {
    id: 'nt_004',
    type: 'reply',
    title: '论坛帖子收到 2 条新回复',
    content: '你发布的「整理了A栋 5 间人少又安静的晚自习教室」收到 2 条新回复，AI 已生成回复摘要。',
    time: hoursAgo(5),
    read: false,
    important: true,
    link: '/forum/fp_002',
  },
  {
    id: 'nt_005',
    type: 'system',
    title: 'AI 使用记录已更新',
    content: '第二轮迭代对比已同步到 AI 使用记录页，包含提示词调整与解析准确率变化。',
    time: hoursAgo(9),
    read: true,
    important: false,
    link: '/ai-record',
  },
  {
    id: 'nt_006',
    type: 'status',
    title: '你发布的招领信息已通过审核',
    content: '「在A栋二楼大厅捡到蓝色水杯」已展示在失物招领广场，联系方式已自动脱敏。',
    time: hoursAgo(12),
    read: true,
    important: false,
    link: '/lostfound',
  },
  {
    id: 'nt_007',
    type: 'deadline',
    title: '拼单「周末水果团购」即将满员',
    content: '当前 7/8 份，还差 1 份成团，截止时间为明天 21:00。',
    time: hoursAgo(18),
    read: true,
    important: false,
    link: '/groupbuy',
  },
  {
    id: 'nt_008',
    type: 'system',
    title: '欢迎使用校园智能调度平台',
    content: '试试在首页输入一句话：「周三下午想借一间能投影、坐 30 人的教室」。',
    time: hoursAgo(30),
    read: true,
    important: false,
    link: '/',
  },
]

/* ==========================================================================
   需求单 / 调度记录
   ========================================================================== */
export const dispatchRecords = [
  {
    id: 'dp_001',
    raw: '周三下午想借一间能投影、坐 30 人的教室开班会',
    scene: 'classroom',
    confidence: 0.93,
    summary: 'A栋 1222 已通过审核 · 周三 15:00–17:00',
    status: '已完成',
    createdAt: hoursAgo(2),
  },
  {
    id: 'dp_002',
    raw: '在A栋丢了一个蓝色水杯，杯身有社团贴纸',
    scene: 'lostfound',
    confidence: 0.89,
    summary: 'AI 匹配到 1 条高相似招领线索（91%）',
    status: '匹配成功',
    createdAt: hoursAgo(3),
  },
  {
    id: 'dp_003',
    raw: '校门口奶茶拼单，6.5 一杯，还差 4 杯',
    scene: 'groupbuy',
    confidence: 0.91,
    summary: '拼单已创建 · 当前 6/10，截止后天 20:00',
    status: '进行中',
    createdAt: hoursAgo(9),
  },
  {
    id: 'dp_004',
    raw: '学生超市周末营业到几点',
    scene: 'forum',
    confidence: 0.88,
    summary: 'AI 生成「求助问答」帖子 · 推荐 2 条相似讨论',
    status: '待处理',
    createdAt: hoursAgo(12),
  },
  {
    id: 'dp_005',
    raw: 'A栋有没有能坐 60 人、带投影的教室',
    scene: 'classroom',
    confidence: 0.94,
    summary: '推荐 1321（65 人 · 投影 · 空调）等 3 间',
    status: '已完成',
    createdAt: hoursAgo(26),
  },
  {
    id: 'dp_006',
    raw: '在A栋捡到一串钥匙，帮忙发个招领',
    scene: 'lostfound',
    confidence: 0.9,
    summary: '已生成招领文案并发布，匹配到 2 条寻物线索',
    status: '已完成',
    createdAt: hoursAgo(30),
  },
]

/* ==========================================================================
   AI 使用记录
   ========================================================================== */
export const aiRecordData = {
  tools: [
    { name: 'DeepSeek V4.1 Flash', version: 'deepseek-flash', purpose: '需求解析 / 文案生成 / 论坛摘要', calls: 0, status: 'API Key 配置后启用真实调用' },
    { name: 'Vue 3 + Vite', version: 'Vue 3.5 / Vite 6', purpose: '前端单页应用', calls: 0, status: '已使用' },
    { name: 'Element Plus', version: '2.11', purpose: '组件库', calls: 0, status: '已使用' },
    { name: '本地规则引擎', version: 'v1.2', purpose: '模型未配置或请求失败时降级', calls: 214, status: '降级备用' },
  ],
  prompts: [
    {
      id: 'pm_01',
      title: '意图解析 · 系统提示词',
      scene: '全场景',
      content:
        '你是校园事务调度助手。请从用户的一句话中识别所属场景（教室借用/失物招领/拼单集市/校园论坛），抽取时间、地点、人数、设备、物品等要素，输出 JSON：{scene, confidence, fields[], missing[]}。不确定时降低 confidence 并给出澄清问题，禁止编造未提供的信息。',
      note: '约束输出结构，保证前端「解析结果可视可改」',
    },
    {
      id: 'pm_02',
      title: '失物招领 · 文案生成',
      scene: '失物招领',
      content:
        '请根据物品特征生成 80 字以内的校园失物招领文案，包含物品、颜色、地点、时间与认领方式。联系方式用「站内联系」代替，禁止展示真实姓名与电话；语气友善、信息准确。',
      note: '对应非功能需求中的隐私与合规约束',
    },
    {
      id: 'pm_03',
      title: '教室推荐 · 理由生成',
      scene: '教室借用',
      content:
        '根据候选教室的容量、设备、空闲时段、楼层与距离，输出 2–3 条推荐语。每条必须包含可核验的事实（如“15:00–17:00 空闲”“配备投影”），不要使用主观夸张描述。',
      note: '让推荐理由可追溯，降低“黑箱感”',
    },
    {
      id: 'pm_04',
      title: '论坛发帖 · 标题与标签生成',
      scene: '校园论坛',
      content:
        '根据用户的一句话草稿，识别帖子分类（求助问答/校园分享/活动招募/二手闲置/闲聊灌水），生成 20 字以内的标题、80–150 字正文和 3 个标签。语气自然口语化，不夸大、不编造事实；涉及姓名、电话等个人信息时自动脱敏并提醒用户。',
      note: '论坛场景的生成 + 分类能力，发布前可编辑',
    },
  ],
  iterations: [
    {
      round: 1,
      date: '2026-11-06',
      title: '首轮内测（12 位同学）',
      before: { accuracy: 0.68, avgLatency: '3.8s', satisfaction: 0.72, issues: ['场景误判到拼单', '时段抽取丢失“下午”'] },
      after: { accuracy: 0.84, avgLatency: '2.6s', satisfaction: 0.86, issues: ['长句仍会漏抽设备'] },
      changes: [
        '把场景关键词改为加权匹配，降低“拼”字对拼单场景的误触发',
        '时间抽取增加「上午/下午/晚上」默认时段兜底',
        '解析结果改为强制回显确认，允许人工修正字段',
      ],
    },
    {
      round: 2,
      date: '2026-11-08',
      title: '第二轮迭代（模拟 30 位试用用户 / 20 条反馈）',
      before: { accuracy: 0.84, avgLatency: '2.6s', satisfaction: 0.86, issues: ['推荐理由偏模板化', '失物匹配只看类别'] },
      after: { accuracy: 0.91, avgLatency: '2.3s', satisfaction: 0.93, issues: ['对多物品描述的拆解仍待优化'] },
      changes: [
        '推荐理由改为「事实 + 距离 + 好评」三段式，并支持一键查看教室详情',
        '失物匹配加入颜色、地点、48 小时时间窗三个维度的加权相似度',
        '新增低置信度提示与“人工核对”入口，避免误导',
        '移动端补全底部导航与筛选抽屉，核心流程 3 步内完成',
      ],
    },
  ],
  stats: {
    totalCalls: 214,
    successRate: 0.91,
    avgLatency: '2.3s',
    tokens: '38.6k',
    cost: '¥0.00（免费额度）',
    daily: [18, 26, 21, 34, 29, 41, 45],
  },
  compliance: [
    '不采集真实姓名以外的个人敏感信息，学号统一脱敏展示',
    '失物招领联系方式默认打码，仅在站内沟通',
    '所有 AI 生成内容均带「AI 生成」标识',
    '演示数据全部为模拟数据，不使用真实师生隐私数据',
    'DeepSeek API Key 只在服务端加密保存，模型请求由后端统一发起',
  ],
}

/* ==========================================================================
   通用选项
   ========================================================================== */
export const classroomFilters = {
  buildings: ['全部楼栋', 'A栋', 'B栋'],
  kinds: ['全部类型', '教室', '实训室', '会议室', '报告厅', '台球室', '电竞室'],
  equipment: ['投影', '空调', '一体机', '电脑', '麦克风', '音响', '白板', '录播', '视频会议', '舞台灯光', '台球桌', '电竞椅', '千兆网络'],
  slots: [
    { label: '08:00–10:00', start: '08:00', end: '10:00' },
    { label: '10:00–12:00', start: '10:00', end: '12:00' },
    { label: '12:00–14:00', start: '12:00', end: '14:00' },
    { label: '14:00–16:00', start: '14:00', end: '16:00' },
    { label: '16:00–18:00', start: '16:00', end: '18:00' },
    { label: '18:00–20:00', start: '18:00', end: '20:00' },
  ],
  purposes: ['班会', '开会', '讲座', '面试', '研讨', '自习', '排练', '答辩', '培训'],
}

export const lostfoundCategories = ['全部类别', '证件卡类', '数码产品', '生活用品', '学习用品', '其他']

export const groupbuyCategories = ['全部', '饮品', '生鲜水果', '学习用品', '生活用品', '其他']

export const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
