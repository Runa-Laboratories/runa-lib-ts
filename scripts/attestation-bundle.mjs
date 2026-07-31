import assert from "node:assert/strict";

const findEnvelope = (value) => {
  if (value === null || typeof value !== "object") return undefined;
  if (typeof value.payload === "string" &&
      Array.isArray(value.signatures)) return value;
  for (const child of Object.values(value)) {
    const found = findEnvelope(child);
    if (found !== undefined) return found;
  }
  return undefined;
};

export function validateAttestationJsonl(text, candidate) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  assert(lines.length > 0, "R-018-10: attestation bundle is empty");
  const statements = lines.map((line) => {
    const row = JSON.parse(line);
    const envelope = findEnvelope(row);
    if (envelope === undefined && row._type ===
        "https://in-toto.io/Statement/v1") return row;
    assert.notEqual(envelope, undefined);
    return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
  });
  const matching = statements.filter((statement) =>
    statement._type === "https://in-toto.io/Statement/v1" &&
    statement.predicateType === "https://slsa.dev/provenance/v1" &&
    Array.isArray(statement.subject) &&
    statement.subject.length === 1 &&
    statement.subject.some((subject) =>
      subject.name === candidate.filename &&
      subject.digest?.sha256 === candidate.sha256));
  assert.equal(matching.length, 1,
    "R-018-11: exact artifact subject provenance is absent or ambiguous");
  return true;
}
