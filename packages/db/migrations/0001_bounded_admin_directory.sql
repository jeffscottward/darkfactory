ALTER TABLE "user" ALTER COLUMN "created_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
CREATE INDEX "user_created_at_id_idx" ON "user" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "user_email_prefix_idx" ON "user" USING btree (lower("email") text_pattern_ops);
--> statement-breakpoint
CREATE INDEX "user_name_prefix_idx" ON "user" USING btree (lower("name") text_pattern_ops);
--> statement-breakpoint
CREATE INDEX "profiles_display_name_prefix_idx" ON "profiles" USING btree (lower("display_name") text_pattern_ops);
--> statement-breakpoint
CREATE INDEX "profiles_first_name_prefix_idx" ON "profiles" USING btree (lower("first_name") text_pattern_ops);
--> statement-breakpoint
CREATE INDEX "profiles_last_name_prefix_idx" ON "profiles" USING btree (lower("last_name") text_pattern_ops);
--> statement-breakpoint
CREATE INDEX "feature_items_owner_status_order_idx" ON "feature_items" USING btree ("owner_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);
