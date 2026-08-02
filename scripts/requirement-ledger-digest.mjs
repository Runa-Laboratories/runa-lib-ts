import { createHash } from "node:crypto";

export function requirementRowsDigest(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Requirement ledger rows must be an array.");
  }
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function verifyRequirementRowsDigest(ledger) {
  const derived = requirementRowsDigest(ledger?.rows);
  if (ledger?.source_digest !== derived) {
    throw new Error("Requirement ledger source_digest is stale or substituted.");
  }
  return derived;
}
