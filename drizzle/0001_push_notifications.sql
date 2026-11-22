CREATE TABLE `push_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`send_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_queue_send_at` ON `push_queue` (`send_at`);--> statement-breakpoint
CREATE INDEX `push_queue_subscription` ON `push_queue` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user` ON `push_subscriptions` (`user_id`);