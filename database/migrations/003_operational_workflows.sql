CREATE TABLE IF NOT EXISTS roster_staff (
  id CHAR(36) PRIMARY KEY, sector_id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY staff_name_sector (sector_id,name), UNIQUE KEY staff_scope (id,sector_id),
  FOREIGN KEY (sector_id) REFERENCES sectors(id)
);

CREATE TABLE IF NOT EXISTS roster_shifts (
  sector_id CHAR(36) NOT NULL, work_date DATE NOT NULL, shift_id CHAR(36) NOT NULL, team_id CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sector_id,work_date,shift_id), INDEX roster_by_date (work_date,sector_id),
  FOREIGN KEY (sector_id) REFERENCES sectors(id), FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (team_id) REFERENCES teams(id), FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS roster_shift_staff (
  sector_id CHAR(36) NOT NULL, work_date DATE NOT NULL, shift_id CHAR(36) NOT NULL, staff_id CHAR(36) NOT NULL,
  is_assigned BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (sector_id,work_date,shift_id,staff_id),
  FOREIGN KEY (sector_id,work_date,shift_id) REFERENCES roster_shifts(sector_id,work_date,shift_id),
  FOREIGN KEY (staff_id,sector_id) REFERENCES roster_staff(id,sector_id)
);

CREATE TABLE IF NOT EXISTS ombudsman_cases (
  id CHAR(36) PRIMARY KEY, survey_id CHAR(36) NOT NULL UNIQUE,
  status ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  priority ENUM('normal','high') NOT NULL, created_at DATETIME NOT NULL,
  INDEX cases_by_period (created_at,id), INDEX cases_by_status (status,priority,created_at),
  FOREIGN KEY (survey_id) REFERENCES surveys(id)
);

CREATE TABLE IF NOT EXISTS ombudsman_actions (
  id CHAR(36) PRIMARY KEY, case_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
  previous_status ENUM('open','in_progress','closed') NOT NULL,
  status ENUM('open','in_progress','closed') NOT NULL,
  priority ENUM('normal','high') NOT NULL,
  note VARCHAR(1500) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX case_history (case_id,created_at,id),
  FOREIGN KEY (case_id) REFERENCES ombudsman_cases(id), FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance_journeys (
  attendance_id CHAR(36) PRIMARY KEY, FOREIGN KEY (attendance_id) REFERENCES survey_attendances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_journey_stages (
  attendance_id CHAR(36) NOT NULL, stage_id CHAR(36) NOT NULL,
  PRIMARY KEY (attendance_id,stage_id),
  FOREIGN KEY (attendance_id) REFERENCES attendance_journeys(attendance_id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

CREATE TABLE IF NOT EXISTS question_version_rules (
  version_id CHAR(36) PRIMARY KEY, prerequisite_id CHAR(36) NOT NULL, expected_value VARCHAR(100) NOT NULL,
  FOREIGN KEY (version_id) REFERENCES question_versions(id), FOREIGN KEY (prerequisite_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS survey_question_context (
  question_id CHAR(36) PRIMARY KEY, stage_id CHAR(36), stage_name VARCHAR(120),
  prerequisite_id CHAR(36), expected_value VARCHAR(100), visible BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id),
  FOREIGN KEY (prerequisite_id) REFERENCES survey_questions(id), FOREIGN KEY (stage_id) REFERENCES stages(id)
);
