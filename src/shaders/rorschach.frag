precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;     // canvas size in pixels
uniform float uTime;          // drift time (already scaled by drift speed)
uniform float uSeed;          // per-load random offset into the noise field

uniform sampler2D uSurface;   // low-frequency stains: base colour of the fabric
uniform vec2 uSurfaceScale;   // "cover" fit of the surface texture to the canvas
uniform sampler2D uGrain;     // high-frequency grain: fibre detail on the fabric and through the ink
uniform float uGrainTile;     // grain repeat size in pixels

// Look tuning
uniform float uInkAmount;     // overall ink coverage
uniform float uEdgeSoftness;  // width of the ink edge transition
uniform float uShapeScale;    // size of the ink shapes
uniform float uDetail;        // fbm persistence: how strong the fine octaves are

// ---------------------------------------------------------------------------
// 3D simplex noise
// Ashima Arts / Stefan Gustavson, MIT licence
// https://github.com/ashima/webgl-noise
// ---------------------------------------------------------------------------
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Fractal noise, normalised to roughly [-1, 1] whatever the detail level
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * snoise(p);
    total += amp;
    p = p * 2.03 + vec3(17.1, 9.2, 3.7);
    amp *= uDetail;
  }
  return sum / total;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  float aspect = uResolution.x / uResolution.y;

  // Centred coordinates, height spans [-0.5, 0.5]
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

  // The Rorschach fold: mirror left onto right
  vec2 m = vec2(abs(p.x), p.y);

  // Domain-warped noise field that drifts through time
  vec2 s = m / uShapeScale;
  vec3 q = vec3(s * 2.2, uTime);
  vec2 warp = vec2(
    fbm(q + vec3(uSeed, 0.0, 0.0)),
    fbm(q + vec3(5.2, uSeed + 1.3, 0.0))
  );
  float n = fbm(vec3(s * 2.6 + warp * 1.1, uTime * 0.7 + uSeed * 0.37));

  // Keep the blots gathered around the centre, and let them meet the fold
  float envelope = 1.0 - smoothstep(0.1, 0.7, length(m * vec2(0.85, 1.0)));
  float fold = exp(-m.x * m.x * 60.0) * 0.12;

  // Fabric grain (not mirrored, so the edges are never perfectly symmetric)
  vec2 grainUv = vUv * uResolution / uGrainTile;
  float grain = luma(texture2D(uGrain, grainUv).rgb);

  // Smooth, organic edge wobble. Uses unmirrored coordinates so the two
  // halves differ slightly, as a real fold never prints perfectly.
  float wobble = snoise(vec3(p * 18.0, uTime * 0.7 + uSeed)) * 0.65
               + snoise(vec3(p * 50.0, uTime * 0.5 + uSeed * 1.7)) * 0.35;

  // Signed ink field: > 0 is ink
  float d = n + envelope * 0.5 - (1.0 - envelope) * 0.3 + fold - (0.65 - uInkAmount);
  // Larger shapes have gentler gradients; rescale so edge width stays constant
  d *= uShapeScale;
  d += wobble * 0.01;
  d += (grain - 0.5) * 0.015; // faint fibre tooth only

  // Ink density: a slightly lighter wet rim building to a saturated core
  float rim = smoothstep(-uEdgeSoftness, uEdgeSoftness, d);
  float core = smoothstep(0.0, 0.08, d);
  float density = rim * mix(0.9, 1.0, core);
  // Fibres show faintly through the ink
  density *= 1.0 - 0.12 * (grain - 0.5);

  // Wicking: ink creeping into the fibres just beyond the edge
  float wickNoise = snoise(vec3(p * 12.0, uTime * 0.3 + uSeed + 3.0)) * 0.5 + 0.5;
  float wick = pow(smoothstep(-0.06, 0.0, d), 2.0) * (1.0 - rim) * (0.3 + 0.7 * wickNoise);

  // Fabric colour: warm off-white tinted by the stains, roughened by the grain
  vec3 stains = texture2D(uSurface, (vUv - 0.5) * uSurfaceScale + 0.5).rgb;
  vec3 paper = mix(vec3(0.93, 0.91, 0.86), stains * 1.55, 0.28);
  paper *= 0.9 + 0.2 * grain;

  // Ink is multiplied onto the fabric so stains and fibres carry through it
  vec3 inkTint = vec3(0.065, 0.06, 0.062);
  vec3 col = paper * (1.0 - 0.18 * wick);
  col *= mix(vec3(1.0), inkTint, clamp(density, 0.0, 1.0));

  // Soft vignette
  float vignette = smoothstep(0.35, 1.0, length(p * vec2(0.75, 1.0)));
  col *= 1.0 - 0.45 * vignette;

  gl_FragColor = vec4(col, 1.0);
}
