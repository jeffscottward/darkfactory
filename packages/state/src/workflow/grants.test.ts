import { describe, expect, it, vi } from "vitest";

import {
  WorkflowRepositoryGrantError,
  isWorkflowRepositoryGranted,
  parseWorkflowRepositoryGrants,
} from "./grants.ts";

describe("workflow repository grants", function () {
  it("authorizes only exact owner and canonical repository pairs", function () {
    const grants = parseWorkflowRepositoryGrants(
      "owner-1=darkfactory, owner-2=sample.repo,owner-1=darkfactory"
    );

    expect(grants).toEqual([
      { ownerId: "owner-1", repositoryId: "darkfactory" },
      { ownerId: "owner-2", repositoryId: "sample.repo" },
    ]);
    expect(isWorkflowRepositoryGranted(grants, "owner-1", "darkfactory")).toBe(
      true
    );
    expect(isWorkflowRepositoryGranted(grants, "owner-2", "darkfactory")).toBe(
      false
    );
    return expect(
      isWorkflowRepositoryGranted(grants, "owner-1", "DarkFactory")
    ).toBe(false);
  });

  it("fails closed for absent and malformed grants", function () {
    expect(() => parseWorkflowRepositoryGrants(undefined)).toThrow(
      WorkflowRepositoryGrantError
    );
    expect(() => parseWorkflowRepositoryGrants("  ")).toThrow(
      WorkflowRepositoryGrantError
    );
    const results = [];
    for (const value of [
      "*=darkfactory",
      "owner-1=*",
      "owner 1=darkfactory",
      "owner-1=../darkfactory",
      "owner-1=darkfactory=extra",
      "owner-1",
      "=darkfactory",
    ]) {
      results.push(
        expect(() => parseWorkflowRepositoryGrants(value)).toThrow(
          WorkflowRepositoryGrantError
        )
      );
    }
    return results;
  });

  it("bounds grant count and encoded bytes", function () {
    const tooMany = Array.from(
      { length: 129 },
      (_, index) => `owner-${index}=darkfactory`
    ).join(",");
    expect(() => parseWorkflowRepositoryGrants(tooMany)).toThrow(
      WorkflowRepositoryGrantError
    );
    return expect(() =>
      parseWorkflowRepositoryGrants(`owner-1=${"a".repeat(16_384)}`)
    ).toThrow(WorkflowRepositoryGrantError);
  });

  it("accepts exact identifier and aggregate byte boundaries", function () {
    const owner = "o".repeat(128);
    const repository = `r${"x".repeat(62)}z`;
    const grants = parseWorkflowRepositoryGrants(
      `${" ".repeat(16_384 - owner.length - repository.length - 1)}${owner}=${repository}`
    );
    expect(grants).toEqual([{ ownerId: owner, repositoryId: repository }]);
    expect(Object.isFrozen(grants)).toBe(true);
    expect(Object.isFrozen(grants[0])).toBe(true);
    return expect(() =>
      parseWorkflowRepositoryGrants(
        `${" ".repeat(16_385 - "owner=repo".length)}owner=repo`
      )
    ).toThrow("oversized");
  });

  it("counts UTF-8 bytes portably before parsing grants", function () {
    const results1 = [];
    for (const oversized of [
      "é".repeat(8_193),
      "€".repeat(5_462),
      "😀".repeat(4_097),
    ]) {
      results1.push(
        expect(() => parseWorkflowRepositoryGrants(oversized)).toThrow(
          "oversized"
        )
      );
    }
    return results1;
  });

  it("falls back safely when a UTF-16 character has no code point", function () {
    const codePointAt = vi
      .spyOn(String.prototype, "codePointAt")
      .mockReturnValue(undefined);
    try {
      return expect(parseWorkflowRepositoryGrants("owner=repository")).toEqual([
        { ownerId: "owner", repositoryId: "repository" },
      ]);
    } finally {
      codePointAt.mockRestore();
    }
  });

  return it("accepts exactly 128 unique grants and rejects invalid identifier endings", function () {
    const maximum = Array.from(
      { length: 128 },
      (_, index) => `owner-${index}=repository-${index}`
    ).join(",");
    expect(parseWorkflowRepositoryGrants(maximum)).toHaveLength(128);
    const results2 = [];
    for (const malformed of [
      "owner-=darkfactory",
      "owner=repository-",
      `${"o".repeat(129)}=darkfactory`,
      `owner=${"r".repeat(65)}`,
    ]) {
      results2.push(
        expect(() => parseWorkflowRepositoryGrants(malformed)).toThrow(
          "invalid"
        )
      );
    }
    return results2;
  });
});
