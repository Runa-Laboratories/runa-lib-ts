import { readFile, writeFile } from "node:fs/promises";
import { recoveryPlan } from "./postpublish-policy.mjs";

const mapping = JSON.parse(await readFile("governance/release-mapping.json", "utf8"));
const reason = process.argv[2] ?? "postpublish-verification-failed";
const authorityApproved =
  process.env.RUNA_WITHDRAWAL_AUTHORITY_APPROVED === "true";
const plan = recoveryPlan(mapping, reason, authorityApproved);
await writeFile("evidence/release-recovery-plan.json",
  `${JSON.stringify(plan, null, 2)}\n`);
console.log(`release recovery: ${plan.status} (${plan.plan})`);
