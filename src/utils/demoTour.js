export const DEMO_ROLE_ORDER = [
  'student',
  'monitor',
  'forum_moderator',
  'admin',
  'super_admin',
]

export const DEMO_TOURS = [
  {
    key: 'lostfound',
    title: '失物认领与悬赏',
    duration: '约 90 秒',
    summary: '从 AI 匹配、认领核验到领取和打赏，展示完整的状态流转。',
    steps: [
      {
        roleKey: 'student',
        path: '/lostfound',
        title: '查看悬赏与认领进度',
        desc: '以林小满身份进入广场，查看内置蓝色保温杯悬赏、AI 匹配和待处理提示。',
      },
      {
        roleKey: 'forum_moderator',
        path: '/lostfound',
        title: '完成失主认领与打赏',
        desc: '切换到苏念，打开蓝色水杯招领，确认领取并记录 ¥10 打赏。',
      },
      {
        roleKey: 'student',
        path: '/notifications',
        title: '验证通知按账号隔离',
        desc: '切回林小满，只显示与她发布内容相关的通知。',
      },
    ],
  },
  {
    key: 'groupbuy',
    title: '拼单跑腿闭环',
    duration: '约 80 秒',
    summary: '展示跑腿发布、接单冲突保护、送达和发起人结算。',
    steps: [
      {
        roleKey: 'monitor',
        path: '/groupbuy/gb_002',
        title: '查看同一单的待接跑腿',
        desc: '以陈子昂身份打开纸箱拼单，确认跑腿任务仍为待接单，并说明发起人不能接自己的任务。',
      },
      {
        roleKey: 'student',
        path: '/groupbuy/gb_002',
        title: '接取同一单跑腿',
        desc: '切换到林小满，在同一个纸箱拼单中接取跑腿，状态从待接单进入进行中。',
      },
      {
        roleKey: 'student',
        path: '/groupbuy/gb_002',
        title: '同一单送达等待确认',
        desc: '仍在纸箱拼单中点击“已送达，等待确认”，说明接单人不能自行结算小费。',
      },
      {
        roleKey: 'monitor',
        path: '/groupbuy/gb_002',
        title: '发起人确认并结算',
        desc: '切回陈子昂，在同一单中确认完成并结算 ¥8 跑腿小费。',
      },
    ],
  },
  {
    key: 'permissions',
    title: '角色权限与同步',
    duration: '约 60 秒',
    summary: '验证普通用户、管理员与高级管理员之间的可见范围和操作边界。',
    steps: [
      {
        roleKey: 'student',
        path: '/',
        title: '学生视角',
        desc: '检查侧栏没有教室借用和系统控制台，只保留公共场景与个人记录。',
      },
      {
        roleKey: 'monitor',
        path: '/classroom',
        title: '班委申请教室',
        desc: '班委拥有本人申请权限，但不能自行审批。',
      },
      {
        roleKey: 'super_admin',
        path: '/system',
        title: '高级管理员控制台',
        desc: '展示账号权限、场景配置、模型接入、冲突恢复与审计能力。',
      },
    ],
  },
]
