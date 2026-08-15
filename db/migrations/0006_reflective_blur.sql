ALTER TABLE `invoice_items` ADD `discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `hsn_code` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `place_of_supply` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `round_off` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `source_invoice_id` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `min_stock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `account_id` integer REFERENCES bank_accounts(id);