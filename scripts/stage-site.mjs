import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const project = resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(readFileSync(resolve(project, ".openai/hosting.json"), "utf8"));
const webManifest = JSON.parse(
  readFileSync(resolve(project, "apps/web/.openai/hosting.json"), "utf8"),
);
if (JSON.stringify(rootManifest) !== JSON.stringify(webManifest))
  throw new Error("Root and browser hosting manifests must describe the same Site.");
const output = resolve(project, "dist");
rmSync(output, { recursive: true, force: true });
cpSync(resolve(project, "apps/web/dist"), output, { recursive: true });
mkdirSync(resolve(output, ".openai/drizzle"), { recursive: true });
cpSync(resolve(project, "apps/web/drizzle"), resolve(output, ".openai/drizzle"), {
  recursive: true,
});
console.log("Staged the validated browser build from the Vocabularium monorepo.");
