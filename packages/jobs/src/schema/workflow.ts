// Operator-plane workflow tables. Owned by @darkfactory/jobs so the product
// `db` package carries no workflow code. The DDL lives in the product migration
// chain (0005-0007) and stays inert when the operator is unused; see
// packages/jobs/README.md#migrations.
import { type JsonValue, users } from "@darkfactory/db/schema";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const WORKFLOW_MACHINE_ID = "darkfactory-pilot" as const;
export const WORKFLOW_MACHINE_VERSION = 1 as const;
export const WORKFLOW_EVENT_VERSION = 1 as const;
export const WORKFLOW_STATES = [
  "draft",
  "planning",
  "awaitingApproval",
  "implementing",
  "verifying",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];
export const WORKFLOW_APPROVAL_STATUSES = [
  "pending",
  "granted",
  "rejected",
] as const;
export type WorkflowApprovalStatus =
  (typeof WORKFLOW_APPROVAL_STATUSES)[number];
export type WorkflowPersistedEvent = Readonly<Record<string, JsonValue>>;
export type WorkflowSnapshotContext = Readonly<Record<string, JsonValue>>;
export type WorkflowEvidenceData = Readonly<Record<string, JsonValue>>;
export type WorkflowEffectPayload = Readonly<Record<string, JsonValue>>;
export const GENESIS_WORKFLOW_JOURNAL_HASH = "0".repeat(64);

const utcTimestampMs = (name: string) => {
  return timestamp(name, { mode: "date", withTimezone: true, precision: 3 });
};

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    machineId: text("machine_id").notNull(),
    machineVersion: integer("machine_version").notNull(),
    state: text("state").$type<WorkflowState>().notNull(),
    headSequence: bigint("head_sequence", { mode: "number" }).notNull(),
    headHash: text("head_hash").notNull(),
    createdAt: utcTimestampMs("created_at").defaultNow().notNull(),
    updatedAt: utcTimestampMs("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_runs_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("workflow_runs_owner_created_idx").on(table.ownerId, table.createdAt),
    index("workflow_runs_owner_state_updated_idx").on(
      table.ownerId,
      table.state,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("workflow_runs_nonterminal_capacity_idx")
      .on(table.ownerId)
      .where(sql`${table.state} not in ('completed', 'cancelled')`),
    check(
      "workflow_runs_machine_check",
      sql`${table.machineId} = 'darkfactory-pilot' and ${table.machineVersion} = 1`
    ),
    check(
      "workflow_runs_state_check",
      sql`${table.state} in (
        'draft', 'planning', 'awaitingApproval', 'implementing',
        'verifying', 'blocked', 'completed', 'cancelled'
      )`
    ),
    check(
      "workflow_runs_head_sequence_check",
      sql`${table.headSequence} between 1 and 9007199254740991`
    ),
    check(
      "workflow_runs_head_hash_check",
      sql`${table.headHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);

export const workflowJournal = pgTable(
  "workflow_journal",
  {
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull(),
    event: jsonb("event").$type<WorkflowPersistedEvent>().notNull(),
    occurredAt: utcTimestampMs("occurred_at").notNull(),
    previousHash: text("previous_hash").notNull(),
    hash: text("hash").notNull(),
    requestHash: text("request_hash"),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.sequence],
      name: "workflow_journal_pkey",
    }),
    uniqueIndex("workflow_journal_event_id_unique_idx").on(table.eventId),
    index("workflow_journal_run_occurred_idx").on(
      table.runId,
      table.occurredAt
    ),
    check(
      "workflow_journal_sequence_check",
      sql`${table.sequence} between 1 and 9007199254740991`
    ),
    check(
      "workflow_journal_event_type_check",
      sql`length(trim(${table.eventType})) > 0`
    ),
    check(
      "workflow_journal_event_version_check",
      sql`${table.eventVersion} = 1`
    ),
    check(
      "workflow_journal_event_check",
      sql`jsonb_typeof(${table.event}) = 'object' and octet_length(${table.event}::text) <= 65536`
    ),
    check(
      "workflow_journal_previous_hash_check",
      sql`${table.previousHash} ~ '^[0-9a-f]{64}$'`
    ),
    check("workflow_journal_hash_check", sql`${table.hash} ~ '^[0-9a-f]{64}$'`),
    check(
      "workflow_journal_request_hash_check",
      sql`${table.requestHash} is null or ${table.requestHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);

export const workflowSnapshots = pgTable(
  "workflow_snapshots",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    machineId: text("machine_id").notNull(),
    machineVersion: integer("machine_version").notNull(),
    state: text("state").$type<WorkflowState>().notNull(),
    context: jsonb("context").$type<WorkflowSnapshotContext>().notNull(),
    journalHeadHash: text("journal_head_hash").notNull(),
    effectHash: text("effect_hash"),
    effectScope: text("effect_scope"),
    updatedAt: utcTimestampMs("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.sequence],
      foreignColumns: [workflowJournal.runId, workflowJournal.sequence],
      name: "workflow_snapshots_journal_fk",
    }).onDelete("cascade"),
    check(
      "workflow_snapshots_sequence_check",
      sql`${table.sequence} between 1 and 9007199254740991`
    ),
    check(
      "workflow_snapshots_machine_check",
      sql`${table.machineId} = 'darkfactory-pilot' and ${table.machineVersion} = 1`
    ),
    check(
      "workflow_snapshots_state_check",
      sql`${table.state} in (
        'draft', 'planning', 'awaitingApproval', 'implementing',
        'verifying', 'blocked', 'completed', 'cancelled'
      )`
    ),
    check(
      "workflow_snapshots_context_check",
      sql`jsonb_typeof(${table.context}) = 'object' and octet_length(${table.context}::text) <= 65536`
    ),
    check(
      "workflow_snapshots_journal_head_hash_check",
      sql`${table.journalHeadHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "workflow_snapshots_effect_hash_check",
      sql`${table.effectHash} is null or ${table.effectHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "workflow_snapshots_effect_binding_check",
      sql`(${table.effectHash} is null) = (${table.effectScope} is null)`
    ),
  ]
);

export const workflowApprovals = pgTable(
  "workflow_approvals",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<WorkflowApprovalStatus>()
      .default("pending")
      .notNull(),
    machineId: text("machine_id").notNull(),
    machineVersion: integer("machine_version").notNull(),
    eventVersion: integer("event_version").notNull(),
    snapshotSequence: bigint("snapshot_sequence", { mode: "number" }).notNull(),
    journalHeadHash: text("journal_head_hash").notNull(),
    effectHash: text("effect_hash").notNull(),
    effectScope: text("effect_scope").notNull(),
    decidedBy: text("decided_by").references(() => users.id),
    decisionReason: text("decision_reason"),
    decisionRequestHash: text("decision_request_hash"),
    createdAt: utcTimestampMs("created_at").defaultNow().notNull(),
    decidedAt: utcTimestampMs("decided_at"),
  },
  (table) => [
    uniqueIndex("workflow_approvals_pending_run_idx")
      .on(table.runId)
      .where(sql`${table.status} = 'pending'`),
    index("workflow_approvals_run_created_idx").on(
      table.runId,
      table.createdAt.desc()
    ),
    index("workflow_approvals_decided_by_idx").on(table.decidedBy),
    check(
      "workflow_approvals_status_check",
      sql`${table.status} in ('pending', 'granted', 'rejected')`
    ),
    check(
      "workflow_approvals_machine_check",
      sql`${table.machineId} = 'darkfactory-pilot' and ${table.machineVersion} = 1 and ${table.eventVersion} = 1`
    ),
    check(
      "workflow_approvals_snapshot_sequence_check",
      sql`${table.snapshotSequence} between 1 and 9007199254740991`
    ),
    check(
      "workflow_approvals_hashes_check",
      sql`${table.journalHeadHash} ~ '^[0-9a-f]{64}$' and ${table.effectHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "workflow_approvals_effect_scope_check",
      sql`length(trim(${table.effectScope})) > 0`
    ),
    check(
      "workflow_approvals_decision_check",
      sql`(
        (${table.status} = 'pending' and ${table.decidedAt} is null and ${table.decidedBy} is null and ${table.decisionRequestHash} is null)
        or
        (${table.status} in ('granted', 'rejected') and ${table.decidedAt} is not null and ${table.decidedBy} is not null and ${table.decisionRequestHash} ~ '^[0-9a-f]{64}$')
      )`
    ),
    check(
      "workflow_approvals_decision_reason_check",
      sql`${table.decisionReason} is null or octet_length(${table.decisionReason}) <= 4096`
    ),
  ]
);

export const workflowEvidence = pgTable(
  "workflow_evidence",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    requestHash: text("request_hash").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<WorkflowEvidenceData>().notNull(),
    createdAt: utcTimestampMs("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_evidence_run_created_idx").on(
      table.runId,
      table.createdAt,
      table.id
    ),
    check("workflow_evidence_kind_check", sql`length(trim(${table.kind})) > 0`),
    check(
      "workflow_evidence_summary_check",
      sql`octet_length(${table.summary}) between 1 and 4096`
    ),
    check(
      "workflow_evidence_data_check",
      sql`jsonb_typeof(${table.data}) = 'object' and octet_length(${table.data}::text) <= 65536`
    ),
    check(
      "workflow_evidence_request_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);

export const workflowOmpResources = pgTable(
  "workflow_omp_resources",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => workflowEvidence.id, { onDelete: "restrict" }),
    cleanupRequestedAt: utcTimestampMs("cleanup_requested_at"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: utcTimestampMs("lease_expires_at"),
    fence: bigint("fence", { mode: "number" }).default(0).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    deadAt: utcTimestampMs("dead_at"),
    lastError: text("last_error"),
    createdAt: utcTimestampMs("created_at").defaultNow().notNull(),
    updatedAt: utcTimestampMs("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workflow_omp_resources_evidence_unique_idx").on(
      table.evidenceId
    ),
    index("workflow_omp_resources_cleanup_due_idx")
      .on(table.cleanupRequestedAt, table.leaseExpiresAt, table.runId)
      .where(
        sql`${table.cleanupRequestedAt} is not null and ${table.deadAt} is null`
      ),
    check(
      "workflow_omp_resources_fence_check",
      sql`${table.fence} between 0 and 9007199254740991`
    ),
    check(
      "workflow_omp_resources_attempt_check",
      sql`${table.attemptCount} between 0 and 5`
    ),
    check(
      "workflow_omp_resources_lease_check",
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`
    ),
    check(
      "workflow_omp_resources_error_check",
      sql`${table.lastError} is null or octet_length(${table.lastError}) <= 4096`
    ),
  ]
);

export const workflowMessages = pgTable(
  "workflow_messages",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    createdAt: utcTimestampMs("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_messages_run_created_idx").on(
      table.runId,
      table.createdAt,
      table.id
    ),
    uniqueIndex("workflow_messages_run_idempotency_idx").on(
      table.runId,
      table.idempotencyKey
    ),
    index("workflow_messages_author_id_idx").on(table.authorId),
    check(
      "workflow_messages_content_check",
      sql`octet_length(${table.content}) between 1 and 8192`
    ),
    check(
      "workflow_messages_idempotency_key_check",
      sql`octet_length(${table.idempotencyKey}) between 1 and 128 and ${table.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`
    ),
    check(
      "workflow_messages_request_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowJournalEntry = typeof workflowJournal.$inferSelect;
export type NewWorkflowJournalEntry = typeof workflowJournal.$inferInsert;
export type WorkflowSnapshot = typeof workflowSnapshots.$inferSelect;
export type NewWorkflowSnapshot = typeof workflowSnapshots.$inferInsert;
export type WorkflowApproval = typeof workflowApprovals.$inferSelect;
export type NewWorkflowApproval = typeof workflowApprovals.$inferInsert;
export type WorkflowEvidence = typeof workflowEvidence.$inferSelect;
export type NewWorkflowEvidence = typeof workflowEvidence.$inferInsert;
export type WorkflowOmpResource = typeof workflowOmpResources.$inferSelect;
export type NewWorkflowOmpResource = typeof workflowOmpResources.$inferInsert;
export type WorkflowMessage = typeof workflowMessages.$inferSelect;
export type NewWorkflowMessage = typeof workflowMessages.$inferInsert;
