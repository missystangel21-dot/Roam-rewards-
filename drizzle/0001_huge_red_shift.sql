CREATE TABLE `explorer_xp_events` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`xpDelta` int NOT NULL,
	`eventType` enum('SIMULATED_AD_COSMETIC','VERIFIED_AD_COSMETIC','COSMETIC_ADMIN_ADJUSTMENT') NOT NULL,
	`sourceId` varchar(96),
	`idempotencyKey` varchar(36) NOT NULL,
	`correlationId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `explorer_xp_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_xp_events_user_idempotency` UNIQUE(`userId`,`idempotencyKey`),
	CONSTRAINT `uq_xp_events_cosmetic_source` UNIQUE(`userId`,`sourceId`,`eventType`)
);
--> statement-breakpoint
CREATE TABLE `redemption_requests` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`requestedPoints` int NOT NULL,
	`status` enum('REQUESTED','UNDER_REVIEW','APPROVED','SUBMITTED_TO_PROVIDER','PAID','REJECTED','CANCELLED','FAILED') NOT NULL DEFAULT 'REQUESTED',
	`idempotencyKey` varchar(36) NOT NULL,
	`correlationId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`terminalAt` timestamp,
	CONSTRAINT `redemption_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_redemption_requests_user_idempotency` UNIQUE(`userId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `reward_accounts` (
	`userId` int NOT NULL,
	`trailPointBalance` int NOT NULL DEFAULT 0,
	`explorerXpBalance` int NOT NULL DEFAULT 0,
	`ledgerVersion` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_accounts_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `trail_point_ledger_entries` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`points` int NOT NULL,
	`direction` enum('CREDIT','DEBIT') NOT NULL,
	`entryType` enum('QUEST_CREDIT','REDEMPTION_RESERVATION_DEBIT','REDEMPTION_COMPENSATION_CREDIT','ADMIN_CORRECTION') NOT NULL,
	`sourceId` varchar(96),
	`redemptionRequestId` varchar(36),
	`idempotencyKey` varchar(36) NOT NULL,
	`correlationId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trail_point_ledger_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_trail_ledger_user_idempotency` UNIQUE(`userId`,`idempotencyKey`,`entryType`),
	CONSTRAINT `uq_trail_ledger_redemption_reservation` UNIQUE(`redemptionRequestId`,`entryType`)
);
--> statement-breakpoint
CREATE INDEX `ix_xp_events_user_time` ON `explorer_xp_events` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ix_redemption_requests_user_time` ON `redemption_requests` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ix_redemption_requests_status_time` ON `redemption_requests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ix_trail_ledger_user_time` ON `trail_point_ledger_entries` (`userId`,`createdAt`);