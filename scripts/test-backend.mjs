import { spawn } from 'node:child_process'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.TEST_PORT || 3101)
const databasePath = path.join(
  projectDir,
  '.tmp',
  `backend-test-${Date.now()}.sqlite`,
)
const base = `http://127.0.0.1:${port}/api`
let passed = 0

const server = spawn(process.execPath, [path.join(projectDir, 'server', 'index.js')], {
  cwd: projectDir,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_PATH: databasePath,
    REGISTRATION_CODE: 'invite-test',
    LOGIN_RATE_LIMIT: '200',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

server.stdout.on('data', (chunk) => process.stdout.write(String(chunk)))
server.stderr.on('data', (chunk) => process.stderr.write(String(chunk)))

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
}

async function request(pathname, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json() }
}

async function register(name, password = 'Testpass123') {
  return request('/auth/register', {
    method: 'POST',
    body: { name, password, registrationCode: 'invite-test' },
  })
}

async function login(name, studentNo, password = '123456') {
  return request('/auth/login', {
    method: 'POST',
    body: { name, studentNo, password },
  })
}

async function uploadImage(token, bytes, contentType = 'image/png') {
  const response = await fetch(`${base}/uploads/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: bytes,
  })
  return { status: response.status, json: await response.json() }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`)
      if (response.ok) return
    } catch {
      // 服务尚未监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Backend did not become ready')
}

try {
  await waitForServer()

  const health = await request('/health')
  assert(health.status === 200 && health.json.data.database.connected, 'health failed')
  assert(
    health.json.data.database.studentNumbers.nextStudentNo === '21040001',
    'student number did not start at 21040001',
  )

  const publicBefore = await request('/auth/demo-accounts')
  assert(publicBefore.json.data.accounts.length === 5, 'built-in account seed failed')
  assert(
    publicBefore.json.data.accounts.some((account) => account.roleKey === 'super_admin'),
    'super admin missing',
  )

  const longName = await register('一二三四五六七八九十一')
  assert(
    longName.status === 422 && longName.json.error.code === 'NAME_TOO_LONG',
    'name limit not enforced',
  )
  const missingPassword = await request('/auth/register', {
    method: 'POST',
    body: { name: '无密码人物' },
  })
  assert(
    missingPassword.status === 422 &&
      missingPassword.json.error.code === 'PASSWORD_REQUIRED',
    'account creation without password was accepted',
  )
  const missingInvite = await request('/auth/register', {
    method: 'POST',
    body: { name: '无邀请码人物', password: 'SafePass123' },
  })
  assert(
    missingInvite.status === 403 &&
      missingInvite.json.error.code === 'REGISTRATION_CODE_INVALID',
    'registration invite code was not enforced',
  )
  const weakPassword = await register('弱密码人物', '12345678')
  assert(
    weakPassword.status === 422 &&
      weakPassword.json.error.code === 'PASSWORD_TOO_WEAK',
    'weak password was accepted',
  )

  const first = await register('自动甲', 'Custom123')
  assert(
    first.status === 200 && first.json.data.user.studentNo === '21040001',
    'first generated number wrong',
  )
  const duplicateName = await register('自动甲', 'SafePass456')
  assert(
    duplicateName.status === 409 && duplicateName.json.error.code === 'NAME_TAKEN',
    'duplicate active name was accepted',
  )
  const firstId = first.json.data.user.id
  assert(
    first.json.data.studentNumbers.nextStudentNo === '21040002',
    'next number did not increment',
  )

  const second = await register('顺序乙')
  const third = await register('顺序丙')
  assert(second.json.data.user.studentNo === '21040002', 'second number wrong')
  assert(third.json.data.user.studentNo === '21040003', 'third number wrong')

  const customAccounts = await request('/auth/demo-accounts')
  assert(
    customAccounts.json.data.accounts.filter((account) => account.source === 'custom').length ===
      3,
    'created people were not retained in login account list',
  )

  const demoStudent = await login('林小满', '2024010123', '123456')
  assert(demoStudent.status === 200, 'built-in demo password 123456 failed')
  const demoStudentToken = demoStudent.json.data.token
  assert(
    demoStudent.json.data.user.permissions?.modules?.classroom === false &&
      demoStudent.json.data.user.permissions?.actions?.['forum.publish'] === true,
    'student permission payload is incorrect',
  )

  const monitor = await login('陈子昂', '2023020456', '123456')
  const monitorToken = monitor.json.data.token
  assert(
    monitor.json.data.user.permissions?.actions?.['classroom.apply'] === true &&
      !monitor.json.data.user.permissions?.actions?.['classroom.review'],
    'monitor classroom permissions are incorrect',
  )

  const moderator = await login('苏念', '2022050789', '123456')
  const moderatorToken = moderator.json.data.token
  assert(
    moderator.json.data.user.role === '论坛坛主' &&
      moderator.json.data.user.permissions?.actions?.['forum.delete.any'] === true,
    'forum moderator permissions are incorrect',
  )

  const wrongPassword = await login('自动甲', '21040001', 'Wrong999')
  assert(
    wrongPassword.status === 401 && wrongPassword.json.error.code === 'INVALID_CREDENTIALS',
    'wrong password was accepted',
  )
  const loginFirst = await login('自动甲', '21040001', 'Custom123')
  assert(loginFirst.status === 200, 'existing account login failed')
  const firstToken = loginFirst.json.data.token
  const mismatch = await login('另一个姓名', '21040001', 'Custom123')
  assert(
    mismatch.status === 401 && mismatch.json.error.code === 'INVALID_CREDENTIALS',
    'identity mismatch not rejected',
  )
  const missing = await login('不存在', '29999999', '123456')
  assert(
    missing.status === 401 && missing.json.error.code === 'INVALID_CREDENTIALS',
    'login unexpectedly created an account',
  )
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
    'base64',
  )
  const uploadedImage = await uploadImage(firstToken, pngBytes)
  assert(
    uploadedImage.status === 201 &&
      /^\/api\/uploads\/images\/[a-f0-9-]+\.png$/.test(uploadedImage.json.data.url),
    'independent image upload failed',
  )
  const imageResponse = await fetch(`http://127.0.0.1:${port}${uploadedImage.json.data.url}`)
  assert(
    imageResponse.status === 200 &&
      imageResponse.headers.get('content-type') === 'image/png',
    'uploaded image was not publicly readable',
  )
  const invalidAvatar = await request('/me', {
    method: 'PATCH',
    token: firstToken,
    body: { avatarUrl: 'https://example.com/avatar.png' },
  })
  assert(
    invalidAvatar.status === 422 &&
      invalidAvatar.json.error.code === 'AVATAR_URL_INVALID',
    'unsafe avatar URL was accepted',
  )
  const avatarUpdate = await request('/me', {
    method: 'PATCH',
    token: firstToken,
    body: { avatarUrl: uploadedImage.json.data.url },
  })
  assert(
    avatarUpdate.status === 200 &&
      avatarUpdate.json.data.user.avatarUrl === uploadedImage.json.data.url,
    'avatar update failed',
  )
  const avatarMe = await request('/auth/me', { token: firstToken })
  assert(
    avatarMe.json.data.user.avatarUrl === uploadedImage.json.data.url,
    'avatar update was not persisted',
  )
  const invalidImage = await uploadImage(firstToken, Buffer.from('not-an-image'), 'text/plain')
  assert(
    invalidImage.status === 415 && invalidImage.json.error.code === 'IMAGE_TYPE_UNSUPPORTED',
    'invalid image MIME type was accepted',
  )
  const spoofedImage = await uploadImage(
    firstToken,
    Buffer.from('not-a-real-png'),
    'image/png',
  )
  assert(
    spoofedImage.status === 422 &&
      spoofedImage.json.error.code === 'IMAGE_INVALID',
    'image content signature was not validated',
  )
  const oversizedImage = await uploadImage(
    firstToken,
    Buffer.alloc(5 * 1024 * 1024 + 1),
    'image/png',
  )
  assert(
    oversizedImage.status === 413 &&
      oversizedImage.json.error.code === 'BODY_TOO_LARGE',
    'oversized image was accepted',
  )

  const denied = await request('/system/bootstrap', { token: firstToken })
  assert(
    denied.status === 403 && denied.json.error.code === 'ADMIN_REQUIRED',
    'student accessed admin API',
  )
  const studentClassroom = await request('/shared/classroom', { token: firstToken })
  assert(
    studentClassroom.status === 403 &&
      studentClassroom.json.error.code === 'FEATURE_FORBIDDEN',
    'student accessed classroom data',
  )
  const studentClassroomWrite = await request('/shared/classroom', {
    method: 'PUT',
    token: firstToken,
    body: { data: [], baseVersion: 0 },
  })
  assert(studentClassroomWrite.status === 403, 'student wrote classroom data')

  const classroomApplication = {
    id: 'ap_permission_test',
    roomId: 'cr_1222',
    roomCode: '1222',
    building: 'A栋',
    applicant: '陈子昂',
    applicantId: 'u_monitor_chen',
    status: 'pending',
    date: '2026-11-20',
    start: '10:00',
    end: '12:00',
  }
  const monitorApply = await request('/shared/classroom', {
    method: 'PUT',
    token: monitorToken,
    body: { data: [classroomApplication], baseVersion: 0 },
  })
  assert(monitorApply.status === 200, 'monitor could not submit classroom application')
  const monitorApprove = await request('/shared/classroom', {
    method: 'PUT',
    token: monitorToken,
    body: {
      data: [{ ...classroomApplication, status: 'approved' }],
      baseVersion: monitorApply.json.data.version,
    },
  })
  assert(
    monitorApprove.status === 403 &&
      monitorApprove.json.error.code === 'CLASSROOM_REVIEW_REQUIRED',
    'monitor approved a classroom application',
  )

  const emptyCloud = await request('/shared/forum', { token: firstToken })
  assert(emptyCloud.status === 200 && emptyCloud.json.data.document === null, 'empty cloud state')
  const cloudCreate = await request('/shared/forum', {
    method: 'PUT',
    token: firstToken,
    body: { data: { posts: ['shared'] }, baseVersion: 0 },
  })
  assert(cloudCreate.status === 200 && cloudCreate.json.data.version === 1, 'cloud create failed')

  const admin = await login('周老师', '2021000001')
  const adminToken = admin.json.data.token
  assert(
    admin.json.data.user.permissions?.modules?.admin === false &&
      !admin.json.data.user.permissions?.actions?.['system.settings'],
    'regular admin still has the system management module',
  )
  const adminBootstrap = await request('/system/bootstrap', { token: adminToken })
  assert(
    adminBootstrap.status === 403 &&
      adminBootstrap.json.error.code === 'SUPER_ADMIN_REQUIRED',
    'regular admin still accessed the system console',
  )
  const adminClassroom = await request('/shared/classroom', { token: adminToken })
  assert(
    adminClassroom.json.data.document?.data?.[0]?.id === 'ap_permission_test',
    'admin could not see all classroom applications',
  )
  const adminApprove = await request('/shared/classroom', {
    method: 'PUT',
    token: adminToken,
    body: {
      data: [{ ...classroomApplication, status: 'approved' }],
      baseVersion: adminClassroom.json.data.document.version,
    },
  })
  assert(adminApprove.status === 200, 'admin could not review classroom application')

  const monitorScope = await request('/notifications?scope=all', {
    token: monitorToken,
  })
  assert(
    monitorScope.status === 403 &&
      monitorScope.json.error.code === 'NOTIFICATION_SCOPE_FORBIDDEN',
    'monitor viewed other users notifications',
  )
  const studentNotifications = await request('/notifications', {
    token: demoStudentToken,
  })
  assert(
    studentNotifications.status === 200 &&
      studentNotifications.json.data.items.length > 0 &&
      studentNotifications.json.data.items.every(
        (item) => item.ownerId === 'u_student_lin',
      ),
    'student notification scope was not owner-only',
  )
  const adminNotifications = await request('/notifications?scope=all', {
    token: adminToken,
  })
  const adminOwnNotifications = await request('/notifications', {
    token: adminToken,
  })
  assert(
    adminNotifications.status === 200 &&
      adminNotifications.json.data.scope === 'all' &&
      adminNotifications.json.data.items.length >
        adminOwnNotifications.json.data.items.length,
    'admin could not inspect all notifications',
  )
  const foreignNotification = adminNotifications.json.data.items.find(
    (item) => item.ownerId !== admin.json.data.user.id,
  )
  const mutateForeign = await request(`/notifications/${foreignNotification.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { read: true },
  })
  assert(
    mutateForeign.status === 404,
    'admin modified another user notification through management view',
  )

  const studentAiOwn = await request('/ai/records', { token: demoStudentToken })
  const studentAiAll = await request('/ai/records?scope=all', {
    token: demoStudentToken,
  })
  assert(
    studentAiOwn.status === 200 &&
      studentAiOwn.json.data.records.every(
        (record) => record.userId === 'u_student_lin',
      ),
    'student AI record scope was not owner-only',
  )
  assert(
    studentAiAll.status === 403 &&
      studentAiAll.json.error.code === 'AI_RECORD_SCOPE_FORBIDDEN',
    'student viewed other users AI records',
  )
  const adminAiAll = await request('/ai/records?scope=all', { token: adminToken })
  const adminAiOwn = await request('/ai/records', { token: adminToken })
  assert(
    adminAiAll.status === 200 &&
      adminAiAll.json.data.records.length > adminAiOwn.json.data.records.length &&
      adminAiAll.json.data.records.every((record) => record.userId),
    'admin AI management scope failed',
  )

  const cloudReadOtherUser = await request('/shared/forum', { token: adminToken })
  assert(
    cloudReadOtherUser.json.data.document?.data?.posts?.[0] === 'shared',
    'shared data was not visible to another user',
  )
  const cloudConflict = await request('/shared/forum', {
    method: 'PUT',
    token: adminToken,
    body: { data: { posts: ['stale'] }, baseVersion: 0 },
  })
  assert(
    cloudConflict.status === 409 &&
      cloudConflict.json.error.code === 'SHARED_VERSION_CONFLICT',
    'optimistic concurrency was not enforced',
  )
  const cloudUpdate = await request('/shared/forum', {
    method: 'PUT',
    token: adminToken,
    body: { data: { posts: ['shared', 'updated'] }, baseVersion: 1 },
  })
  assert(cloudUpdate.status === 200 && cloudUpdate.json.data.version === 2, 'cloud update failed')
  const publishForum = await request('/shared/forum', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [{
        id: 'fp_permission_test',
        title: '权限测试帖子',
        content: '普通用户发布',
        author: '自动甲',
        authorId: firstId,
        ownerId: firstId,
      }],
      baseVersion: 2,
    },
  })
  assert(publishForum.status === 200, 'student could not publish forum post')
  const spoofForumUpdate = await request('/shared/forum', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [{
        id: 'fp_permission_test',
        title: '被越权改写的标题',
        content: '普通用户发布',
        author: '自动甲',
        authorId: firstId,
        ownerId: firstId,
      }],
      baseVersion: publishForum.json.data.version,
    },
  })
  assert(spoofForumUpdate.status === 200, 'interaction write was rejected unexpectedly')
  const forumAfterSpoof = await request('/shared/forum', { token: firstToken })
  assert(
    forumAfterSpoof.json.data.document?.data?.[0]?.title === '权限测试帖子',
    'student overwrote another author forum post',
  )
  const moderatorDelete = await request('/shared/forum', {
    method: 'PUT',
    token: moderatorToken,
    body: { data: [], baseVersion: spoofForumUpdate.json.data.version },
  })
  assert(moderatorDelete.status === 200, 'forum moderator could not delete any post')
  const forumAfterModeration = await request('/shared/forum', { token: firstToken })
  assert(
    Array.isArray(forumAfterModeration.json.data.document?.data) &&
      forumAfterModeration.json.data.document.data.length === 0,
    'forum moderator deletion was not persisted',
  )
  const incrementalForum = await request('/shared/forum/changes', {
    method: 'PUT',
    token: firstToken,
    body: {
      baseVersion: forumAfterModeration.json.data.document.version,
      upserts: [{
        id: 'fp_incremental_test',
        title: '增量同步帖子',
        content: '只提交变化记录',
        authorId: firstId,
        ownerId: firstId,
      }],
      deletes: [],
      order: ['fp_incremental_test'],
    },
  })
  assert(
    incrementalForum.status === 200 &&
      incrementalForum.json.data.version ===
        forumAfterModeration.json.data.document.version + 1,
    'incremental shared update failed',
  )
  const staleIncrementalForum = await request('/shared/forum/changes', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      baseVersion: forumAfterModeration.json.data.document.version,
      upserts: [{ id: 'fp_stale_test', title: '过期增量', content: 'stale' }],
      deletes: [],
      order: ['fp_stale_test'],
    },
  })
  assert(
    staleIncrementalForum.status === 409 &&
      staleIncrementalForum.json.error.code === 'SHARED_VERSION_CONFLICT',
    'stale incremental update was not rejected',
  )

  const lostPost = {
    id: 'lf_reward_test',
    type: 'lost',
    contact: '站内联系 · 自动甲',
    title: '带悬赏的寻物测试',
    status: 'matching',
    rewardEnabled: true,
    rewardAmount: 8,
    claims: [],
  }
  const createLost = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: { data: [lostPost], baseVersion: 0 },
  })
  assert(createLost.status === 200, 'rewarded lost post creation failed')
  const lostClaims = [{
    id: 'claim_test_1',
    helperId: demoStudent.json.data.user.id,
    helperName: '林小满',
    mode: 'returned',
    description: '物品已经交到宿管处',
    contact: '站内联系 · 林小满',
    status: 'submitted',
  }]
  const helperClaim = await request('/shared/lostfound', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [{ ...lostPost, claims: lostClaims }],
      baseVersion: createLost.json.data.version,
    },
  })
  assert(helperClaim.status === 200, 'helper could not submit a lostfound claim')
  const rewardedLost = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [{
        ...lostPost,
        status: 'resolved',
        claims: [{ ...lostClaims[0], status: 'rewarded', rewardAmount: 8 }],
      }],
      baseVersion: helperClaim.json.data.version,
    },
  })
  assert(rewardedLost.status === 200, 'lost owner could not confirm reward')
  const lostAfterReward = await request('/shared/lostfound', { token: firstToken })
  assert(
    lostAfterReward.json.data.document?.data?.[0]?.claims?.[0]?.status === 'rewarded' &&
      lostAfterReward.json.data.document.data[0].status === 'resolved' &&
      lostAfterReward.json.data.document.data[0].ownerId === firstId,
    'lostfound reward state was not persisted',
  )
  const noRewardPost = {
    id: 'lf_no_reward_test',
    type: 'lost',
    ownerId: firstId,
    authorId: firstId,
    author: '自动甲',
    contact: '站内联系 · 自动甲',
    title: '不设打赏的寻物测试',
    status: 'matching',
    rewardEnabled: false,
    rewardAmount: 0,
    claims: [],
  }
  const createNoReward = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [...lostAfterReward.json.data.document.data, noRewardPost],
      baseVersion: lostAfterReward.json.data.document.version,
    },
  })
  assert(createNoReward.status === 200, 'no-reward lost post creation failed')
  const noRewardClaim = [{
    id: 'claim_no_reward',
    helperId: demoStudent.json.data.user.id,
    helperName: '林小满',
    mode: 'clue',
    description: '物品在东门值班室',
    contact: '站内联系 · 林小满',
    status: 'submitted',
  }]
  const submitNoRewardClaim = await request('/shared/lostfound', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [
        lostAfterReward.json.data.document.data[0],
        { ...noRewardPost, claims: noRewardClaim },
      ],
      baseVersion: createNoReward.json.data.version,
    },
  })
  assert(submitNoRewardClaim.status === 200, 'no-reward claim submission failed')
  const helperSelfConfirm = await request('/shared/lostfound', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [
        lostAfterReward.json.data.document.data[0],
        {
          ...noRewardPost,
          status: 'resolved',
          claims: [{ ...noRewardClaim[0], status: 'picked_up' }],
        },
      ],
      baseVersion: submitNoRewardClaim.json.data.version,
    },
  })
  assert(helperSelfConfirm.status === 200, 'helper self-confirm raised unexpected error')
  const ownerSelfConfirm = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [
        lostAfterReward.json.data.document.data[0],
        {
          ...noRewardPost,
          status: 'resolved',
          claims: [{ ...noRewardClaim[0], status: 'picked_up' }],
        },
      ],
      baseVersion: helperSelfConfirm.json.data.version,
    },
  })
  assert(ownerSelfConfirm.status === 200, 'owner could not confirm self pickup')
  const noRewardAfter = await request('/shared/lostfound', { token: firstToken })
  const noRewardRecord = noRewardAfter.json.data.document.data.find(
    (item) => item.id === 'lf_no_reward_test',
  )
  assert(
    noRewardRecord?.status === 'resolved' &&
      noRewardRecord?.claims?.[0]?.status === 'picked_up',
    'self-pickup flow was not persisted',
  )

  const activeLostForClaim = {
    id: 'lf_found_claim_source',
    type: 'lost',
    ownerId: firstId,
    authorId: firstId,
    author: '自动甲',
    contact: '站内联系 · 自动甲',
    title: '用于认领流程的寻物信息',
    status: 'matching',
    rewardEnabled: true,
    rewardAmount: 9,
    claims: [],
  }
  const createClaimSource = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [...noRewardAfter.json.data.document.data, activeLostForClaim],
      baseVersion: noRewardAfter.json.data.document.version,
    },
  })
  assert(createClaimSource.status === 200, 'claim source lost post creation failed')
  const foundTarget = {
    id: 'lf_found_claim_target',
    type: 'found',
    ownerId: demoStudent.json.data.user.id,
    authorId: demoStudent.json.data.user.id,
    author: demoStudent.json.data.user.name,
    contact: '站内联系 · 林小满',
    title: '用于认领流程的招领信息',
    status: 'open',
    claims: [],
  }
  const createFoundTarget = await request('/shared/lostfound', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [
        ...noRewardAfter.json.data.document.data,
        activeLostForClaim,
        foundTarget,
      ],
      baseVersion: createClaimSource.json.data.version,
    },
  })
  assert(createFoundTarget.status === 200, 'found claim target creation failed')
  const foundClaim = {
    id: 'found_claim_e2e',
    kind: 'found_claim',
    helperId: firstId,
    claimantId: firstId,
    claimantName: '自动甲',
    lostPostId: activeLostForClaim.id,
    lostPostTitle: activeLostForClaim.title,
    description: '水杯底部有我刻的缩写',
    contact: '站内联系 · 自动甲',
    rewardEnabled: true,
    rewardAmount: 9,
    status: 'submitted',
  }
  const submitFoundClaim = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [{ ...foundTarget, claims: [foundClaim] }],
      baseVersion: createFoundTarget.json.data.version,
    },
  })
  assert(submitFoundClaim.status === 200, 'lost owner could not claim a found post')
  const approveFoundClaim = await request('/shared/lostfound', {
    method: 'PUT',
    token: demoStudentToken,
    body: {
      data: [{
        ...foundTarget,
        status: 'claimed_pending',
        claims: [{ ...foundClaim, status: 'approved' }],
      }],
      baseVersion: submitFoundClaim.json.data.version,
    },
  })
  assert(approveFoundClaim.status === 200, 'found owner could not approve claim')
  const completeFoundClaim = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: [{
        ...foundTarget,
        status: 'resolved',
        claims: [{
          ...foundClaim,
          status: 'rewarded',
          settledAmount: 9,
          completedAt: new Date().toISOString(),
        }],
      }],
      baseVersion: approveFoundClaim.json.data.version,
    },
  })
  assert(completeFoundClaim.status === 200, 'claimant could not complete approved claim')
  const lostBeforeResolve = await request('/shared/lostfound', { token: firstToken })
  const resolveClaimSource = await request('/shared/lostfound', {
    method: 'PUT',
    token: firstToken,
    body: {
      data: lostBeforeResolve.json.data.document.data.map((item) =>
        item.id === activeLostForClaim.id ? { ...item, status: 'resolved' } : item,
      ),
      baseVersion: lostBeforeResolve.json.data.document.version,
    },
  })
  assert(resolveClaimSource.status === 200, 'claim source lost post could not resolve')
  const foundClaimAfter = await request('/shared/lostfound', { token: demoStudentToken })
  const foundClaimRecord = foundClaimAfter.json.data.document.data.find(
    (item) => item.id === 'lf_found_claim_target',
  )
  assert(
    foundClaimRecord?.status === 'resolved' &&
      foundClaimRecord?.claims?.[0]?.status === 'rewarded',
    'end-to-end found claim state was not persisted',
  )

  const errandItem = {
    id: 'gb_errand_test',
    ownerId: firstId,
    owner: '自动甲',
    title: '跑腿测试拼单',
    product: '快递',
    targetCount: 3,
    participants: [{ name: '自动甲', userId: firstId, count: 1 }],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    errand: {
      enabled: true,
      tip: 6,
      description: '帮忙从东门送到 A栋',
      status: 'open',
      runnerId: '',
      runnerName: '',
    },
  }
  const createErrand = await request('/shared/groupbuy', {
    method: 'PUT',
    token: firstToken,
    body: { data: [errandItem], baseVersion: 0 },
  })
  assert(createErrand.status === 200, 'errand creation failed')
  const acceptedErrand = {
    ...errandItem,
    errand: {
      ...errandItem.errand,
      status: 'accepted',
      runnerId: demoStudent.json.data.user.id,
      runnerName: '林小满',
      acceptedAt: new Date().toISOString(),
    },
  }
  const acceptByHelper = await request('/shared/groupbuy', {
    method: 'PUT',
    token: demoStudentToken,
    body: { data: [acceptedErrand], baseVersion: createErrand.json.data.version },
  })
  assert(acceptByHelper.status === 200, 'helper could not accept errand')
  const deliveredErrand = {
    ...acceptedErrand,
    errand: {
      ...acceptedErrand.errand,
      status: 'delivered',
      completedAt: new Date().toISOString(),
    },
  }
  const deliveredByHelper = await request('/shared/groupbuy', {
    method: 'PUT',
    token: demoStudentToken,
    body: { data: [deliveredErrand], baseVersion: acceptByHelper.json.data.version },
  })
  assert(deliveredByHelper.status === 200, 'runner could not mark errand delivered')
  const settledErrand = {
    ...deliveredErrand,
    errand: {
      ...deliveredErrand.errand,
      status: 'settled',
      settledAmount: 6,
      confirmedAt: new Date().toISOString(),
    },
  }
  const confirmedByOwner = await request('/shared/groupbuy', {
    method: 'PUT',
    token: firstToken,
    body: { data: [settledErrand], baseVersion: deliveredByHelper.json.data.version },
  })
  assert(confirmedByOwner.status === 200, 'owner could not confirm errand settlement')
  const spoofErrand = {
    ...settledErrand,
    errand: {
      ...settledErrand.errand,
      status: 'accepted',
      runnerId: moderator.json.data.user.id,
      runnerName: '苏念',
    },
  }
  const spoofErrandResult = await request('/shared/groupbuy', {
    method: 'PUT',
    token: moderatorToken,
    body: { data: [spoofErrand], baseVersion: confirmedByOwner.json.data.version },
  })
  assert(spoofErrandResult.status === 200, 'spoof errand update raised unexpected error')
  const errandAfterSpoof = await request('/shared/groupbuy', { token: firstToken })
  assert(
    errandAfterSpoof.json.data.document?.data?.[0]?.errand?.status === 'settled',
    'non-owner overwrote settled errand state',
  )

  const adminDelete = await request(`/system/users/${second.json.data.user.id}`, {
    method: 'DELETE',
    token: adminToken,
  })
  assert(
    adminDelete.status === 403 &&
      adminDelete.json.error.code === 'SUPER_ADMIN_REQUIRED',
    'regular admin deleted an account',
  )
  const adminPermissionUpdate = await request(
    `/system/users/${firstId}/permissions`,
    {
      method: 'PATCH',
      token: adminToken,
      body: { roleKey: 'monitor' },
    },
  )
  assert(
    adminPermissionUpdate.status === 403 &&
      adminPermissionUpdate.json.error.code === 'SUPER_ADMIN_REQUIRED',
    'regular admin changed another account permission',
  )

  const superAdmin = await login('方主管', '2021000000')
  const superToken = superAdmin.json.data.token
  assert(
    superAdmin.json.data.user.permissions?.modules?.admin === true &&
      superAdmin.json.data.user.permissions?.actions?.['system.settings'] === true,
    'super admin system permissions are missing',
  )
  const removedAdminEndpoint = await request('/admin/bootstrap', { token: superToken })
  assert(
    removedAdminEndpoint.status === 404,
    'removed regular-admin system endpoint still exists',
  )
  const superBootstrap = await request('/system/bootstrap', { token: superToken })
  assert(superBootstrap.json.data.canManageUsers === true, 'super admin cannot manage')
  assert(
    superBootstrap.json.data.assignableRoles.every(
      (role) => role.level <= 80 && role.assignable,
    ),
    'assignable role cap failed',
  )
  assert(
    superBootstrap.json.data.assignableRoles.every(
      (role) => role.permissions?.modules && role.permissions?.actions,
    ),
    'assignable role permission previews are missing',
  )
  const permissionUpdate = await request(
    `/system/users/${firstId}/permissions`,
    {
      method: 'PATCH',
      token: superToken,
      body: { roleKey: 'monitor' },
    },
  )
  assert(
    permissionUpdate.status === 200 &&
      permissionUpdate.json.data.user.roleKey === 'monitor' &&
      permissionUpdate.json.data.user.permissions?.modules?.classroom === true,
    'super admin permission update failed',
  )
  const selfPermissionUpdate = await request(
    `/system/users/${superAdmin.json.data.user.id}/permissions`,
    {
      method: 'PATCH',
      token: superToken,
      body: { roleKey: 'admin' },
    },
  )
  assert(
    selfPermissionUpdate.status === 409 &&
      selfPermissionUpdate.json.error.code === 'CANNOT_MODIFY_SELF',
    'super admin changed their own permission',
  )

  const aiBeforeKey = await request('/ai/parse', {
    method: 'POST',
    token: firstToken,
    body: { text: '周三下午借一间 30 人教室' },
  })
  assert(
    aiBeforeKey.status === 409 &&
      aiBeforeKey.json.error.code === 'AI_KEY_NOT_CONFIGURED',
    'AI request was accepted without a configured key',
  )
  const failedAiRecord = await request('/ai/records', { token: firstToken })
  assert(
    failedAiRecord.json.data.records.some(
      (record) => record.status === 'error' && record.errorCode === 'AI_KEY_NOT_CONFIGURED',
    ),
    'failed AI request was not recorded for its owner',
  )

  const adminKeyUpdate = await request('/system/ai-provider', {
    method: 'PATCH',
    token: adminToken,
    body: { apiKey: `sk-${'A'.repeat(24)}` },
  })
  assert(
    adminKeyUpdate.status === 403 &&
      adminKeyUpdate.json.error.code === 'SUPER_ADMIN_REQUIRED',
    'regular admin configured AI key',
  )
  const invalidKey = await request('/system/ai-provider', {
    method: 'PATCH',
    token: superToken,
    body: { apiKey: 'bad-key' },
  })
  assert(
    invalidKey.status === 422 && invalidKey.json.error.code === 'AI_KEY_INVALID',
    'invalid AI key was accepted',
  )
  const fakeKey = `sk-${'A'.repeat(24)}`
  const keyUpdate = await request('/system/ai-provider', {
    method: 'PATCH',
    token: superToken,
    body: { apiKey: fakeKey },
  })
  assert(
    keyUpdate.status === 200 &&
      keyUpdate.json.data.provider.configured === true &&
      keyUpdate.json.data.provider.keyLast4 === 'AAAA' &&
      !('apiKey' in keyUpdate.json.data.provider),
    'AI key configuration was not safely stored',
  )

  const demoPasswordChange = await request('/me/password', {
    method: 'PATCH',
    token: superToken,
    body: { currentPassword: '123456', newPassword: 'Another123' },
  })
  assert(
    demoPasswordChange.status === 403 &&
      demoPasswordChange.json.error.code === 'DEMO_PASSWORD_FIXED',
    'built-in demo password was allowed to change',
  )

  const deleted = await request(`/system/users/${second.json.data.user.id}`, {
    method: 'DELETE',
    token: superToken,
  })
  assert(deleted.status === 200 && deleted.json.data.user.isDeleted, 'soft delete failed')
  assert(
    deleted.json.data.user.studentNo === '21040002',
    'deleted record lost original student number',
  )
  assert(
    deleted.json.data.studentNumbers.nextStudentNo === '21040002',
    'deleted number did not enter the inheritance pool',
  )

  const fourth = await register('继承丁')
  assert(
    fourth.status === 200 && fourth.json.data.user.studentNo === '21040002',
    'deleted number was not inherited',
  )

  const deletedAgain = await request(`/system/users/${fourth.json.data.user.id}`, {
    method: 'DELETE',
    token: superToken,
  })
  assert(deletedAgain.status === 200, 'second release failed')
  const fifth = await register('继承戊')
  assert(
    fifth.json.data.user.studentNo === '21040002',
    'inherited number was not reusable',
  )

  const records = await request('/system/bootstrap', { token: superToken })
  const deletedRecord = records.json.data.users.find(
    (user) => user.id === second.json.data.user.id,
  )
  assert(
    deletedRecord?.isDeleted && deletedRecord.studentNo === '21040002',
    'deleted account history was not retained',
  )

  const builtinDelete = await request('/system/users/u_student_lin', {
    method: 'DELETE',
    token: superToken,
  })
  assert(
    builtinDelete.status === 403 &&
      builtinDelete.json.error.code === 'BUILTIN_ACCOUNT_PROTECTED',
    'built-in account was deleted',
  )

  const promote = await request(`/system/users/${firstId}`, {
    method: 'PATCH',
    token: superToken,
    body: { roleKey: 'admin' },
  })
  assert(
    promote.status === 200 && promote.json.data.user.roleKey === 'admin',
    'promote to admin failed',
  )

  const passwordChange = await request('/me/password', {
    method: 'PATCH',
    token: firstToken,
    body: { currentPassword: 'Custom123', newPassword: 'Changed123' },
  })
  assert(passwordChange.status === 200, 'custom password change failed')
  const oldPassword = await login('自动甲', '21040001', 'Custom123')
  assert(oldPassword.status === 401, 'old password remained valid')
  const newPassword = await login('自动甲', '21040001', 'Changed123')
  assert(newPassword.status === 200, 'new password did not work')
  const exceed = await request(`/system/users/${firstId}`, {
    method: 'PATCH',
    token: superToken,
    body: { roleKey: 'super_admin' },
  })
  assert([403, 422].includes(exceed.status), 'super admin could be assigned')

  const disable = await request(`/system/users/${firstId}`, {
    method: 'PATCH',
    token: superToken,
    body: { status: 'disabled' },
  })
  assert(disable.json.data.user.status === 'disabled', 'disable account failed')
  const stale = await request('/auth/me', { token: firstToken })
  assert(stale.status === 401, 'disabled account session remained active')

  const audit = await request('/system/audit-logs', { token: superToken })
  assert(
    audit.json.data.logs.some((log) => log.action === '删除人物并释放学号'),
    'delete audit log missing',
  )
  const resetDemo = await request('/system/reset-demo', {
    method: 'POST',
    token: superToken,
  })
  assert(
    resetDemo.status === 200 &&
      resetDemo.json.data.sharedDocuments >= 1,
    'shared demo reset failed',
  )
  const forumAfterReset = await request('/shared/forum', { token: superToken })
  assert(
    forumAfterReset.json.data.document === null,
    'demo reset did not clear shared documents',
  )

  const resetAllDenied = await request('/system/reset-all', {
    method: 'POST',
    token: demoStudentToken,
    body: { confirmation: '重置全部内容' },
  })
  assert(
    resetAllDenied.status === 403,
    'student accessed full reset endpoint',
  )
  const resetAllUnconfirmed = await request('/system/reset-all', {
    method: 'POST',
    token: superToken,
    body: { confirmation: '重置' },
  })
  assert(
    resetAllUnconfirmed.status === 422 &&
      resetAllUnconfirmed.json.error.code === 'RESET_CONFIRMATION_REQUIRED',
    'full reset accepted an incomplete confirmation',
  )
  const resetAll = await request('/system/reset-all', {
    method: 'POST',
    token: superToken,
    body: { confirmation: '重置全部内容' },
  })
  assert(
    resetAll.status === 200 &&
      resetAll.json.data.avatarsCleared >= 1 &&
      resetAll.json.data.uploadedFiles >= 1 &&
      resetAll.json.data.currentUser.avatarUrl === '',
    'full reset did not clear avatars and uploaded files',
  )
  const deletedAvatar = await fetch(
    `http://127.0.0.1:${port}${uploadedImage.json.data.url}`,
  )
  assert(deletedAvatar.status === 404, 'full reset left uploaded avatar on disk')
  const forumAfterFullReset = await request('/shared/forum', { token: superToken })
  assert(
    forumAfterFullReset.json.data.document === null,
    'full reset did not clear shared content',
  )
  const auditAfterFullReset = await request('/system/audit-logs', {
    token: superToken,
  })
  assert(
    auditAfterFullReset.json.data.logs.length === 1 &&
      auditAfterFullReset.json.data.logs[0].action === '一键重置全部内容',
    'full reset audit record is incorrect',
  )

  const db = new DatabaseSync(databasePath)
  try {
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM users WHERE avatar_url <> ?').get('').count ===
        0,
      'full reset left avatar references in users',
    )
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count === 0 &&
        db.prepare('SELECT COUNT(*) AS count FROM ai_usage_logs').get().count === 0 &&
        db.prepare('SELECT COUNT(*) AS count FROM shared_documents').get().count === 0,
      'full reset left business data in database',
    )
    const provider = db
      .prepare('SELECT api_key_ciphertext FROM ai_provider_settings WHERE provider = ?')
      .get('deepseek')
    assert(
      provider.api_key_ciphertext !== fakeKey &&
        provider.api_key_ciphertext.startsWith('v1:'),
      'AI key was not encrypted at rest',
    )
  } finally {
    db.close()
  }

  console.log(`PASS backend checks=${passed}`)
} finally {
  server.kill('SIGTERM')
}
