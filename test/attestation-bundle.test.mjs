import assert from "node:assert/strict";
import { test } from "vitest";
import { validateAttestationJsonl } from "../scripts/attestation-bundle.mjs";

const candidate = {
  filename: "runa_laboratories-sdk-1.2.3.tgz",
  sha256: "a".repeat(64),
};
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{
    name: candidate.filename,
    digest: { sha256: candidate.sha256 },
  }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {},
};

test("attestation bundle is bound to the exact npm tarball", () => {
  assert.equal(validateAttestationJsonl(`${JSON.stringify(statement)}\n`, candidate), true);
  for (const mutate of [
    (value) => { value.subject[0].name = "other.tgz"; },
    (value) => { value.subject[0].digest.sha256 = "b".repeat(64); },
    (value) => { value.predicateType = "https://example.invalid/predicate"; },
    (value) => { value.subject.push(structuredClone(value.subject[0])); },
  ]) {
    const hostile = structuredClone(statement);
    mutate(hostile);
    assert.throws(() =>
      validateAttestationJsonl(`${JSON.stringify(hostile)}\n`, candidate));
  }
  assert.throws(() => validateAttestationJsonl("", candidate));
});
