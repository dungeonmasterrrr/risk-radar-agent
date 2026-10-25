CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`owner` text NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`at` integer NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`dedup_key` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_unique` ON `notifications` (`task_id`,`dedup_key`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`owner` text NOT NULL,
	`version` integer NOT NULL,
	`at` integer NOT NULL,
	`result` text NOT NULL,
	`decision` text NOT NULL,
	`explanation` text NOT NULL,
	`evidence_json` text NOT NULL,
	`request_key` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_unique` ON `runs` (`task_id`,`version`,`request_key`);--> statement-breakpoint
CREATE INDEX `runs_task_idx` ON `runs` (`task_id`,`at`);--> statement-breakpoint
CREATE TABLE `system` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`rule_json` text NOT NULL,
	`version` integer NOT NULL,
	`state_json` text NOT NULL,
	`scenario` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`next_run_at` integer NOT NULL,
	`lease_until` integer,
	`lease_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_owner_idx` ON `tasks` (`owner`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`owner` text NOT NULL,
	`version` integer NOT NULL,
	`rule_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_unique` ON `versions` (`task_id`,`version`);