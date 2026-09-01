ALTER TABLE "profile_entries" ADD COLUMN "bullets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD COLUMN "tech" text;