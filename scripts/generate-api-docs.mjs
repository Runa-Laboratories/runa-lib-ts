import { runReferencePipeline } from "./reference/pipeline.mjs";

const result = await runReferencePipeline();
console.log(`api reference: PASS (${result.model.entries.length} entries, ${result.outputDigest})`);
