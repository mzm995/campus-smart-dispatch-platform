PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  role_key TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  level INTEGER NOT NULL UNIQUE CHECK (level BETWEEN 0 AND 100),
  assignable INTEGER NOT NULL DEFAULT 1 CHECK (assignable IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  student_no TEXT NOT NULL UNIQUE,
  student_no_original TEXT,
  name TEXT NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'student'
    REFERENCES roles(role_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  college TEXT NOT NULL DEFAULT 'AI+人工智能',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'disabled')),
  source TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('builtin', 'custom')),
  deleted_at TEXT,
  deleted_by TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_key);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE TABLE IF NOT EXISTS student_number_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  start_number TEXT NOT NULL,
  next_value INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_numbers (
  student_no TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('available', 'assigned')),
  current_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT,
  released_at TEXT,
  reuse_count INTEGER NOT NULL DEFAULT 0,
  generated_by_system INTEGER NOT NULL DEFAULT 1
    CHECK (generated_by_system IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_numbers_current_user
  ON student_numbers(current_user_id)
  WHERE current_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_numbers_status
  ON student_numbers(status, released_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_updated_at TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0
    CHECK (must_change_password IN (0, 1))
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);

CREATE TABLE IF NOT EXISTS shared_documents (
  resource_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  provider TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  api_key_ciphertext TEXT,
  api_key_last4 TEXT,
  api_key_updated_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_test_ok INTEGER,
  last_test_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_created
  ON notifications(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  scene TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  request_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  prompt_chars INTEGER NOT NULL DEFAULT 0,
  usage_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created
  ON ai_usage_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS classroom_applications (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  application_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  people INTEGER NOT NULL DEFAULT 0 CHECK (people >= 0),
  applicant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  applicant_name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '站内联系',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  ai_reason TEXT NOT NULL DEFAULT '',
  block_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  hold_expires_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT NOT NULL DEFAULT '',
  UNIQUE(applicant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_classroom_applications_date
  ON classroom_applications(application_date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_classroom_applications_applicant
  ON classroom_applications(applicant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_blocks (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('course', 'application', 'maintenance', 'event')),
  source_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('tentative', 'active', 'released')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_room_blocks_availability
  ON room_blocks(room_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS lostfound_watches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criteria_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lostfound_watches_user
  ON lostfound_watches(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS group_payment_orders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'authorized'
    CHECK (status IN ('authorized', 'captured', 'released', 'refunded', 'failed')),
  idempotency_key TEXT NOT NULL,
  provider_txn TEXT NOT NULL DEFAULT '',
  authorized_at TEXT NOT NULL,
  captured_at TEXT,
  refunded_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_group_payment_orders_order
  ON group_payment_orders(order_id, status);

CREATE TABLE IF NOT EXISTS group_ledger_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_group_ledger_order
  ON group_ledger_entries(order_id, created_at);

CREATE TABLE IF NOT EXISTS group_pickup_tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redeemed', 'transferred', 'expired')),
  created_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_pickup_tickets_order
  ON group_pickup_tickets(order_id, status);

CREATE TABLE IF NOT EXISTS group_disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  opened_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_disputes_order
  ON group_disputes(order_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS group_action_receipts (
  idempotency_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (1, datetime('now'));
