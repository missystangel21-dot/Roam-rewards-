CREATE TABLE `redemption_review_events` (
	`id` varchar(36) NOT NULL,
	`redemptionRequestId` varchar(36) NOT NULL,
	`adminUserId` int NOT NULL,
	`action` enum('REVIEW_STARTED','APPROVED','REJECTED') NOT NULL,
	`fromStatus` varchar(32) NOT NULL,
	`toStatus` varchar(32) NOT NULL,
	`reasonCode` varchar(64),
	`idempotencyKey` varchar(36) NOT NULL,
	`correlationId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `redemption_review_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_redemption_review_events_idempotency` UNIQUE(`redemptionRequestId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `ix_redemption_review_events_request_time` ON `redemption_review_events` (`redemptionRequestId`,`createdAt`);