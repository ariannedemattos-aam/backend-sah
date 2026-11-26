CREATE TABLE IF NOT EXISTS user_notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(300) NOT NULL,
  href VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  INDEX by_user_read_created (user_id, read_at, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
