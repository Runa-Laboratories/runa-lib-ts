import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  requirementRowsDigest,
  verifyRequirementRowsDigest,
} from "../scripts/requirement-ledger-digest.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("requirement ledger digest", () => {
  test("recomputes the digest from serialized output rows and rejects a stale mutation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "runa-requirement-ledger-"));
    temporaryDirectories.push(directory);
    const output = path.join(directory, "requirement-test-map.json");
    const rows = [
      {
        requirement: "R-020-01",
        scope: "typescript",
        prd: "prds/libs/typescript/PRD-020-ts-package-and-build-foundation.md",
        acceptance_test_ids: ["TC-020-01"],
        status: "NOT_RUN",
        evidence_missing: "No exact-ID execution receipt is retained.",
      },
    ];
    await writeFile(output, `${JSON.stringify({
      source_digest: requirementRowsDigest(rows),
      rows,
    }, null, 2)}\n`);

    const ledger = JSON.parse(await readFile(output, "utf8"));
    expect(verifyRequirementRowsDigest(ledger)).toBe(ledger.source_digest);

    ledger.rows[0].status = "PASS";
    delete ledger.rows[0].evidence_missing;
    expect(() => verifyRequirementRowsDigest(ledger)).toThrow(/stale or substituted/);
  });
});
