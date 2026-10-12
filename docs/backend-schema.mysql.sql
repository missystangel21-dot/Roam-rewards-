-- Roam Rewards backend schema design (MySQL 8.0+).
-- This is a design artifact. Review with security, privacy, payments, and legal stakeholders before deployment.
-- Do not grant the mobile application's database credentials direct INSERT/UPDATE/DELETE permissions.

CREATE TABLE reward_policy_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_key VARCHAR(64) NOT NULL,
  points_per_dollar INT UNSIGNED NOT NULL,
  daily_points_cap INT UNSIGNED NOT NULL,
  redemption_minimum_points INT UNSIGNED NOT NULL,
  explorer_xp_per_verified_ad INT UNSIGNED NOT NULL,
  explorer_xp_per_level INT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  effective_at DATETIME(3) NOT NULL,
  retired_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reward_policy_versions_key (version_key),
  CHECK (points_per_dollar > 0),
  CHECK (redemption_minimum_points >= points_per_dollar),
  CHECK (explorer_xp_per_level > 0)
) ENGINE=InnoDB;

CREATE TABLE player_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  display_name VARCHAR(80) NULL,
  account_status ENUM('ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_player_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE player_eligibility (
  user_id BIGINT UNSIGNED NOT NULL,
  terms_version VARCHAR(64) NULL,
  terms_accepted_at DATETIME(3) NULL,
  age_gate_status ENUM('UNCONFIRMED', 'SELF_ATTESTED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'UNCONFIRMED',
  identity_status ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'NOT_STARTED',
  country_code CHAR(2) NULL,
  state_code VARCHAR(8) NULL,
  geography_status ENUM('UNKNOWN', 'ELIGIBLE', 'INELIGIBLE', 'REVIEW') NOT NULL DEFAULT 'UNKNOWN',
  identity_vendor_reference VARCHAR(128) NULL,
  payout_eligible_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY ix_player_eligibility_payout (identity_status, geography_status, age_gate_status),
  CONSTRAINT fk_player_eligibility_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE beacon_definitions (
  id CHAR(26) NOT NULL,
  public_code VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  reward_policy_version_id BIGINT UNSIGNED NOT NULL,
  fixed_trail_points INT UNSIGNED NOT NULL,
  allowed_radius_meters SMALLINT UNSIGNED NOT NULL,
  availability_window_key VARCHAR(64) NOT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_beacon_definitions_public_code (public_code),
  KEY ix_beacon_definitions_active (status, starts_at, ends_at),
  CONSTRAINT fk_beacon_policy FOREIGN KEY (reward_policy_version_id) REFERENCES reward_policy_versions(id) ON DELETE RESTRICT,
  CHECK (fixed_trail_points > 0),
  CHECK (allowed_radius_meters BETWEEN 10 AND 500)
) ENGINE=InnoDB;

CREATE TABLE quest_sessions (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  beacon_id CHAR(26) NOT NULL,
  nonce_hash BINARY(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_quest_sessions_nonce_hash (nonce_hash),
  KEY ix_quest_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_quest_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_quest_sessions_beacon FOREIGN KEY (beacon_id) REFERENCES beacon_definitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE quest_claims (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  beacon_id CHAR(26) NOT NULL,
  reward_policy_version_id BIGINT UNSIGNED NOT NULL,
  quest_session_id CHAR(26) NOT NULL,
  availability_window_key VARCHAR(64) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  verification_status ENUM('ACCEPTED', 'REJECTED', 'MANUAL_REVIEW') NOT NULL,
  rejection_code VARCHAR(64) NULL,
  location_accuracy_meters DECIMAL(7,2) NULL,
  distance_to_beacon_meters DECIMAL(7,2) NULL,
  movement_speed_mps DECIMAL(7,3) NULL,
  location_proof_hash BINARY(32) NULL,
  risk_score SMALLINT UNSIGNED NULL,
  verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_quest_claims_idempotency (user_id, idempotency_key),
  UNIQUE KEY uq_quest_claims_one_per_window (user_id, beacon_id, availability_window_key),
  UNIQUE KEY uq_quest_claims_session (quest_session_id),
  KEY ix_quest_claims_user_time (user_id, verified_at),
  KEY ix_quest_claims_review (verification_status, risk_score),
  CONSTRAINT fk_quest_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_quest_claims_beacon FOREIGN KEY (beacon_id) REFERENCES beacon_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_quest_claims_policy FOREIGN KEY (reward_policy_version_id) REFERENCES reward_policy_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_quest_claims_session FOREIGN KEY (quest_session_id) REFERENCES quest_sessions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE trail_point_ledger_entries (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  points INT UNSIGNED NOT NULL,
  direction ENUM('CREDIT', 'DEBIT') NOT NULL,
  entry_type ENUM('QUEST_CREDIT', 'REDEMPTION_RESERVATION_DEBIT', 'REDEMPTION_COMPENSATION_CREDIT', 'ADMIN_CORRECTION') NOT NULL,
  quest_claim_id CHAR(26) NULL,
  redemption_request_id CHAR(26) NULL,
  reward_policy_version_id BIGINT UNSIGNED NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  created_by_actor_type ENUM('SYSTEM', 'OPERATOR') NOT NULL,
  created_by_actor_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_trail_ledger_claim_credit (quest_claim_id, entry_type),
  UNIQUE KEY uq_trail_ledger_redemption_reserve (redemption_request_id, entry_type),
  UNIQUE KEY uq_trail_ledger_correlation (correlation_id, entry_type),
  KEY ix_trail_ledger_user_time (user_id, created_at),
  KEY ix_trail_ledger_redemption (redemption_request_id),
  CONSTRAINT fk_trail_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trail_ledger_claim FOREIGN KEY (quest_claim_id) REFERENCES quest_claims(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trail_ledger_policy FOREIGN KEY (reward_policy_version_id) REFERENCES reward_policy_versions(id) ON DELETE RESTRICT,
  CHECK (points > 0),
  CHECK ((entry_type = 'QUEST_CREDIT' AND direction = 'CREDIT' AND quest_claim_id IS NOT NULL) OR entry_type <> 'QUEST_CREDIT')
) ENGINE=InnoDB;

CREATE TABLE ad_reward_events (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  quest_claim_id CHAR(26) NOT NULL,
  ad_placement_key VARCHAR(64) NOT NULL,
  provider_event_reference VARCHAR(160) NULL,
  verification_status ENUM('SIMULATED', 'PENDING', 'VERIFIED', 'REJECTED') NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ad_reward_events_claim_placement (quest_claim_id, ad_placement_key),
  UNIQUE KEY uq_ad_reward_events_idempotency (user_id, idempotency_key),
  UNIQUE KEY uq_ad_reward_events_provider_ref (provider_event_reference),
  CONSTRAINT fk_ad_reward_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ad_reward_events_claim FOREIGN KEY (quest_claim_id) REFERENCES quest_claims(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE explorer_xp_events (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  xp_delta INT NOT NULL,
  event_type ENUM('SIMULATED_AD_COSMETIC', 'VERIFIED_AD_COSMETIC', 'COSMETIC_ADMIN_ADJUSTMENT') NOT NULL,
  ad_reward_event_id CHAR(26) NULL,
  correlation_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_xp_events_ad_reward (ad_reward_event_id),
  UNIQUE KEY uq_xp_events_correlation (correlation_id),
  KEY ix_xp_events_user_time (user_id, created_at),
  CONSTRAINT fk_xp_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_xp_events_ad_reward FOREIGN KEY (ad_reward_event_id) REFERENCES ad_reward_events(id) ON DELETE RESTRICT,
  CHECK (xp_delta <> 0)
) ENGINE=InnoDB;

CREATE TABLE redemption_requests (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reward_policy_version_id BIGINT UNSIGNED NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  requested_points INT UNSIGNED NOT NULL,
  requested_cash_cents INT UNSIGNED NOT NULL,
  status ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED_TO_PROVIDER', 'PAID', 'REJECTED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
  eligibility_snapshot JSON NOT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  terminal_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redemption_requests_idempotency (user_id, idempotency_key),
  KEY ix_redemption_requests_user_time (user_id, requested_at),
  KEY ix_redemption_requests_status_time (status, requested_at),
  CONSTRAINT fk_redemption_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_redemption_requests_policy FOREIGN KEY (reward_policy_version_id) REFERENCES reward_policy_versions(id) ON DELETE RESTRICT,
  CHECK (requested_points > 0),
  CHECK (requested_cash_cents > 0)
) ENGINE=InnoDB;

ALTER TABLE trail_point_ledger_entries
  ADD CONSTRAINT fk_trail_ledger_redemption FOREIGN KEY (redemption_request_id) REFERENCES redemption_requests(id) ON DELETE RESTRICT;

CREATE TABLE redemption_status_events (
  id CHAR(26) NOT NULL,
  redemption_request_id CHAR(26) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  reason_code VARCHAR(64) NULL,
  note_for_player VARCHAR(500) NULL,
  actor_type ENUM('SYSTEM', 'OPERATOR', 'PROVIDER') NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  correlation_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_redemption_status_events_request_time (redemption_request_id, created_at),
  CONSTRAINT fk_redemption_status_events_request FOREIGN KEY (redemption_request_id) REFERENCES redemption_requests(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payout_attempts (
  id CHAR(26) NOT NULL,
  redemption_request_id CHAR(26) NOT NULL,
  provider_name VARCHAR(64) NOT NULL,
  provider_payout_reference VARCHAR(160) NULL,
  idempotency_key CHAR(36) NOT NULL,
  status ENUM('CREATED', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
  failure_code VARCHAR(64) NULL,
  submitted_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_attempts_provider_ref (provider_name, provider_payout_reference),
  UNIQUE KEY uq_payout_attempts_idempotency (provider_name, idempotency_key),
  KEY ix_payout_attempts_request_time (redemption_request_id, created_at),
  CONSTRAINT fk_payout_attempts_request FOREIGN KEY (redemption_request_id) REFERENCES redemption_requests(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE fraud_evaluations (
  id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  subject_type ENUM('QUEST_CLAIM', 'REDEMPTION_REQUEST', 'PAYOUT_ATTEMPT') NOT NULL,
  subject_id CHAR(26) NOT NULL,
  decision ENUM('ALLOW', 'REVIEW', 'BLOCK') NOT NULL,
  risk_score SMALLINT UNSIGNED NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  reason_codes JSON NOT NULL,
  evaluated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_fraud_evaluations_subject (subject_type, subject_id),
  KEY ix_fraud_evaluations_review (decision, evaluated_at),
  CONSTRAINT fk_fraud_evaluations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE audit_events (
  id CHAR(26) NOT NULL,
  actor_type ENUM('USER', 'OPERATOR', 'SYSTEM', 'PROVIDER') NOT NULL,
  actor_id VARCHAR(128) NULL,
  action VARCHAR(96) NOT NULL,
  subject_type VARCHAR(64) NOT NULL,
  subject_id CHAR(26) NULL,
  correlation_id CHAR(36) NOT NULL,
  ip_hash BINARY(32) NULL,
  user_agent_hash BINARY(32) NULL,
  metadata JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_events_subject_time (subject_type, subject_id, occurred_at),
  KEY ix_audit_events_correlation (correlation_id),
  KEY ix_audit_events_actor_time (actor_type, actor_id, occurred_at)
) ENGINE=InnoDB;

-- Production authorization: grant the gameplay API only stored-procedure or narrowly scoped insert privileges.
-- Enforce ledger immutability with DB permissions and a before-update/delete trigger that rejects mutations.
DELIMITER //
CREATE TRIGGER forbid_trail_ledger_updates
BEFORE UPDATE ON trail_point_ledger_entries
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trail point ledger entries are immutable';
END//
CREATE TRIGGER forbid_trail_ledger_deletes
BEFORE DELETE ON trail_point_ledger_entries
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trail point ledger entries are immutable';
END//
CREATE TRIGGER forbid_explorer_xp_event_updates
BEFORE UPDATE ON explorer_xp_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Explorer XP events are immutable';
END//
CREATE TRIGGER forbid_explorer_xp_event_deletes
BEFORE DELETE ON explorer_xp_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Explorer XP events are immutable';
END//
DELIMITER ;
