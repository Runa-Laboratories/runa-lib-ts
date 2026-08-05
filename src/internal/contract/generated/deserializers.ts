// @generated {"contract_id":"runa-sdk-contract","generator_path":"tools/runa-contract-generator.mjs","generator_sha256":"75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1","generator_version":"0.2.0","snapshot_path":"runa-sdk-contract.snapshot.json","snapshot_sha256":"497ad3bfd712d7ed0c55289e94808435a924fd5cc909f1ab0620f860a6ebfc98","snapshot_version":"1.3.0"}
import type { GeneratedWireValue } from "./wire-types.js";

export function deserializeGeneratedResponse(text: string): GeneratedWireValue {
  return JSON.parse(text) as GeneratedWireValue;
}
