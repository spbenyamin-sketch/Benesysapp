ALTER TABLE `invoices` ADD `tax_mode` text DEFAULT 'exclusive' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `voice_alias` text;--> statement-breakpoint
ALTER TABLE `parties` ADD `voice_alias` text;