import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createReleaseManifestCore,
  releaseManifestCoreBytes,
} from "./release-manifest-core.mjs";

const handoffRoot = process.env.RUNA_HANDOFF_ROOT ?? ".";
const core = await createReleaseManifestCore({ handoffRoot });
const output = path.join(
  handoffRoot,
  "release-artifacts/release-manifest-core.json",
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, releaseManifestCoreBytes(core));
console.log(`release manifest core: PASS (${core.candidate.sha256})`);
