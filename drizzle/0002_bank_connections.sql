CREATE TABLE `bank_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bank_inbox_user` ON `bank_inbox` (`user_id`);--> statement-breakpoint
CREATE TABLE `bank_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plaid_item_id` text NOT NULL,
	`institution` text NOT NULL,
	`access_token` text NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_sync` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bank_items_user` ON `bank_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `bank_items_last_sync` ON `bank_items` (`last_sync`);--> statement-breakpoint
CREATE TABLE `bank_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL
);
