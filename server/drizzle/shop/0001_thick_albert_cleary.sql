ALTER TABLE "invoice_items" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_percent" integer;