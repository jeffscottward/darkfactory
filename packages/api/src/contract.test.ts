import { describe, expect, it } from "vitest";

import { buildOpenApiDocument, serializeOpenApiDocument } from "./openapi.ts";
import { FeatureItemMetadataSchema, appContract } from "./contract.ts";

const expectedOperations = [
  ["get", "/feature-items", "featureItems.list"],
  ["get", "/feature-items/{id}", "featureItems.get"],
  ["post", "/feature-items", "featureItems.create"],
  ["patch", "/feature-items/{id}", "featureItems.update"],
  ["patch", "/feature-items/{id}/status", "featureItems.changeStatus"],
  ["delete", "/feature-items/{id}", "featureItems.archive"],
  ["get", "/admin/feature-items", "admin.featureItems.list"],
  ["get", "/preferences/theme", "preferences.theme.get"],
  ["patch", "/preferences/theme", "preferences.theme.update"],
] as const;

const expectedErrorStatuses = ["400", "401", "403", "404", "409", "422", "503"];

describe("DF-051/052 oRPC application contract", function () {
  it("does not expose development operator procedures or routes", async function () {
    expect(appContract).not.toHaveProperty("operator");
    const document = await buildOpenApiDocument();
    return expect(
      Object.keys(document.paths ?? {}).filter((path) =>
        path.startsWith("/operator")
      )
    ).toEqual([]);
  });

  it("publishes every feature operation and the real admin operation", async function () {
    const document = await buildOpenApiDocument();

    const results = [];
    for (const [method, path, operationId] of expectedOperations.slice(0, 7)) {
      const operation = document.paths![path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation?.operationId).toBe(operationId);
      results.push(
        expect(operation?.tags).toContain(
          operationId.startsWith("admin.") ? "Admin" : "Feature items"
        )
      );
    }
    return results;
  });

  it("documents authenticated theme read and exact update operations", async function () {
    const document = await buildOpenApiDocument();

    const results1 = [];
    for (const [method, path, operationId] of expectedOperations.slice(7)) {
      const operation = document.paths![path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.tags).toEqual(["Preferences"]);
      results1.push(
        expect(Object.keys(operation?.responses ?? {})).toEqual(
          expect.arrayContaining(["401", "422", "503"])
        )
      );
    }
    return results1;
  });

  it("documents typed expected errors for every owner-scoped feature operation", async function () {
    const document = await buildOpenApiDocument();

    const results2 = [];
    for (const [method, path, operationId] of expectedOperations.slice(0, 6)) {
      const responses = document.paths![path]?.[method]?.responses;
      results2.push(
        expect(Object.keys(responses ?? {}), operationId).toEqual(
          expect.arrayContaining(expectedErrorStatuses)
        )
      );
    }
    return results2;
  });

  it("documents authentication, authorization, and storage failures for admin", async function () {
    const document = await buildOpenApiDocument();
    const responses = document.paths!["/admin/feature-items"]?.get?.responses;

    return expect(Object.keys(responses ?? {})).toEqual(
      expect.arrayContaining(["401", "403", "503"])
    );
  });

  it("serializes the generated OpenAPI document deterministically", async function () {
    const first = serializeOpenApiDocument(await buildOpenApiDocument());
    const second = serializeOpenApiDocument(await buildOpenApiDocument());

    expect(first).toBe(second);
    return expect(first.endsWith("\n")).toBe(true);
  });

  return it("round-trips nested JSON metadata and rejects non-JSON values", function () {
    const metadata = {
      label: "release",
      nested: { enabled: true, count: 3, values: [null, "stable"] },
    };

    expect(FeatureItemMetadataSchema.parse(metadata)).toEqual(metadata);
    return expect(() =>
      FeatureItemMetadataSchema.parse({
        invalid: undefined,
      } as never)
    ).toThrow();
  });
});
