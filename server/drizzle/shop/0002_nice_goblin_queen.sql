ALTER TABLE "expenses" ADD COLUMN "accounted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "accounted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "accounted" boolean DEFAULT true NOT NULL;