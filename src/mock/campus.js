/**
 * 校园基础信息（河南新华电脑学院 · 东校区）
 * 来源：学校官网「来校路线」与「校园风光」公开信息，仅用于演示。
 * 官网：http://www.hnxhdn.com/tg/cclx/
 */
export const CAMPUS = {
  school: '河南新华电脑学院',
  campus: '东校区',
  address: '河南省郑州市中原区郑上路776号',
  phone: '0371-66655579',
  site: 'www.hnxhdn.com',
  transit: '地铁 10 号线郑州西站 → 11 路三十里铺西方向 · 建设西路小李庄',
  // 官网校园风光中出现的地标，用于失物招领、论坛与地点选择
  places: [
    'A栋',
    'B栋',
    '学生超市',
    '食堂',
    '宿舍',
    '浴室',
    '洗衣房',
    '操场',
    '篮球场',
    '快递驿站',
    '校门口',
  ],
  pickups: [
    'A栋一楼大厅',
    '学生超市门口',
    '食堂门口',
    '宿舍楼下',
    '快递驿站',
    '东门打印店',
  ],
}

export const CAMPUS_LABEL = `${CAMPUS.school} · ${CAMPUS.campus}`

export const CAMPUS_CONTACT = `${CAMPUS.address} · ${CAMPUS.phone}`
