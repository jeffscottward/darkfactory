import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  workflowApprovals,
  workflowEvidence,
  workflowJournal,
  workflowMessages,
  workflowOmpResources,
  workflowRuns,
  workflowSnapshots,
} from "./workflow.ts";

const columnNames = (table: Parameters<typeof getTableConfig>[0]): string[] => {
  return getTableConfig(table).columns.map((column) => column.name);
};

const indexNames = (table: Parameters<typeof getTableConfig>[0]): string[] => {
  return getTableConfig(table).indexes.flatMap((entry) => {
    return entry.config.name === undefined ? [] : [entry.config.name];
  });
};

const checkNames = (table: Parameters<typeof getTableConfig>[0]): string[] => {
  return getTableConfig(table).checks.map((entry) => entry.name);
};

const foreignKey = (
  table: Parameters<typeof getTableConfig>[0],
  localColumnName: string
) =>
  getTableConfig(table).foreignKeys.find((key) => {
    return key
      .reference()
      .columns.some((candidate) => candidate.name === localColumnName);
  })!;

describe("operator workflow schema", () => {
  it("defines normalized, bounded workflow durability tables", () => {
    expect(columnNames(workflowRuns)).toEqual([
      "id",
      "owner_id",
      "machine_id",
      "machine_version",
      "state",
      "head_sequence",
      "head_hash",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(workflowJournal)).toEqual([
      "run_id",
      "sequence",
      "event_id",
      "event_type",
      "event_version",
      "event",
      "occurred_at",
      "previous_hash",
      "hash",
      "request_hash",
    ]);
    expect(columnNames(workflowSnapshots)).toEqual([
      "run_id",
      "sequence",
      "machine_id",
      "machine_version",
      "state",
      "context",
      "journal_head_hash",
      "effect_hash",
      "effect_scope",
      "updated_at",
    ]);
    expect(columnNames(workflowApprovals)).toEqual([
      "id",
      "run_id",
      "status",
      "machine_id",
      "machine_version",
      "event_version",
      "snapshot_sequence",
      "journal_head_hash",
      "effect_hash",
      "effect_scope",
      "decided_by",
      "decision_reason",
      "decision_request_hash",
      "created_at",
      "decided_at",
    ]);
    expect(columnNames(workflowEvidence)).toEqual([
      "id",
      "run_id",
      "kind",
      "request_hash",
      "summary",
      "data",
      "created_at",
    ]);
    expect(columnNames(workflowOmpResources)).toEqual([
      "run_id",
      "owner_id",
      "evidence_id",
      "cleanup_requested_at",
      "lease_owner",
      "lease_expires_at",
      "fence",
      "attempt_count",
      "dead_at",
      "last_error",
      "created_at",
      "updated_at",
    ]);
    expect(columnNames(workflowMessages)).toEqual([
      "id",
      "run_id",
      "idempotency_key",
      "request_hash",
      "author_id",
      "content",
      "created_at",
    ]);

    expect(foreignKey(workflowRuns, "owner_id").onDelete).toBe("cascade");
    for (const table of [
      workflowJournal,
      workflowSnapshots,
      workflowApprovals,
      workflowEvidence,
      workflowMessages,
    ]) {
      expect(foreignKey(table, "run_id").onDelete).toBe("cascade");
    }
    expect(foreignKey(workflowApprovals, "decided_by").onDelete).toBe(
      "no action"
    );
    expect(foreignKey(workflowMessages, "author_id").onDelete).toBe("set null");
    expect(foreignKey(workflowOmpResources, "run_id").onDelete).toBe(
      "restrict"
    );
    expect(foreignKey(workflowOmpResources, "owner_id").onDelete).toBe(
      "restrict"
    );
    expect(foreignKey(workflowOmpResources, "evidence_id").onDelete).toBe(
      "restrict"
    );

    expect(indexNames(workflowRuns)).toContain(
      "workflow_runs_owner_updated_idx"
    );
    expect(indexNames(workflowRuns)).toContain(
      "workflow_runs_owner_created_idx"
    );
    expect(
      indexNames(workflowRuns).filter(
        (name) => name === "workflow_runs_owner_created_idx"
      )
    ).toHaveLength(1);
    expect(indexNames(workflowRuns)).toContain(
      "workflow_runs_nonterminal_capacity_idx"
    );
    expect(indexNames(workflowJournal)).toContain(
      "workflow_journal_event_id_unique_idx"
    );
    expect(indexNames(workflowApprovals)).toContain(
      "workflow_approvals_pending_run_idx"
    );
    expect(indexNames(workflowEvidence)).toContain(
      "workflow_evidence_run_created_idx"
    );
    expect(indexNames(workflowMessages)).toContain(
      "workflow_messages_run_created_idx"
    );
    expect(indexNames(workflowMessages)).toContain(
      "workflow_messages_run_idempotency_idx"
    );
    expect(checkNames(workflowRuns)).toEqual(
      expect.arrayContaining([
        "workflow_runs_machine_check",
        "workflow_runs_state_check",
        "workflow_runs_head_sequence_check",
        "workflow_runs_head_hash_check",
      ])
    );
    expect(checkNames(workflowJournal)).toEqual(
      expect.arrayContaining([
        "workflow_journal_sequence_check",
        "workflow_journal_event_check",
        "workflow_journal_previous_hash_check",
        "workflow_journal_hash_check",
        "workflow_journal_request_hash_check",
      ])
    );
    expect(checkNames(workflowSnapshots)).toEqual(
      expect.arrayContaining([
        "workflow_snapshots_context_check",
        "workflow_snapshots_effect_hash_check",
      ])
    );
    expect(checkNames(workflowEvidence)).toContain(
      "workflow_evidence_data_check"
    );
    expect(checkNames(workflowEvidence)).toContain(
      "workflow_evidence_request_hash_check"
    );
    expect(checkNames(workflowMessages)).toContain(
      "workflow_messages_content_check"
    );
    expect(checkNames(workflowMessages)).toContain(
      "workflow_messages_idempotency_key_check"
    );
    return expect(checkNames(workflowMessages)).toContain(
      "workflow_messages_request_hash_check"
    );
  });

  return it("defines one owner-created workflow admission index", () =>
    expect(
      indexNames(workflowRuns).filter(
        (name) => name === "workflow_runs_owner_created_idx"
      )
    ).toEqual(["workflow_runs_owner_created_idx"]));
});
