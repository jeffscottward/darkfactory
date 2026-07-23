CREATE TABLE "contact_rate_limits" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp(3) with time zone NOT NULL,
  "request_count" integer NOT NULL,
  "expires_at" timestamp(3) with time zone NOT NULL,
  CONSTRAINT "contact_rate_limits_key_hash_check" CHECK ("contact_rate_limits"."key_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "contact_rate_limits_request_count_check" CHECK ("contact_rate_limits"."request_count" between 1 and 1000),
  CONSTRAINT "contact_rate_limits_window_check" CHECK ("contact_rate_limits"."expires_at" > "contact_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE INDEX "contact_rate_limits_expires_at_idx" ON "contact_rate_limits" USING btree ("expires_at");
