CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_hash CHAR(64) NOT NULL UNIQUE,
  previous_refresh_hash CHAR(64) NULL,
  rotated_at DATETIME(3) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX auth_sessions_by_user (user_id, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
