import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const backgroundSources = ["background.js", "influence-background.js", "influence-shared.js"];

export async function copyBackground(root, destination, manifest) {
  if (manifest.manifest_version === 3) {
    for (const source of backgroundSources) await cp(join(root, source), join(destination, source));
    return;
  }
  // Firefox MV2 loads classic scripts. Compile the same background modules to an IIFE.
  const require = createRequire(join(root, "content-scripts/package.json"));
  const { rollup } = await import(pathToFileURL(require.resolve("rollup")).href);
  const bundle = await rollup({ input: join(root, "background.js") });
  try { await bundle.write({ file: join(destination, "background.js"), format: "iife" }); }
  finally { await bundle.close(); }
}
