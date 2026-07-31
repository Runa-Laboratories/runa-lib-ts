import assert from "node:assert/strict";
import { test } from "vitest";
import { Runa } from "../dist/index.js";
import { API_KEY, jsonResponse, meFixture, openUrl, recordFixture, sessionFixture } from "./helpers.mjs";

test("PRD-019/054 five synthetic journeys pass 30 times with cleanup", async () => {
  const journeys = ["ttfc", "records", "first-session", "first-exec", "lifecycle-open"];
  const counts = Object.fromEntries(journeys.map((name) => [name, 0]));
  let deletions = 0;
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/v1/me") return jsonResponse(meFixture());
    if (path === "/v1/records") return jsonResponse([recordFixture()]);
    if (path === "/v1/sessions" && init.method === "POST") return jsonResponse(sessionFixture(), 201);
    if (init.method === "DELETE") { deletions += 1; return jsonResponse({ ok: true }); }
    if (path.endsWith("/exec")) return jsonResponse({
      exit_code: 0, stdout: "ok", stderr: "", duration_ms: 1,
      stdout_truncated: false, stderr_truncated: false
    });
    if (path.endsWith("/checkpoint")) return jsonResponse({ ok: true });
    if (path.endsWith("/open")) return jsonResponse({ url: openUrl() });
    return jsonResponse(sessionFixture());
  };
  for (let run = 0; run < 30; run += 1) {
    let runa = new Runa({ apiKey: API_KEY, baseUrl: "https://sdk.example.invalid", fetch });
    await runa.me(); await runa.close(); counts.ttfc += 1;
    runa = new Runa({ apiKey: API_KEY, baseUrl: "https://sdk.example.invalid", fetch });
    await runa.records.list(); await runa.close(); counts.records += 1;
    for (const journey of ["first-session", "first-exec", "lifecycle-open"]) {
      runa = new Runa({ apiKey: API_KEY, baseUrl: "https://sdk.example.invalid", fetch });
      const session = await runa.sessions.create(journey);
      try {
        if (journey === "first-exec") await session.exec("true");
        if (journey === "lifecycle-open") {
          await session.pause(); await session.resume();
          await session.checkpoint("smoke"); await session.open();
        }
        counts[journey] += 1;
      } finally {
        await session.delete();
        await runa.close();
      }
    }
  }
  assert.deepEqual(Object.values(counts), [30, 30, 30, 30, 30]);
  assert.equal(deletions, 90);
});
