import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "docs/reference-manifest.json"), "utf8"));
const reflection = JSON.parse(await readFile(path.join(root, "docs/.reflection.json"), "utf8"));
const reflected = new Set();
const visit = (node) => {
  if (node && typeof node === "object") {
    if (typeof node.name === "string") reflected.add(node.name);
    for (const value of Object.values(node)) visit(value);
  }
};
visit(reflection);
for (const name of [...manifest.runtime, ...manifest.types]) {
  if (!reflected.has(name)) throw new Error(`Missing public declaration: ${name}`);
}
const destination = path.join(root, "docs/api");
await mkdir(destination, { recursive: true });
const descriptions = {
  Runa: "Constructible client. Owns resources and closes deterministically.",
  Session: "Client-owned rich handle. It cannot be constructed directly.",
  stdoutText: "Returns stdout only when the wire value is a string.",
  stderrText: "Returns stderr only when the wire value is a string.",
  ConfigError: "Fixed, safe configuration error.",
  ApiError: "Fixed, safe HTTP or malformed-response error.",
  CommandError: "Reserved non-constructible command error marker.",
  RunaError: "Base class for normalized public SDK errors."
};
for (const [file, names] of Object.entries(manifest.pages)) {
  const title = file.replace(/\.md$/, "").replaceAll("-", " ");
  const body = [`# ${title}`, "", "Generated from the packed root declaration. Do not edit by hand.", ""];
  for (const name of names) {
    body.push(`## ${name}`, "", descriptions[name] ?? `Public TypeScript ${manifest.runtime.includes(name) ? "value" : "type"} \`${name}\`.`, "");
  }
  await writeFile(path.join(destination, file), `${body.join("\n")}\n`);
}
await writeFile(path.join(destination, "README.md"), [
  "# API reference",
  "",
  "Curated from the released root declaration.",
  "",
  "- [Core](Core.md)",
  "- [Sessions](Sessions.md)",
  "- [Account and records](Account-and-records.md)",
  "- [Shared](Shared.md)",
  ""
].join("\n"));
await writeFile(path.join(destination, "manifest.json"), `${JSON.stringify({
  schema_version: 1,
  source: "dist/index.d.ts",
  runtime: manifest.runtime,
  types: manifest.types,
  pages: manifest.pages
}, null, 2)}\n`);
