DROP INDEX `ix_trail_ledger_user_time` ON `trail_point_ledger_entries`;
--> statement-breakpoint
CREATE INDEX `ix_trail_ledger_user_time` ON `trail_point_ledger_entries` (`userId`, `createdAt`, `direction`, `points`);
