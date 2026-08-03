// @generated {"contract_id":"runa-sdk-contract","generator_path":"tools/runa-contract-generator.mjs","generator_sha256":"75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1","generator_version":"0.2.0","snapshot_path":"runa-sdk-contract.snapshot.json","snapshot_sha256":"a5dd2ebb2c0cc509051774e3d184386cf5d9f845865267d8ba38278cb47ad6a4","snapshot_version":"1.1.0"}
import type { GeneratedWireValue } from "./wire-types.js";

export function deserializeGeneratedResponse(text: string): GeneratedWireValue {
  return JSON.parse(text) as GeneratedWireValue;
}
