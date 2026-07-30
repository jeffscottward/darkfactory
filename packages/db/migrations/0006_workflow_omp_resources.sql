CREATE TABLE "workflow_omp_resources" (
 "run_id" text PRIMARY KEY NOT NULL REFERENCES "workflow_runs"("id") ON DELETE RESTRICT,
 "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
 "evidence_id" text NOT NULL REFERENCES "workflow_evidence"("id") ON DELETE RESTRICT,
 "cleanup_requested_at" timestamp(3) with time zone,
 "lease_owner" text,
 "lease_expires_at" timestamp(3) with time zone,
 "fence" bigint DEFAULT 0 NOT NULL,
 "attempt_count" integer DEFAULT 0 NOT NULL,
 "dead_at" timestamp(3) with time zone,
 "last_error" text,
 "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "workflow_omp_resources_fence_check" CHECK ("fence" between 0 and 9007199254740991),
 CONSTRAINT "workflow_omp_resources_attempt_check" CHECK ("attempt_count" between 0 and 5),
 CONSTRAINT "workflow_omp_resources_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null)),
 CONSTRAINT "workflow_omp_resources_error_check" CHECK ("last_error" is null or octet_length("last_error") <= 4096)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_omp_resources_evidence_unique_idx" ON "workflow_omp_resources" ("evidence_id");
--> statement-breakpoint
CREATE INDEX "workflow_omp_resources_cleanup_due_idx" ON "workflow_omp_resources" ("cleanup_requested_at","lease_expires_at","run_id") WHERE "cleanup_requested_at" is not null and "dead_at" is null;
