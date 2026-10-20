CREATE TABLE `android_verification_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('VERIFIED','FAILED','PENDING') NOT NULL,
	`packageName` varchar(255) NOT NULL,
	`certificateSha256` varchar(95) NOT NULL,
	`apkSha256` varchar(64) NOT NULL,
	`releaseTag` varchar(128),
	`verifiedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `android_verification_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_android_verification_status_time` ON `android_verification_results` (`status`,`verifiedAt`);--> statement-breakpoint
CREATE INDEX `ix_android_verification_time` ON `android_verification_results` (`verifiedAt`);