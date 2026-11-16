const COMMON_ACTIONS = [
  'lostfound.use',
  'groupbuy.use',
  'forum.publish',
  'forum.reply',
  'notifications.use',
  'aiRecords.use',
]

const COMMON_MODULES = {
  dashboard: true,
  classroom: false,
  lostfound: true,
  groupbuy: true,
  forum: true,
  notifications: true,
  aiRecords: true,
  admin: false,
}

const ROLE_POLICIES = {
  student: {
    label: '学生',
    actions: COMMON_ACTIONS,
    scopes: {
      notifications: 'own',
      aiRecords: 'own',
      classroom: 'none',
      publishedContent: 'shared',
    },
  },
  monitor: {
    label: '班委',
    actions: [...COMMON_ACTIONS, 'classroom.apply'],
    scopes: {
      notifications: 'own',
      aiRecords: 'own',
      classroom: 'own',
      publishedContent: 'shared',
    },
  },
  forum_moderator: {
    label: '论坛坛主',
    actions: [...COMMON_ACTIONS, 'forum.delete.any', 'forum.moderate'],
    scopes: {
      notifications: 'own',
      aiRecords: 'own',
      classroom: 'none',
      publishedContent: 'shared',
    },
  },
  admin: {
    label: '管理员',
    actions: [
      ...COMMON_ACTIONS,
      'classroom.apply',
      'classroom.review',
      'classroom.view.any',
      'forum.delete.any',
      'forum.moderate',
      'notifications.view.any',
      'aiRecords.view.any',
      'content.manage.any',
    ],
    scopes: {
      notifications: 'own',
      aiRecords: 'own',
      classroom: 'all',
      publishedContent: 'shared',
    },
  },
  super_admin: {
    label: '高级管理员',
    actions: [
      ...COMMON_ACTIONS,
      'classroom.apply',
      'classroom.review',
      'classroom.view.any',
      'forum.delete.any',
      'forum.moderate',
      'notifications.view.any',
      'aiRecords.view.any',
      'content.manage.any',
      'system.settings',
      'users.manage',
      'ai.configure',
    ],
    scopes: {
      notifications: 'own',
      aiRecords: 'own',
      classroom: 'all',
      publishedContent: 'shared',
    },
  },
}

function buildPermissions(roleKey) {
  const policy = ROLE_POLICIES[roleKey] || ROLE_POLICIES.student
  const actionSet = new Set(policy.actions)
  const modules = {
    ...COMMON_MODULES,
    classroom: actionSet.has('classroom.apply') || actionSet.has('classroom.review'),
    admin: actionSet.has('system.settings') || actionSet.has('users.manage'),
  }

  return {
    roleKey: ROLE_POLICIES[roleKey] ? roleKey : 'student',
    roleLabel: policy.label,
    modules,
    actions: Object.fromEntries([...actionSet].map((action) => [action, true])),
    scopes: { ...policy.scopes },
    canViewOtherUsers:
      actionSet.has('notifications.view.any') || actionSet.has('aiRecords.view.any'),
  }
}

export function permissionsForRole(roleKey) {
  return buildPermissions(roleKey)
}

export function hasPermission(actor, permission) {
  if (!actor || !permission) return false
  return Boolean(actor.permissions?.actions?.[permission])
}

export function canAccessModule(actor, moduleKey) {
  if (!actor || !moduleKey) return false
  return Boolean(actor.permissions?.modules?.[moduleKey])
}

export function resolveDataScope(actor, kind, requestedScope = 'own') {
  const scope = requestedScope === 'all' ? 'all' : 'own'
  if (scope === 'own') return 'own'
  const permission = kind === 'notifications'
    ? 'notifications.view.any'
    : kind === 'aiRecords'
      ? 'aiRecords.view.any'
      : ''
  return hasPermission(actor, permission) ? 'all' : null
}

export function isOwner(actor, record, fields = ['ownerId', 'authorId', 'applicantId']) {
  if (!actor || !record) return false
  if (fields.some((field) => record[field] && record[field] === actor.id)) return true
  if (record.ownerUserId && record.ownerUserId === actor.id) return true
  if (record.authorUserId && record.authorUserId === actor.id) return true
  return false
}

export const SHARED_RESOURCE_PERMISSIONS = {
  classroom: 'classroom.apply',
  lostfound: 'lostfound.use',
  groupbuy: 'groupbuy.use',
  forum: 'forum.publish',
  notifications: 'notifications.use',
  dispatch: 'aiRecords.use',
}
