ALTER TABLE "profile_entries" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "start_month" integer;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "start_year" integer;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "end_month" integer;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "end_year" integer;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;