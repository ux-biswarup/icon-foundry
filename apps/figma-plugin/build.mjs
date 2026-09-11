// Bundles the plugin sandbox code and the UI, inlining the UI bundle into ui.html.
import { build, context } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const mainOptions = {
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: "es2017",
  outfile: resolve(root, "dist/main.js"),
  logLevel: "info",
};

const uiOptions = {
  entryPoints: [resolve(root, "src/ui.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  write: false,
  minify: !watch,
  logLevel: "info",
};

async function writeUiHtml(js) {
  const template = await readFile(resolve(root, "src/ui.html"), "utf8");
  const html = template.replace("<!--SCRIPT-->", `<script>${js}</script>`);
  await writeFile(resolve(root, "dist/ui.html"), html);
}

await mkdir(resolve(root, "dist"), { recursive: true });

if (watch) {
  const mainCtx = await context(mainOptions);
  const uiCtx = await context({
    ...uiOptions,
    plugins: [
      {
        name: "inline-ui",
        setup(b) {
          b.onEnd(async (result) => {
            const file = result.outputFiles?.[0];
            if (file) await writeUiHtml(file.text);
          });
        },
      },
    ],
  });
  await Promise.all([mainCtx.watch(), uiCtx.watch()]);
  console.log("watching…");
} else {
  await build(mainOptions);
  const result = await build(uiOptions);
  await writeUiHtml(result.outputFiles[0].text);
  console.log("built dist/main.js and dist/ui.html");
}
