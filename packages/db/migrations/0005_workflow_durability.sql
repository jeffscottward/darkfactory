ALTER TABLE "outbox_events" ADD COLUMN "handler" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "request_hash" text;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "lease_owner" text;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error" text;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dead_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_payload_check";
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_payload_check" CHECK (jsonb_typeof("payload") = 'object' and octet_length("payload"::text) <= 65536);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_handler_check" CHECK (length(trim("handler")) > 0);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_idempotency_key_check" CHECK ("idempotency_key" is null or length(trim("idempotency_key")) > 0);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_request_hash_check" CHECK (("idempotency_key" is null) = ("request_hash" is null) and ("request_hash" is null or "request_hash" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_fence_check" CHECK ("fence" >= 0);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null));
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_last_error_check" CHECK ("last_error" is null or octet_length("last_error") <= 4096);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_handler_idempotency_unique_idx" ON "outbox_events" ("handler","idempotency_key") WHERE "idempotency_key" is not null;
--> statement-breakpoint
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" ("handler", "available_at", "lease_expires_at", "id") WHERE "published_at" is null and "dead_at" is null;
--> statement-breakpoint
CREATE INDEX "outbox_events_lease_expiry_idx" ON "outbox_events" ("lease_expires_at") WHERE "published_at" is null and "dead_at" is null and "lease_expires_at" is not null;
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
 "id" text PRIMARY KEY NOT NULL,
 "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "machine_id" text NOT NULL,
 "machine_version" integer NOT NULL,
 "state" text NOT NULL,
 "head_sequence" bigint NOT NULL,
 "head_hash" text NOT NULL,
 "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "workflow_runs_machine_check" CHECK ("machine_id" = 'darkfactory-pilot' and "machine_version" = 1),
 CONSTRAINT "workflow_runs_state_check" CHECK ("state" in ('draft','planning','awaitingApproval','implementing','verifying','blocked','completed','cancelled')),
 CONSTRAINT "workflow_runs_head_sequence_check" CHECK ("head_sequence" between 1 and 9007199254740991),
 CONSTRAINT "workflow_runs_head_hash_check" CHECK ("head_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "workflow_journal" (
 "run_id" text NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
 "sequence" bigint NOT NULL,
 "event_id" text NOT NULL,
 "event_type" text NOT NULL,
 "event_version" integer NOT NULL,
 "event" jsonb NOT NULL,
 "occurred_at" timestamp(3) with time zone NOT NULL,
 "previous_hash" text NOT NULL,
 "hash" text NOT NULL,
 "request_hash" text,
 CONSTRAINT "workflow_journal_pkey" PRIMARY KEY("run_id","sequence"),
 CONSTRAINT "workflow_journal_sequence_check" CHECK ("sequence" between 1 and 9007199254740991),
 CONSTRAINT "workflow_journal_event_type_check" CHECK (length(trim("event_type")) > 0),
 CONSTRAINT "workflow_journal_event_version_check" CHECK ("event_version" = 1),
 CONSTRAINT "workflow_journal_event_check" CHECK (jsonb_typeof("event") = 'object' and octet_length("event"::text) <= 65536),
 CONSTRAINT "workflow_journal_previous_hash_check" CHECK ("previous_hash" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "workflow_journal_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "workflow_journal_request_hash_check" CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "workflow_snapshots" (
 "run_id" text PRIMARY KEY NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
 "sequence" bigint NOT NULL,
 "machine_id" text NOT NULL,
 "machine_version" integer NOT NULL,
 "state" text NOT NULL,
 "context" jsonb NOT NULL,
 "journal_head_hash" text NOT NULL,
 "effect_hash" text,
 "effect_scope" text,
 "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "workflow_snapshots_journal_fk" FOREIGN KEY ("run_id","sequence") REFERENCES "workflow_journal"("run_id","sequence") ON DELETE CASCADE,
 CONSTRAINT "workflow_snapshots_sequence_check" CHECK ("sequence" between 1 and 9007199254740991),
 CONSTRAINT "workflow_snapshots_machine_check" CHECK ("machine_id" = 'darkfactory-pilot' and "machine_version" = 1),
 CONSTRAINT "workflow_snapshots_state_check" CHECK ("state" in ('draft','planning','awaitingApproval','implementing','verifying','blocked','completed','cancelled')),
 CONSTRAINT "workflow_snapshots_context_check" CHECK (jsonb_typeof("context") = 'object' and octet_length("context"::text) <= 65536),
 CONSTRAINT "workflow_snapshots_journal_head_hash_check" CHECK ("journal_head_hash" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "workflow_snapshots_effect_hash_check" CHECK ("effect_hash" is null or "effect_hash" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "workflow_snapshots_effect_binding_check" CHECK (("effect_hash" is null) = ("effect_scope" is null))
);
--> statement-breakpoint
CREATE TABLE "workflow_approvals" (
 "id" text PRIMARY KEY NOT NULL,
 "run_id" text NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
 "status" text DEFAULT 'pending' NOT NULL,
 "machine_id" text NOT NULL,
 "machine_version" integer NOT NULL,
 "event_version" integer NOT NULL,
 "snapshot_sequence" bigint NOT NULL,
 "journal_head_hash" text NOT NULL,
 "effect_hash" text NOT NULL,
 "effect_scope" text NOT NULL,
 "decided_by" text REFERENCES "user"("id"),
 "decision_reason" text,
 "decision_request_hash" text,
 "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 "decided_at" timestamp(3) with time zone,
 CONSTRAINT "workflow_approvals_status_check" CHECK ("status" in ('pending','granted','rejected')),
 CONSTRAINT "workflow_approvals_machine_check" CHECK ("machine_id" = 'darkfactory-pilot' and "machine_version" = 1 and "event_version" = 1),
 CONSTRAINT "workflow_approvals_snapshot_sequence_check" CHECK ("snapshot_sequence" between 1 and 9007199254740991),
 CONSTRAINT "workflow_approvals_hashes_check" CHECK ("journal_head_hash" ~ '^[0-9a-f]{64}$' and "effect_hash" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "workflow_approvals_effect_scope_check" CHECK (length(trim("effect_scope")) > 0),
 CONSTRAINT "workflow_approvals_decision_check" CHECK (("status" = 'pending' and "decided_at" is null and "decided_by" is null and "decision_request_hash" is null) or ("status" in ('granted','rejected') and "decided_at" is not null and "decided_by" is not null and "decision_request_hash" ~ '^[0-9a-f]{64}$')),
 CONSTRAINT "workflow_approvals_decision_reason_check" CHECK ("decision_reason" is null or octet_length("decision_reason") <= 4096)
);
--> statement-breakpoint
CREATE TABLE "workflow_evidence" (
 "id" text PRIMARY KEY NOT NULL,
 "run_id" text NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
 "kind" text NOT NULL,
 "request_hash" text NOT NULL,
 "summary" text NOT NULL,
 "data" jsonb NOT NULL,
 "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "workflow_evidence_kind_check" CHECK (length(trim("kind")) > 0),
 CONSTRAINT "workflow_evidence_summary_check" CHECK (octet_length("summary") between 1 and 4096),
 CONSTRAINT "workflow_evidence_data_check" CHECK (jsonb_typeof("data") = 'object' and octet_length("data"::text) <= 65536),
 CONSTRAINT "workflow_evidence_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "workflow_messages" (
 "id" text PRIMARY KEY NOT NULL,
 "run_id" text NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
 "idempotency_key" text NOT NULL,
 "request_hash" text NOT NULL,
 "author_id" text REFERENCES "user"("id") ON DELETE SET NULL,
 "content" text NOT NULL,
 "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "workflow_messages_content_check" CHECK (octet_length("content") between 1 and 8192),
 CONSTRAINT "workflow_messages_idempotency_key_check" CHECK (octet_length("idempotency_key") between 1 and 128 and "idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
 CONSTRAINT "workflow_messages_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "workflow_runs_owner_updated_idx" ON "workflow_runs" ("owner_id","updated_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "workflow_runs_owner_state_updated_idx" ON "workflow_runs" ("owner_id","state","updated_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "workflow_runs_nonterminal_capacity_idx" ON "workflow_runs" ("owner_id") WHERE "state" not in ('completed', 'cancelled');
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_journal_event_id_unique_idx" ON "workflow_journal" ("event_id");
--> statement-breakpoint
CREATE INDEX "workflow_journal_run_occurred_idx" ON "workflow_journal" ("run_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_approvals_pending_run_idx" ON "workflow_approvals" ("run_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX "workflow_approvals_run_created_idx" ON "workflow_approvals" ("run_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "workflow_approvals_decided_by_idx" ON "workflow_approvals" ("decided_by");
--> statement-breakpoint
CREATE INDEX "workflow_evidence_run_created_idx" ON "workflow_evidence" ("run_id","created_at","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_messages_run_idempotency_idx" ON "workflow_messages" ("run_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "workflow_messages_run_created_idx" ON "workflow_messages" ("run_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "workflow_messages_author_id_idx" ON "workflow_messages" ("author_id");
--> statement-breakpoint
CREATE FUNCTION reject_workflow_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE'
    AND pg_trigger_depth() > 1
    AND NOT EXISTS (
      SELECT 1 FROM workflow_runs WHERE id = OLD.run_id
    )
 THEN
   RETURN OLD;
 END IF;
 RAISE EXCEPTION 'workflow_journal is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workflow_journal_immutable BEFORE UPDATE OR DELETE ON "workflow_journal" FOR EACH ROW EXECUTE FUNCTION reject_workflow_journal_mutation();
--> statement-breakpoint
CREATE FUNCTION delete_workflow_run_outbox_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM outbox_events
 WHERE aggregate_type = 'workflow_run'
   AND aggregate_id = OLD.id;
 RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workflow_runs_delete_outbox BEFORE DELETE ON "workflow_runs" FOR EACH ROW EXECUTE FUNCTION delete_workflow_run_outbox_events();
