import { defineConfig } from "vite";

export default defineConfig({
	build: {
		// p5 is a single ~1.2 MB module; splitting it gains nothing for a sketch.
		chunkSizeWarningLimit: 1500,
	},
});
