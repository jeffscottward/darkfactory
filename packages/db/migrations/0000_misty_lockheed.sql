CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"line_1" text NOT NULL,
	"line_2" text,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_type_check" CHECK ("addresses"."type" in ('home', 'work', 'other')),
	CONSTRAINT "addresses_line_1_check" CHECK (length(trim("addresses"."line_1")) > 0),
	CONSTRAINT "addresses_country_check" CHECK (length("addresses"."country") = 2)
);
--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_records_metadata_check" CHECK (jsonb_typeof("audit_records"."metadata") = 'object'),
	CONSTRAINT "audit_records_request_id_check" CHECK (length(trim("audit_records"."request_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "feature_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_items_status_check" CHECK ("feature_items"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "feature_items_name_check" CHECK (length(trim("feature_items"."name")) > 0),
	CONSTRAINT "feature_items_metadata_check" CHECK (jsonb_typeof("feature_items"."metadata") = 'object' and octet_length("feature_items"."metadata"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "outbox_events_payload_check" CHECK (jsonb_typeof("outbox_events"."payload") = 'object'),
	CONSTRAINT "outbox_events_attempt_count_check" CHECK ("outbox_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"avatar_url" text,
	"phone" text,
	"business_name" text,
	"job_title" text,
	"biography" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"date_of_birth" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'system' NOT NULL,
	"color_scheme" text DEFAULT 'neutral' NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"product_updates" boolean DEFAULT true NOT NULL,
	"analytics_consent" boolean DEFAULT false NOT NULL,
	"personalization_consent" boolean DEFAULT false NOT NULL,
	"profile_visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_mode_check" CHECK ("user_preferences"."mode" in ('light', 'dark', 'system')),
	CONSTRAINT "user_preferences_color_scheme_check" CHECK ("user_preferences"."color_scheme" in (
        'neutral', 'slate', 'blue', 'cyan', 'green',
        'amber', 'orange', 'red', 'rose', 'violet'
      )),
	CONSTRAINT "user_preferences_profile_visibility_check" CHECK ("user_preferences"."profile_visibility" in ('private', 'members', 'public'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('member', 'admin')),
	CONSTRAINT "user_status_check" CHECK ("user"."status" in ('active', 'suspended', 'deactivated'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_items" ADD CONSTRAINT "feature_items_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "addresses_user_id_idx" ON "addresses" USING btree ("user_id","is_primary" DESC NULLS LAST,"created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_primary_per_user_idx" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "audit_records_actor_user_id_idx" ON "audit_records" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_records_entity_idx" ON "audit_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_records_request_id_idx" ON "audit_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "feature_items_owner_id_idx" ON "feature_items" USING btree ("owner_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("occurred_at") WHERE "outbox_events"."published_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_identifier_value_unique_idx" ON "verification" USING btree ("identifier","value");