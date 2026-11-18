/**
 * Builds a version of the sketch for the p5.js web editor (editor.p5js.org).
 *
 * The editor has no bundler, so this outputs:
 * - sketch.js: plain, readable JavaScript with the shaders inlined, which uses
 *   the global `p5` loaded from a CDN instead of importing it
 * - index.html: loads the same p5 version as package-lock.json from jsDelivr
 * - textures/: copied from public/, to upload into a `textures` folder
 */
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const p5Version: string = JSON.parse(
	readFileSync(
		new URL("./node_modules/p5/package.json", import.meta.url),
		"utf8",
	),
).version;

const editorIndexHtml = (): Plugin => ({
	name: "p5-editor-index-html",
	generateBundle() {
		this.emitFile({
			type: "asset",
			fileName: "index.html",
			source: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rorschach</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #111; }
      canvas { display: block; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/p5@${p5Version}/lib/p5.min.js"></script>
  </head>
  <body>
    <script src="sketch.js"></script>
  </body>
</html>
`,
		});
	},
});

/**
 * Resolves `import p5 from "p5"` to the global loaded by index.html.
 *
 * Marking p5 as external instead makes the bundler add an ESM interop helper
 * containing an unbraced `if (...) for (...)` loop. The editor's loop
 * protection rewrites loops and breaks on that form, throwing
 * "ReferenceError: _LP0 is not defined". This shim keeps sketch.js loop-free.
 */
const P5_GLOBAL_ID = "\0p5-global";
const p5Global = (): Plugin => ({
	name: "p5-global",
	enforce: "pre",
	resolveId(id) {
		return id === "p5" ? P5_GLOBAL_ID : null;
	},
	load(id) {
		return id === P5_GLOBAL_ID ? "export default window.p5;" : null;
	},
});

export default defineConfig({
	plugins: [p5Global(), editorIndexHtml()],
	build: {
		outDir: "dist-editor",
		emptyOutDir: true,
		minify: false,
		lib: {
			entry: "src/main.ts",
			formats: ["iife"],
			name: "Rorschach",
			fileName: () => "sketch.js",
		},
	},
});
