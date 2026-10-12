CREATE TEMPORARY TABLE tmp_provider_redemptions (id VARCHAR(36) PRIMARY KEY, status VARCHAR(32) NOT NULL, trail_point_balance INT NOT NULL);
CREATE TEMPORARY TABLE tmp_provider_ledger (id VARCHAR(36) PRIMARY KEY, entry_type VARCHAR(64) NOT NULL, points INT NOT NULL);
CREATE TEMPORARY TABLE tmp_provider_audit (id VARCHAR(36) PRIMARY KEY);
CREATE TEMPORARY TABLE tmp_provider_outbox (id VARCHAR(36) PRIMARY KEY, status VARCHAR(16) NOT NULL, attempts INT NOT NULL);

INSERT INTO tmp_provider_redemptions VALUES ('precommit-request', 'UNDER_REVIEW', 0), ('postcommit-request', 'UNDER_REVIEW', 0);
INSERT INTO tmp_provider_ledger VALUES ('precommit-reservation', 'RESERVATION_DEBIT', 500), ('postcommit-reservation', 'RESERVATION_DEBIT', 500);

START TRANSACTION;
UPDATE tmp_provider_redemptions SET status = 'REJECTED', trail_point_balance = trail_point_balance + 500 WHERE id = 'precommit-request';
INSERT INTO tmp_provider_ledger VALUES ('precommit-compensation', 'COMPENSATION_CREDIT', 500);
INSERT INTO tmp_provider_audit VALUES ('precommit-rejection-audit');
INSERT INTO tmp_provider_outbox VALUES ('precommit-provider-notification', 'PENDING', 0);
ROLLBACK;

START TRANSACTION;
UPDATE tmp_provider_redemptions SET status = 'REJECTED', trail_point_balance = trail_point_balance + 500 WHERE id = 'postcommit-request';
INSERT INTO tmp_provider_ledger VALUES ('postcommit-compensation', 'COMPENSATION_CREDIT', 500);
INSERT INTO tmp_provider_audit VALUES ('postcommit-rejection-audit');
INSERT INTO tmp_provider_outbox VALUES ('postcommit-provider-notification', 'PENDING', 0);
COMMIT;
UPDATE tmp_provider_outbox SET status = 'FAILED', attempts = attempts + 1 WHERE id = 'postcommit-provider-notification';
START TRANSACTION;
UPDATE tmp_provider_outbox SET status = 'DELIVERED', attempts = attempts + 1 WHERE id = 'postcommit-provider-notification' AND status = 'FAILED';
COMMIT;

SELECT 'precommit' AS scenario,
       (SELECT status FROM tmp_provider_redemptions WHERE id = 'precommit-request') AS redemption_status,
       (SELECT trail_point_balance FROM tmp_provider_redemptions WHERE id = 'precommit-request') AS trail_point_balance,
       (SELECT COUNT(*) FROM tmp_provider_ledger WHERE id = 'precommit-compensation') AS compensation_rows,
       (SELECT COUNT(*) FROM tmp_provider_audit WHERE id = 'precommit-rejection-audit') AS audit_rows,
       (SELECT COUNT(*) FROM tmp_provider_outbox WHERE id = 'precommit-provider-notification') AS outbox_rows
UNION ALL
SELECT 'postcommit-retry',
       (SELECT status FROM tmp_provider_redemptions WHERE id = 'postcommit-request'),
       (SELECT trail_point_balance FROM tmp_provider_redemptions WHERE id = 'postcommit-request'),
       (SELECT COUNT(*) FROM tmp_provider_ledger WHERE id = 'postcommit-compensation'),
       (SELECT COUNT(*) FROM tmp_provider_audit WHERE id = 'postcommit-rejection-audit'),
       (SELECT attempts FROM tmp_provider_outbox WHERE id = 'postcommit-provider-notification');

DROP TEMPORARY TABLE tmp_provider_outbox;
DROP TEMPORARY TABLE tmp_provider_audit;
DROP TEMPORARY TABLE tmp_provider_ledger;
DROP TEMPORARY TABLE tmp_provider_redemptions;
