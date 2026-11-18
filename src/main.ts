import p5 from "p5";
import fragSrc from "./shaders/rorschach.frag?raw";
import vertSrc from "./shaders/rorschach.vert?raw";

/** How fast the ink morphs. Noise-time units per second. */
const DRIFT_SPEED = 0.05;
/** Overall ink coverage. Higher means more ink. */
const INK_AMOUNT = 0.3;
/** Size of the ink shapes. Higher means larger, bolder blots. */
const SHAPE_SCALE = 1.7;
/** Amount of fine detail in the shapes, 0 to 1. Lower means smoother, simpler blots. */
const DETAIL = 0.38;
/** Width of the ink edge transition. Lower means crisper edges. */
const EDGE_SOFTNESS = 0.009;
/** Upper limit on render resolution. 2 keeps edges smooth on high-DPI screens; lower it if frame rate drops. */
const MAX_PIXEL_DENSITY = 2;
/** Size in pixels of one repeat of the grain texture. */
const GRAIN_TILE = 900;

/**
 * Texture paths, relative to the page. Keep each one a complete string
 * literal: the p5.js web editor finds uploaded files by matching quoted
 * strings in sketch.js and swaps in their hosted URLs, so it can't resolve a
 * path assembled from parts.
 */
const SURFACE_TEXTURE = "textures/grunge.jpg";
const GRAIN_TEXTURE = "textures/concrete.jpg";

/** UV scale that makes a texture "cover" the canvas without distortion. */
const coverScale = (
	canvasAspect: number,
	textureAspect: number,
): [number, number] =>
	canvasAspect > textureAspect
		? [1, textureAspect / canvasAspect]
		: [canvasAspect / textureAspect, 1];

/** Fills an image with greyscale-ish values from `shade` (0 to 1), tinted. */
const paintImage = (
	img: p5.Image,
	tint: [number, number, number],
	shade: (x: number, y: number) => number,
): p5.Image => {
	img.loadPixels();
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			const v = Math.min(Math.max(shade(x, y), 0), 1) * 255;
			const i = (y * img.width + x) * 4;
			img.pixels[i] = v * tint[0];
			img.pixels[i + 1] = v * tint[1];
			img.pixels[i + 2] = v * tint[2];
			img.pixels[i + 3] = 255;
		}
	}
	img.updatePixels();
	return img;
};

const sketch = (p: p5) => {
	let inkShader: p5.Shader;
	let surface: p5.Image;
	let grain: p5.Image;
	const seed = Math.random() * 100;

	/**
	 * Procedural stand-ins, used when the texture files are missing. The
	 * textures are not in the public repo (see README), so a fresh clone runs
	 * on these.
	 */
	const fallbackSurface = () =>
		paintImage(
			p.createImage(256, 256),
			[1, 0.96, 0.88],
			(x, y) => 0.42 + 0.22 * p.noise(x * 0.012, y * 0.012, 10),
		);
	const fallbackGrain = () =>
		paintImage(
			p.createImage(512, 512),
			[1, 1, 1],
			(x, y) =>
				0.5 +
				0.35 * (Math.random() - 0.5) +
				0.3 * (p.noise(x * 0.08, y * 0.08, 20) - 0.5),
		);

	const loadTexture = async (path: string, fallback: () => p5.Image) => {
		const img = await p.loadImage(path).catch(() => undefined);
		if (img && img.width > 0) return img;
		console.info(`Texture "${path}" not found; using a generated texture.`);
		return fallback();
	};

	p.setup = async () => {
		[surface, grain] = await Promise.all([
			loadTexture(SURFACE_TEXTURE, fallbackSurface),
			loadTexture(GRAIN_TEXTURE, fallbackGrain),
		]);

		p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
		p.pixelDensity(Math.min(window.devicePixelRatio, MAX_PIXEL_DENSITY));
		p.noStroke();
		p.textureWrap(p.MIRROR);

		inkShader = p.createShader(vertSrc, fragSrc);
	};

	p.draw = () => {
		p.shader(inkShader);
		inkShader.setUniform("uResolution", [p.width, p.height]);
		inkShader.setUniform("uTime", (p.millis() / 1000) * DRIFT_SPEED);
		inkShader.setUniform("uSeed", seed);
		inkShader.setUniform("uSurface", surface);
		inkShader.setUniform(
			"uSurfaceScale",
			coverScale(p.width / p.height, surface.width / surface.height),
		);
		inkShader.setUniform("uGrain", grain);
		inkShader.setUniform("uGrainTile", GRAIN_TILE);
		inkShader.setUniform("uInkAmount", INK_AMOUNT);
		inkShader.setUniform("uShapeScale", SHAPE_SCALE);
		inkShader.setUniform("uDetail", DETAIL);
		inkShader.setUniform("uEdgeSoftness", EDGE_SOFTNESS);
		p.plane(p.width, p.height);
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
	};
};

new p5(sketch);
