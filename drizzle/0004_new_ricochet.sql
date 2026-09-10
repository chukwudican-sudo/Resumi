ALTER TABLE "profiles" ADD COLUMN "undo_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "undo_at" timestamp with time zone;