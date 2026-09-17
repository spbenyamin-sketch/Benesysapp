ALTER TABLE `expenses` ADD `accounted` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accounted` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `accounted` integer DEFAULT true NOT NULL;