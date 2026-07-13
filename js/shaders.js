/*
 * Shader library. Each entry:
 *   id / name / desc  — identity + description shown under the dropdown
 *   params            — auto-generates the control panel
 *                       { key, label, type: "range" | "color", ... }
 *   frag              — GLSL ES 3.00 fragment body. A common header is
 *                       prepended by the engine (u_time, u_resolution,
 *                       fragColor out). Declare your own param uniforms.
 *
 * Every shader colors itself through a shared 6-stop gradient ramp
 * (RAMP_PARAMS + RAMP_GLSL) so the whole set stays on one palette.
 * To add a shader: append an object here, call ramp(t) with t in 0..1.
 */

// Brand ramp: indigo → blue-violet → periwinkle → lavender → blush → cream.
const RAMP_PARAMS = [
  { key: "u_c0", label: "Stop 1", type: "color", value: "#3d33c2" },
  { key: "u_c1", label: "Stop 2", type: "color", value: "#4d46dd" },
  { key: "u_c2", label: "Stop 3", type: "color", value: "#7568cf" },
  { key: "u_c3", label: "Stop 4", type: "color", value: "#c2a4dd" },
  { key: "u_c4", label: "Stop 5", type: "color", value: "#eec4bb" },
  { key: "u_c5", label: "Stop 6", type: "color", value: "#f9e6c3" },
];

// Curated 6-stop ramps for the randomize button — every palette stays
// inside the Mercor brand family (indigo / blue-violet / periwinkle /
// lavender / blush / cream), so randomized visuals are always on-brand.
const PALETTES = [
  ["#3d33c2", "#4d46dd", "#7568cf", "#c2a4dd", "#eec4bb", "#f9e6c3"], // brand core
  ["#271ed2", "#4a3ef4", "#7568cf", "#c2a4dd", "#fddbd3", "#ffffff"], // electric indigo
  ["#070019", "#261075", "#4e22ec", "#7568cf", "#c2a4dd", "#f2c5ec"], // midnight
  ["#140f6e", "#2a22c4", "#4d46dd", "#9187e0", "#c2a4dd", "#e9defa"], // deep indigo
  ["#4d46dd", "#7568cf", "#c2a4dd", "#eec4bb", "#f9e6c3", "#fffaf0"], // blush forward
  ["#0d0a33", "#221b7a", "#3d33c2", "#6f66d9", "#a9a3ec", "#e6e4fb"], // mono indigo
  ["#2a2160", "#4c3f9e", "#7568cf", "#a08fdc", "#cbb6e8", "#f4ecf7"], // lavender haze
  ["#1a0f2e", "#3d2462", "#7157a8", "#a98fc8", "#dcbcd4", "#f9e6dd"], // night blush
];

const RAMP_GLSL = `
uniform vec3 u_c0, u_c1, u_c2, u_c3, u_c4, u_c5;
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  vec3 c = mix(u_c0, u_c1, clamp(t, 0.0, 1.0));
  c = mix(c, u_c2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, u_c3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, u_c4, clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, u_c5, clamp(t - 4.0, 0.0, 1.0));
  return c;
}
`;

// Shared noise helpers, injected into shaders that ask for them.
const NOISE_LIB = `
float hash1(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash1(i);
  float b = hash1(i + vec2(1.0, 0.0));
  float c = hash1(i + vec2(0.0, 1.0));
  float d = hash1(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm5(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.03;
    a *= 0.5;
  }
  return v;
}
`;

// 64x32 equirectangular world land mask ('#' = land), row 0 = 90..84.4N,
// each row is eight 8-column blocks (5.625deg per cell). Coarse but placed
// from real geography; packed into GLSL uints below.
const WORLD_MAP = [
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "####.###" + "###....." + "........" + ".##....." + "........" + "........",
  "........" + "..######" + "##.#####" + "#####..." + ".###...." + ".###...." + "####...." + "###.....",
  "..###..." + "########" + "#####.##" + "####...." + "...#####" + "########" + "########" + "########",
  "..######" + "#######." + ".####.##" + "#..###.." + "########" + "########" + "########" + "########",
  "....####" + "#######." + "...####." + ".......#" + ".##.####" + "########" + "########" + "#...#...",
  "........" + ".#######" + "#.#####." + "......##" + "########" + "########" + "########" + "##..#...",
  "........" + ".#######" + "#######." + ".......#" + "########" + "########" + "########" + "#.......",
  "........" + ".#######" + "####...." + "......##" + "#####..#" + "#.######" + "########" + "##......",
  "........" + "..######" + "###....." + "......##" + "########" + "########" + "######.#" + "#.......",
  "........" + "...#####" + "##......" + "......##" + "########" + "########" + "######.." + "........",
  "........" + "...####." + ".#......" + ".....###" + "########" + "###.####" + "######.." + "........",
  "........" + ".....###" + ".####..." + ".....###" + "########" + "###.####" + ".###.#.." + "........",
  "........" + ".......#" + "##......" + "....####" + "########" + "#....##." + ".###.##." + "........",
  "........" + "........" + ".######." + ".....###" + "########" + "##....#." + ".######." + "........",
  "........" + "........" + ".#######" + "........" + ".#######" + "........" + ".#####.." + "........",
  "........" + "........" + ".#######" + "##......" + "..######" + "........" + ".#####.#" + "###.....",
  "........" + "........" + "..######" + "##......" + "..######" + "........" + "..#####." + "#####...",
  "........" + "........" + "..######" + "##......" + "..######" + "#......." + ".....###" + "##......",
  "........" + "........" + "...#####" + "#......." + "..######" + "#......." + "....####" + "###.....",
  "........" + "........" + "...#####" + "........" + "..####.#" + "........" + "....####" + "####....",
  "........" + "........" + "...####." + "........" + "...###.." + "........" + "....####" + "####....",
  "........" + "........" + "...###.." + "........" + "...##..." + "........" + "....#..." + "###...##",
  "........" + "........" + "..###..." + "........" + "........" + "........" + "........" + ".##..###",
  "........" + "........" + "..###..." + "........" + "........" + "........" + "........" + ".....##.",
  "........" + "........" + "..###..." + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
  "........" + "........" + "........" + "........" + "........" + "........" + "........" + "........",
];

// pack each 64-char row into two 32-bit words for the GLSL const array
const MAP_WORDS = WORLD_MAP.map((row) => {
  let w0 = 0, w1 = 0;
  for (let i = 0; i < 32; i++) {
    if (row[i] === "#") w0 |= 1 << (31 - i);
    if (row[32 + i] === "#") w1 |= 1 << (31 - i);
  }
  return [w0 >>> 0, w1 >>> 0];
});

const MAP_GLSL = `
const uint MAP[64] = uint[64](${MAP_WORDS.flat().map((w) => "0x" + w.toString(16) + "u").join(", ")});
float mapAt(ivec2 c) {
  if (c.x < 0 || c.x > 63 || c.y < 0 || c.y > 31) return 0.0;
  uint w = MAP[c.y * 2 + (c.x >> 5)];
  return float((w >> uint(31 - (c.x & 31))) & 1u);
}
float mapBilinear(vec2 mc) {
  vec2 i = floor(mc - 0.5);
  vec2 fp = fract(mc - 0.5);
  float a = mapAt(ivec2(i));
  float b = mapAt(ivec2(i) + ivec2(1, 0));
  float c = mapAt(ivec2(i) + ivec2(0, 1));
  float d = mapAt(ivec2(i) + ivec2(1, 1));
  return mix(mix(a, b, fp.x), mix(c, d, fp.x), fp.y);
}
`;

const SHADERS = [

  // ------------------------------------------------------------ plasma
  {
    id: "plasma",
    name: "Plasma Field",
    desc: "Layered sine-wave interference — the classic demoscene effect, colored through the 6-stop ramp.",
    params: [
      { key: "u_scale",  label: "Scale",  type: "range", min: 0.5, max: 8,  step: 0.01, value: 3.0 },
      { key: "u_speed",  label: "Speed",  type: "range", min: 0,   max: 3,  step: 0.01, value: 1.0 },
      { key: "u_warp",   label: "Warp",   type: "range", min: 0,   max: 3,  step: 0.01, value: 1.0 },
      { key: "u_bands",  label: "Bands",  type: "range", min: 0.5, max: 5,  step: 0.01, value: 1.0 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + `
uniform float u_scale, u_speed, u_warp, u_bands;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  uv *= u_scale;
  float t = u_time * u_speed;

  float v = 0.0;
  v += sin(uv.x + t);
  v += sin(0.5 * (uv.y + t));
  v += sin(0.33 * (uv.x + uv.y + t));
  vec2 c = uv + vec2(sin(t * 0.3), cos(t * 0.47)) * u_warp * 2.0;
  v += sin(sqrt(dot(c, c) + 1.0) + t);
  v *= 0.5;

  vec3 col = ramp(0.5 + 0.5 * sin(v * 3.14159 * u_bands + t * 0.2));

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ nebula
  {
    id: "nebula",
    name: "Nebula",
    desc: "Domain-warped fractal Brownian motion. Noise fed into noise fed into noise — organic gas-cloud structure.",
    params: [
      { key: "u_zoom",    label: "Zoom",    type: "range", min: 0.5, max: 6,   step: 0.01, value: 1.8 },
      { key: "u_speed",   label: "Speed",   type: "range", min: 0,   max: 2,   step: 0.01, value: 0.5 },
      { key: "u_octaves", label: "Octaves", type: "range", min: 1,   max: 8,   step: 1,    value: 5 },
      { key: "u_gain",    label: "Gain",    type: "range", min: 0.3, max: 0.8, step: 0.01, value: 0.55 },
      { key: "u_warp",    label: "Warp",    type: "range", min: 0,   max: 8,   step: 0.01, value: 4.0 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_zoom, u_speed, u_octaves, u_gain, u_warp;

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_octaves) break;
    v += a * vnoise(p);
    p = r * p * 2.03;
    a *= u_gain;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y * u_zoom;
  float t = u_time * u_speed;

  vec2 q = vec2(fbm(uv + vec2(0.0, t * 0.25)),
                fbm(uv + vec2(5.2, t * 0.20)));
  vec2 r = vec2(fbm(uv + u_warp * q + vec2(1.7, 9.2) + t * 0.15),
                fbm(uv + u_warp * q + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm(uv + u_warp * r);

  float shade = clamp(f * 1.5 - 0.12 + 0.3 * length(q) * f, 0.0, 1.0);
  vec3 col = ramp(shade);
  col += u_c5 * pow(clamp(r.x, 0.0, 1.0), 4.0) * 0.3;

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ dither
  {
    id: "dither",
    name: "Dither",
    desc: "A tone field (noise or your image) re-rendered through retro raster styles: Bayer dither, ASCII, halftone, dots, LEGO studs, voxels, LED, lattice.",
    params: [
      { key: "u_style",  label: "Style",      type: "select", value: 0,
        options: ["Dither", "ASCII", "Halftone", "Dots", "LEGO", "Voxel", "LED", "Lattice"] },
      { key: "u_image",  label: "Image",      type: "image" },
      { key: "u_pixel",  label: "Pixel Size", type: "range", min: 1,   max: 16, step: 1,    value: 4 },
      { key: "u_levels", label: "Levels",     type: "range", min: 2,   max: 8,  step: 1,    value: 4 },
      { key: "u_scale",  label: "Scale",      type: "range", min: 0.5, max: 6,  step: 0.01, value: 2.0 },
      { key: "u_speed",  label: "Speed",      type: "range", min: 0,   max: 2,  step: 0.01, value: 0.5 },
      { key: "u_motion", label: "Motion",     type: "range", min: 0,   max: 1,  step: 0.01, value: 0.2 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_style, u_pixel, u_levels, u_scale, u_speed, u_motion;
uniform sampler2D u_image;
uniform float u_hasImage;
uniform vec2 u_imageSize;

float bayer4(vec2 p) {
  const int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}

// the tone field: image luminance (rigid, with tonal shimmer) or drifting fbm
float field(vec2 st, float t) {
  float v;
  if (u_hasImage > 0.5) {
    float cAsp = u_resolution.x / u_resolution.y;
    float iAsp = u_imageSize.x / u_imageSize.y;
    vec2 k = cAsp > iAsp ? vec2(1.0, iAsp / cAsp) : vec2(cAsp / iAsp, 1.0);
    vec2 uv = 0.5 + (st - 0.5) * k;
    vec3 texc = texture(u_image, clamp(uv, 0.0, 1.0)).rgb;
    v = dot(texc, vec3(0.299, 0.587, 0.114));
    v += (vnoise(st * 14.0 * u_scale + vec2(t, -t * 0.7)) - 0.5) * u_motion * 0.2;
  } else {
    vec2 uvn = (st * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 wob = (vec2(vnoise(st * 6.0 * u_scale + vec2(0.0, t)),
                     vnoise(st * 6.0 * u_scale + vec2(7.3, -t))) - 0.5) * u_motion;
    // Motion gates ALL movement of the field — at 0 the pattern is frozen
    v = fbm5(uvn * u_scale + vec2(t * 0.4, t) * u_motion + wob * 0.8) * 1.4;
    v += 0.25 - uvn.y * 0.22;
  }
  return clamp(v, 0.0, 1.0);
}

void main() {
  float s = u_style;
  float t = u_time * u_speed;

  // structured styles need chunkier cells to read
  float px = max(u_pixel, 1.0) * (s < 0.5 ? 1.0 : (s < 1.5 ? 4.0 : 3.0));
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 f = fract(gl_FragCoord.xy / px);
  vec2 st = (cell + 0.5) * px / u_resolution;

  float v = field(st, t);
  float lv = max(u_levels, 2.0);
  vec3 col;

  if (s < 0.5) {
    // --- Bayer ordered dither
    float q = floor(v * (lv - 1.0) + bayer4(cell)) / (lv - 1.0);
    col = ramp(q);

  } else if (s < 1.5) {
    // --- ASCII: glyph density steps ( . : + x # ) on a dark bed
    float qv = floor(v * 5.999);
    vec2 g = f - 0.5;
    float m = 0.0;
    if (qv >= 1.0) m = max(m, step(length(g), 0.09));
    if (qv >= 2.0) {
      m = max(m, step(length(g - vec2(0.0, 0.18)), 0.08));
      m = max(m, step(length(g + vec2(0.0, 0.18)), 0.08));
    }
    if (qv >= 3.0) {
      m = max(m, step(abs(g.x), 0.055) * step(abs(g.y), 0.26));
      m = max(m, step(abs(g.y), 0.055) * step(abs(g.x), 0.26));
    }
    if (qv >= 4.0) {
      float box = step(max(abs(g.x), abs(g.y)), 0.27);
      m = max(m, step(abs(g.x - g.y), 0.08) * box);
      m = max(m, step(abs(g.x + g.y), 0.08) * box);
    }
    if (qv >= 5.0) {
      float e = max(abs(g.x), abs(g.y));
      m = max(m, step(e, 0.30) - step(e, 0.19));
    }
    // darken by sliding DOWN the ramp, never by scaling RGB —
    // every pixel stays an exact palette color
    col = mix(ramp(v * 0.45), ramp(0.30 + 0.70 * v), clamp(m, 0.0, 1.0));

  } else if (s < 2.5) {
    // --- Halftone: ink-on-paper print — darker tone grows bigger ink dots
    vec2 hp = vec2(gl_FragCoord.x - gl_FragCoord.y, gl_FragCoord.x + gl_FragCoord.y) * 0.7071 / px;
    vec2 hf = fract(hp) - 0.5;
    vec2 hcm = (floor(hp) + 0.5);
    vec2 opix = vec2(hcm.x + hcm.y, -hcm.x + hcm.y) * 0.7071 * px;
    float vh = field(opix / u_resolution, t);
    float rad = sqrt(1.0 - vh) * 0.60;
    float m = smoothstep(rad, rad - 0.1, length(hf));
    col = mix(u_c5, ramp(vh * 0.45), m); // cream paper, indigo-side ink

  } else if (s < 3.5) {
    // --- Dots: round dots, bed darkened by sliding down the ramp
    float m = smoothstep(0.34, 0.26, length(f - 0.5));
    col = mix(ramp(v * 0.45), ramp(0.20 + 0.80 * v), m);

  } else if (s < 4.5) {
    // --- LEGO: flat brick color, beveled cell edge, shaded round stud
    vec3 base = ramp(floor(v * (lv - 1.0) + 0.5) / (lv - 1.0));
    float edge = smoothstep(0.0, 0.07, f.x) * smoothstep(0.0, 0.07, f.y)
               * smoothstep(1.0, 0.93, f.x) * smoothstep(1.0, 0.93, f.y);
    base *= 0.78 + 0.22 * edge;
    vec2 g = f - 0.5;
    float rs = length(g);
    float stud = smoothstep(0.30, 0.27, rs);
    float shade = (-g.x + g.y) * 1.4;                 // light from upper-left
    base *= 1.0 - 0.22 * (smoothstep(0.36, 0.30, rs) - stud); // stud drop shadow
    base *= 1.0 + stud * shade * 0.35;
    base += vec3(1.0) * stud * max(shade, 0.0) * 0.10;
    col = base;

  } else if (s < 5.5) {
    // --- Voxel: quantized tiles with 3D bevel (light top/left, dark bottom/right)
    vec3 base = ramp(floor(v * (lv - 1.0) + 0.5) / (lv - 1.0)) * (0.8 + 0.2 * v);
    float lt = smoothstep(0.86, 1.0, f.y) * 0.30 + smoothstep(0.14, 0.0, f.x) * 0.16;
    float dk = smoothstep(0.14, 0.0, f.y) * 0.30 + smoothstep(0.86, 1.0, f.x) * 0.16;
    col = base * (1.0 + lt - dk);

  } else if (s < 6.5) {
    // --- LED: rounded pixels, seams darkened by sliding down the ramp
    vec2 g = abs(f - 0.5);
    float box = smoothstep(0.44, 0.34, max(g.x, g.y));
    vec3 ledc = ramp(0.15 + 0.85 * v);
    col = mix(ramp(v * 0.40), ledc, box);
    col += ledc * 0.20 * (1.0 - box) * exp(-max(g.x, g.y) * 5.0);

  } else {
    // --- Lattice: woven diagonal threads, thickness carries the tone
    float w1 = abs(fract((gl_FragCoord.x + gl_FragCoord.y) / px) - 0.5);
    float w2 = abs(fract((gl_FragCoord.x - gl_FragCoord.y) / px) - 0.5);
    float th = 0.10 + 0.38 * v;
    float l1 = smoothstep(th, th - 0.09, w1);
    float l2 = smoothstep(th, th - 0.09, w2);
    float m = max(l1, l2 * 0.8);
    col = mix(ramp(v * 0.40), ramp(0.25 + 0.75 * v), m);
  }

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ dotwave
  {
    id: "dotwave",
    name: "Dot Wave",
    desc: "LED-matrix grid of dots whose size and brightness ride traveling interference waves.",
    params: [
      { key: "u_density", label: "Density",    type: "range", min: 10,  max: 100, step: 1,    value: 48 },
      { key: "u_wave",    label: "Wave Scale", type: "range", min: 0.5, max: 4,   step: 0.01, value: 1.99 },
      { key: "u_speed",   label: "Speed",      type: "range", min: 0,   max: 3,   step: 0.01, value: 0.57 },
      { key: "u_dot",     label: "Dot Size",   type: "range", min: 0.1, max: 1,   step: 0.01, value: 0.38 },
      { key: "u_round",   label: "Roundness",  type: "range", min: 0,   max: 1,   step: 0.01, value: 0.3 },
      // this shader ships its own ramp defaults (deeper electric Stop 1)
      { key: "u_c0", label: "Stop 1", type: "color", value: "#362ae5" },
      { key: "u_c1", label: "Stop 2", type: "color", value: "#4d46dd" },
      { key: "u_c2", label: "Stop 3", type: "color", value: "#7568cf" },
      { key: "u_c3", label: "Stop 4", type: "color", value: "#c2a4dd" },
      { key: "u_c4", label: "Stop 5", type: "color", value: "#eec4bb" },
      { key: "u_c5", label: "Stop 6", type: "color", value: "#f9e6c3" },
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_density, u_wave, u_speed, u_dot, u_round;

float waveField(vec2 p, float t) {
  float w = 0.0;
  w += sin(p.x * 3.1 * u_wave + t * 1.7);
  w += sin((p.x * 0.6 + p.y * 1.4) * 2.3 * u_wave - t * 1.3);
  w += sin(length(p + vec2(sin(t * 0.3), cos(t * 0.4))) * 4.0 * u_wave - t * 2.0);
  w = w / 3.0 * 0.5 + 0.5;
  w += (vnoise(p * 2.0 * u_wave + t * 0.5) - 0.5) * 0.25;
  return clamp(w, 0.0, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  vec2 g = p * u_density * 0.5;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 cc = (cell + 0.5) / (u_density * 0.5); // cell center in field space

  float w = waveField(cc, t);

  // dot: blend square (Chebyshev) and circle (Euclidean) distance
  float dSq = max(abs(f.x), abs(f.y));
  float dCi = length(f);
  float d = mix(dSq, dCi, u_round);
  float r = 0.5 * u_dot * (0.15 + 0.85 * w);
  float m = 1.0 - smoothstep(r - 0.07, r + 0.07, d);

  // Stop 1 is the bed color — no black void, just a darker/lighter
  // breathing of the base as the wave passes under the dots.
  vec3 bed = u_c0 * (0.55 + 0.35 * w);
  vec3 dotCol = ramp(w) * (0.35 + 0.65 * w);
  vec3 col = mix(bed, dotCol, m);

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ dot map
  {
    id: "dotmap",
    name: "Dot Map",
    desc: "A world map built from square dots — pale by default, blooming through the ramp under your cursor, with scattered accent twinkles.",
    params: [
      { key: "u_grid",    label: "Density",      type: "range",  min: 40,   max: 160, step: 1,    value: 135 },
      { key: "u_dot",     label: "Dot Size",     type: "range",  min: 0.2,  max: 1,   step: 0.01, value: 0.59 },
      { key: "u_hoverOn", label: "Hover Interaction", type: "toggle", value: 1 },
      { key: "u_hover",   label: "Hover Radius", type: "range",  min: 0.05, max: 0.6, step: 0.01, value: 0.12 },
      { key: "u_twinkle", label: "Accents",      type: "range",  min: 0,    max: 1,   step: 0.01, value: 0.22 },
      { key: "u_speed",   label: "Speed",        type: "range",  min: 0,    max: 2,   step: 0.01, value: 1.32 },
      { key: "u_wave",    label: "Wave Scale",   type: "range",  min: 0.5,  max: 4,   step: 0.01, value: 1.5 },
      { key: "u_bg",      label: "Background",   type: "color", value: "#2800b8" },
      // this shader ships its own ramp defaults (glow tones over indigo)
      { key: "u_c0", label: "Stop 1", type: "color", value: "#f9ffdb" },
      { key: "u_c1", label: "Stop 2", type: "color", value: "#ffc9b3" },
      { key: "u_c2", label: "Stop 3", type: "color", value: "#b4a8ff" },
      { key: "u_c3", label: "Stop 4", type: "color", value: "#c2a4dd" },
      { key: "u_c4", label: "Stop 5", type: "color", value: "#eec4bb" },
      { key: "u_c5", label: "Stop 6", type: "color", value: "#f9e6c3" },
    ],
    frag: RAMP_GLSL + NOISE_LIB + MAP_GLSL + `
uniform float u_grid, u_dot, u_hover, u_twinkle, u_speed, u_wave, u_hoverOn;
uniform vec3 u_bg;
uniform vec2 u_mouse;
uniform vec3 u_clicks[4];

float waveField(vec2 p, float t) {
  float w = 0.0;
  w += sin(p.x * 3.1 * u_wave + t * 1.7);
  w += sin((p.x * 0.6 + p.y * 1.4) * 2.3 * u_wave - t * 1.3);
  w += sin(length(p + vec2(sin(t * 0.3), cos(t * 0.4))) * 4.0 * u_wave - t * 2.0);
  w = w / 3.0 * 0.5 + 0.5;
  w += (vnoise(p * 2.0 * u_wave + t * 0.5) - 0.5) * 0.25;
  return clamp(w, 0.0, 1.0);
}

void main() {
  float t = u_time * u_speed;
  float px = u_resolution.x / u_grid;
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 f = fract(gl_FragCoord.xy / px);
  vec2 stc = (cell + 0.5) * px / u_resolution;

  vec3 col = u_bg;

  // cover-fit the 2:1 map onto the canvas
  float cAsp = u_resolution.x / u_resolution.y;
  vec2 kk = cAsp > 2.0 ? vec2(1.0, 2.0 / cAsp) : vec2(cAsp / 2.0, 1.0);
  vec2 muv = 0.5 + (stc - 0.5) * kk;

  float land = mapBilinear(vec2(muv.x * 64.0, (1.0 - muv.y) * 32.0));

  if (land > 0.42 && muv.x >= 0.0 && muv.x <= 1.0 && muv.y >= 0.0 && muv.y <= 1.0) {
    // wave field in screen-space (same coordinate scale as Dot Wave)
    vec2 pp = (2.0 * stc - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    float w = waveField(pp, t);

    // hover bloom
    vec2 cpx = (cell + 0.5) * px;
    float dm = length((cpx - u_mouse) / u_resolution.y);
    float h = smoothstep(u_hover, u_hover * 0.15, dm) * u_hoverOn;

    // click pulses
    float pulse = 0.0;
    for (int i = 0; i < 4; i++) {
      float age = u_time - u_clicks[i].z;
      if (age < 0.0 || age > 2.5) continue;
      float rr = 0.04 + age * 0.55;
      float dc = length((cpx - u_clicks[i].xy) / u_resolution.y);
      float ring = exp(-pow((dc - rr) * 16.0, 2.0));
      pulse = max(pulse, ring * exp(-age * 1.3));
    }

    // accent twinkles
    vec2 rr = hash2(cell * 1.31 + 7.7);
    float tw = step(rr.x, 0.05 * u_twinkle)
             * max(sin(6.2831 * (t * 0.25 + rr.y * 13.0)), 0.0);

    // ramp position: wave drives base, hover/pulse/twinkle push toward vivid end
    float boost = max(h, pulse);
    float rampT = w * 0.65;
    rampT = mix(rampT, 0.95, tw);
    rampT = mix(rampT, 1.0, boost);
    vec3 dotc = ramp(rampT);

    // dot size: wave drives breathing, hover/pulse swell it further
    vec2 g = abs(f - 0.5);
    float dd = mix(max(g.x, g.y), length(g), 0.25);
    float r = 0.5 * u_dot * (0.15 + 0.85 * w) * (1.0 + 0.35 * boost);
    col = mix(col, dotc, 1.0 - smoothstep(r - 0.05, r + 0.05, dd));
  }

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ glass orb
  {
    id: "glassorb",
    name: "Orb",
    desc: "Soft emissive blob on a dark field — a wobbling noise-deformed silhouette with warm and cool ramp patches drifting across it, wrapped in bloom.",
    params: [
      { key: "u_size",   label: "Size",       type: "range", min: 0.15, max: 0.8, step: 0.01, value: 0.45 },
      { key: "u_wobble", label: "Wobble",     type: "range", min: 0,    max: 1,   step: 0.01, value: 0.75 },
      { key: "u_detail", label: "Detail",     type: "range", min: 0.5,  max: 3,   step: 0.01, value: 1.4 },
      { key: "u_glow",   label: "Glow",       type: "range", min: 0,    max: 2,   step: 0.01, value: 1.0 },
      { key: "u_speed",  label: "Speed",      type: "range", min: 0,    max: 2,   step: 0.01, value: 0.8 },
      { key: "u_bg",     label: "Background", type: "color", value: "#07070c" },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_size, u_wobble, u_detail, u_glow, u_speed;
uniform vec3 u_bg;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  // user-set backdrop with a soft vignette
  vec3 col = u_bg * (1.0 - 0.25 * length(p));

  vec2 sp = p - vec2(0.0, 0.02 * sin(t * 0.6)); // gentle float
  float d = length(sp);
  float a = atan(sp.y, sp.x);

  // large smooth lobes plus a gentle running ripple — no high-frequency crust
  float deform = 0.5 * sin(a * 3.0 + t * 0.60)
               + 0.3 * sin(a * 5.0 - t * 0.45 + 1.7)
               + 0.2 * sin(a * 7.0 + t * 0.31 + 4.2)
               + 0.12 * sin(a * 9.0 - t * 0.75 + 2.6);
  float R = u_size * (1.0 + u_wobble * 0.09 * deform);

  // sphere normal from the deformed silhouette
  vec2 un = sp / R;
  float r2 = dot(un, un);
  float nz = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
  vec3 n = vec3(un, nz);

  // glassy plasma: a swirling flow field warps the big soft patches
  vec2 q = un * u_detail;
  vec2 flow = vec2(vnoise(q * 1.6 + t * 0.35),
                   vnoise(q * 1.6 - t * 0.30 + 8.2)) - 0.5;
  float m1 = vnoise(q * 1.2 + flow * 1.2 + vec2(t * 0.22, -t * 0.15));
  float m2 = vnoise(q * 2.1 + flow * 1.8 + vec2(-t * 0.18, t * 0.14) + 3.7);
  float m3 = vnoise(q * 2.8 + flow * 2.4 + vec2(t * 0.28, -t * 0.22) + 6.1);
  float v = smoothstep(0.12, 0.88, m1 * 0.45 + m2 * 0.30 + m3 * 0.35);
  vec3 body = ramp(0.45 + 0.5 * v);
  body = mix(body, vec3(1.0), 0.24);       // milky lift

  // luminous shading: bright core, soft diffuse, glowing limb
  vec3 l = normalize(vec3(-0.35, 0.45, 0.82));
  body *= 0.85 + 0.28 * clamp(dot(n, l), 0.0, 1.0);
  body += vec3(1.0) * pow(1.0 - nz, 2.0) * 0.24;
  body *= 1.06;                             // emissive boost

  float mask = smoothstep(R + 0.003, R - 0.010, d);
  col = mix(col, body, mask);

  // halo — brighter to match the more luminous body
  float o = max(d - R, 0.0);
  col += body * exp(-o * (14.0 / u_size)) * (1.0 - mask) * 0.40 * u_glow;
  col += ramp(0.75) * exp(-o * (4.0 / u_size)) * (1.0 - mask) * 0.07 * u_glow;

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ ribbons
  {
    id: "ribbons",
    name: "Ribbons",
    desc: "A glossy glass ribbon flowing across the screen — parallel translucent strands, sweeping specular highlights, warm light caught inside.",
    params: [
      { key: "u_width",   label: "Width",     type: "range", min: 0.1, max: 0.5, step: 0.01, value: 0.26 },
      { key: "u_strands", label: "Strands",   type: "range", min: 4,   max: 24,  step: 1,    value: 24 },
      { key: "u_amp",     label: "Wave",      type: "range", min: 0.1, max: 0.8, step: 0.01, value: 0.69 },
      { key: "u_speed",   label: "Speed",     type: "range", min: 0,   max: 2,   step: 0.01, value: 0.92 },
      { key: "u_bg",      label: "Background", type: "color", value: "#ebefff" },
      // this shader ships its own ramp defaults (tuned electric indigo → white)
      { key: "u_c0", label: "Stop 1", type: "color", value: "#4a3ef4" },
      { key: "u_c1", label: "Stop 2", type: "color", value: "#271ed2" },
      { key: "u_c2", label: "Stop 3", type: "color", value: "#7568cf" },
      { key: "u_c3", label: "Stop 4", type: "color", value: "#c2a4dd" },
      { key: "u_c4", label: "Stop 5", type: "color", value: "#fddbd3" },
      { key: "u_c5", label: "Stop 6", type: "color", value: "#ffffff" },
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_width, u_strands, u_amp, u_speed;
uniform vec3 u_bg;

// the ribbon's centerline: a slow S-curve drifting through the frame
float curve(float x, float t, float ph) {
  return u_amp * (0.6 * sin(x * 1.1 + t * 0.5 + ph)
                + 0.4 * sin(x * 1.9 - t * 0.33 + 1.3 + ph * 1.7));
}

vec3 ribbon(vec3 col, vec2 p, float t, float ph, float width, float dim) {
  float yc = curve(p.x, t, ph);
  float v = (p.y - yc) / width; // -1..1 across the ribbon
  float av = abs(v);
  if (av > 1.15) return col;
  float band = smoothstep(1.05, 0.92, av);

  // shear so the strands weave and converge instead of staying parallel
  float w = v + 0.25 * sin(p.x * 2.3 + v * 2.0 + t * 0.4);

  // translucent glass tint drifting through the ramp
  vec3 glass = mix(u_bg, ramp(clamp(0.55 + 0.30 * sin(p.x * 1.3 + w * 1.2 - t * 0.3), 0.0, 1.0)), 0.40);

  // warm light pooling inside, sliding slowly along the ribbon
  float gx = p.x + 0.8 * sin(t * 0.21);
  glass += ramp(0.92) * exp(-gx * gx * 1.4) * 0.22;

  // parallel strand filaments: bright lines with dark seams between them
  float ln = pow(0.5 + 0.5 * cos(w * 3.14159 * u_strands), 3.0);
  glass += vec3(1.0) * ln * 0.14;
  glass *= 1.0 - 0.14 * pow(0.5 + 0.5 * cos(w * 3.14159 * u_strands + 3.14159), 2.0);

  // sweeping specular highlight + bright glass edges
  float spec = pow(clamp(0.5 + 0.5 * sin(p.x * 1.5 - t * 0.6 + w * 1.5), 0.0, 1.0), 10.0);
  glass += vec3(0.9) * spec * 0.18;
  glass += vec3(1.0) * smoothstep(0.82, 1.0, av) * 0.18;

  glass *= dim;
  return mix(col, glass, band * 0.9);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  // pale airy backdrop
  vec3 col = u_bg * (1.0 + 0.05 * p.y);

  // thin echo ribbon behind, then the main band
  col = ribbon(col, p + vec2(0.0, 0.18), t * 1.15, 2.1, u_width * 0.55, 0.92);
  col = ribbon(col, p, t, 0.0, u_width, 1.0);

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ julia
  {
    id: "julia",
    name: "Julia Set",
    desc: "The z² + c fractal, escape bands cycling through the ramp. Drag the C sliders to walk the complex plane.",
    params: [
      { key: "u_cRe",   label: "C Real",     type: "range", min: -1,  max: 1,   step: 0.001, value: -0.79 },
      { key: "u_cIm",   label: "C Imag",     type: "range", min: -1,  max: 1,   step: 0.001, value: 0.15 },
      { key: "u_zoom",  label: "Zoom",       type: "range", min: 0.5, max: 40,  step: 0.01,  value: 1.1 },
      { key: "u_iter",  label: "Iterations", type: "range", min: 20,  max: 400, step: 1,     value: 150 },
      { key: "u_morph", label: "Morph",      type: "range", min: 0,   max: 1,   step: 0.01,  value: 0.15 },
      { key: "u_speed", label: "Speed",      type: "range", min: 0,   max: 1,   step: 0.01,  value: 0.3 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + `
uniform float u_cRe, u_cIm, u_zoom, u_iter, u_morph, u_speed;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y / u_zoom;
  vec2 c = vec2(u_cRe, u_cIm)
         + u_morph * 0.12 * vec2(sin(u_time * u_speed), cos(u_time * u_speed * 0.77));

  vec2 z = uv;
  float n = u_iter;
  float trap = 1e9; // closest orbit approach to the origin
  for (int i = 0; i < 400; i++) {
    if (float(i) >= u_iter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, dot(z, z));
    if (dot(z, z) > 16.0) {
      n = float(i) + 1.0 - log2(log2(dot(z, z))) + 2.0;
      break;
    }
  }

  vec3 col;
  if (n >= u_iter - 0.5) {
    // interior: orbit-trap glow instead of flat black
    float g = exp(-sqrt(trap) * 2.5);
    col = ramp(g * 0.55) * (0.15 + 0.85 * g);
  } else {
    float m = sqrt(n / u_iter);
    col = ramp(0.5 - 0.5 * cos(6.2831 * m * 1.2));
    col += u_c5 * pow(m, 8.0) * 0.3;
  }

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ cascade
  {
    id: "cascade",
    name: "Cascade",
    desc: "Sunset gradient behind staggered glass panes — mirrored columns each hold the sky at a different height, finished with film grain.",
    params: [
      { key: "u_cols",    label: "Columns", type: "range", min: 3,    max: 18,  step: 1,    value: 15 },
      { key: "u_amp",     label: "Amplitude", type: "range", min: 0,  max: 0.4, step: 0.01, value: 0.30 },
      { key: "u_waves",   label: "Waves",   type: "range", min: 0.5,  max: 4,   step: 0.01, value: 1.65 },
      { key: "u_band",    label: "Cloud Band", type: "range", min: 0, max: 0.6, step: 0.01, value: 0.50 },
      { key: "u_speed",   label: "Speed",   type: "range", min: 0,    max: 2,   step: 0.01, value: 0.32 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_cols, u_amp, u_waves, u_band, u_speed;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution; // 0..1, y up
  float t = u_time * u_speed;

  // N strictly equal-width columns
  float n = max(u_cols, 1.0);
  float k = floor(clamp(st.x, 0.0, 0.99999) * n); // column index 0..n-1
  float phase = (k + 0.5) / n;                     // column center, 0..1

  // traveling wave: the horizon height per column rides a sine that
  // scrolls left -> right over time. Same value for the whole column,
  // so every column keeps equal width; only its bright band moves.
  float horizon = 0.5 + u_amp * sin(6.2831 * (phase * u_waves - t * 0.35));
  float y = st.y;

  // sunset profile, all sampled from the ramp:
  // cream bloom at the (per-column) horizon, indigo cloud band above,
  // periwinkle settling below
  float tR = 0.40
           + 0.66 * exp(-pow((y - horizon) * 4.2, 2.0))            // horizon glow
           - u_band * exp(-pow((y - (horizon + 0.30)) * 4.0, 2.0)) // cloud band above
           - 0.14 * clamp((horizon - 0.16 - y) * 2.5, 0.0, 1.0);   // settle below
  vec3 col = ramp(clamp(tR, 0.0, 1.0));

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ topography
  {
    id: "topography",
    name: "Topographic",
    desc: "Elevation contour lines of a domain-warped terrain field — isolines bunch tight on steep slopes and open up on plains, like a printed topo map.",
    params: [
      { key: "u_scale",  label: "Feature Size", type: "range", min: 0.3, max: 3,   step: 0.01, value: 3.0 },
      { key: "u_lines",  label: "Contours",  type: "range", min: 6,   max: 60,  step: 1,    value: 49 },
      { key: "u_warp",   label: "Warp",      type: "range", min: 0,   max: 2.5, step: 0.01, value: 0.78 },
      { key: "u_detail", label: "Detail",    type: "range", min: 0,   max: 1,   step: 0.01, value: 0.65 },
      { key: "u_thick",  label: "Thickness", type: "range", min: 0.5, max: 3,   step: 0.01, value: 1.59 },
      { key: "u_speed",  label: "Speed",     type: "range", min: 0,   max: 1,   step: 0.01, value: 0.06 },
      { key: "u_bg",     label: "Background", type: "color", value: "#1c34d8" },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_scale, u_lines, u_warp, u_detail, u_thick, u_speed;
uniform vec3 u_bg;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  // low-frequency-dominant terrain: a few big massifs, gentle warp,
  // then a controllable amount of fine ridge detail on top
  vec2 q = uv * u_scale;
  vec2 wv = u_warp * (vec2(vnoise(q * 0.6 + vec2(0.0, t)),
                           vnoise(q * 0.6 + vec2(9.0, -t) + 4.0)) - 0.5);
  q += wv;
  float h = 0.66 * vnoise(q * 0.55)
          + 0.26 * vnoise(q * 1.15 + 3.3)
          + u_detail * (0.18 * vnoise(q * 2.6 + 8.1)
                      + 0.09 * vnoise(q * 4.9 + 1.7));

  // constant-width isolines via screen-space derivative; contour spacing
  // shrinks where the slope is steep, so lines crowd around peaks/ridges
  float f = h * u_lines;
  float e = abs(fract(f) - 0.5);          // 0 at a contour, 0.5 between
  float lw = fwidth(f) * u_thick;
  float line = 1.0 - smoothstep(0.0, lw, e);

  // soft diagonal key light, brighter toward the top-right
  float lightBg = 0.15 + 0.22 * clamp(0.5 + 0.5 * (uv.x * 0.4 + uv.y * 0.8), 0.0, 1.0);
  vec3 col = mix(u_bg, ramp(0.35), lightBg);

  // line color tinted by elevation: pale periwinkle low, cream on the peaks
  vec3 lc = ramp(mix(0.72, 1.0, clamp(h * 0.5 + 0.5, 0.0, 1.0)));
  col = mix(col, lc, line * 0.85);

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ terrain (3D)
  {
    id: "terrain",
    name: "Terrain",
    desc: "A raymarched 3D heightfield seen in perspective — glowing contour lines drape real mountains, fading into fog with depth-of-field blur.",
    params: [
      { key: "u_scale",  label: "Feature Size", type: "range", min: 0.4, max: 2.5, step: 0.01, value: 2.23 },
      { key: "u_height", label: "Relief",    type: "range", min: 0.2, max: 1.6, step: 0.01, value: 0.86 },
      { key: "u_lines",  label: "Contours",  type: "range", min: 8,   max: 60,  step: 1,    value: 50 },
      { key: "u_detail", label: "Detail",    type: "range", min: 0,   max: 1,   step: 0.01, value: 0.47 },
      { key: "u_orbit",  label: "Orbit",     type: "range", min: 0,   max: 6.28, step: 0.01, value: 0.8 },
      { key: "u_pitch",  label: "Camera Angle", type: "range", min: 0.25, max: 1.35, step: 0.01, value: 0.42 },
      { key: "u_dist",   label: "Distance",  type: "range", min: 1.5, max: 6,   step: 0.01, value: 3.2 },
      { key: "u_focus",  label: "Focus",     type: "range", min: 1,   max: 8,   step: 0.1,  value: 3.0 },
      { key: "u_dof",    label: "Blur",      type: "range", min: 0,   max: 1,   step: 0.01, value: 0.35 },
      { key: "u_speed",  label: "Flow",      type: "range", min: 0,   max: 1,   step: 0.01, value: 0.2 },
      { key: "u_bg",     label: "Background", type: "color", value: "#2c2cc9" },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_scale, u_height, u_lines, u_detail, u_orbit, u_pitch, u_dist, u_focus, u_dof, u_speed;
uniform vec3 u_bg;

float T; // animation clock — the terrain itself evolves, not the camera

float terrain(vec2 p) {
  vec2 q = p * u_scale * 0.35;
  // each noise layer drifts at its own rate, so the contours writhe and
  // morph over the fixed centerpiece
  float h = 0.55 * vnoise(q * 0.55 + vec2(T * 0.15, -T * 0.09))
          + 0.27 * vnoise(q * 1.15 + 3.3 + vec2(-T * 0.11, T * 0.13))
          + u_detail * (0.14 * vnoise(q * 2.6 + 8.1 + T * 0.2)
                      + 0.07 * vnoise(q * 5.0 + 1.7 - T * 0.16));
  // sculpted centerpiece: broad massif with a sunken bowl -> concentric rings,
  // enclosed by a rising rim so the camera always sits inside terrain
  float r = length(p);
  h += 0.65 * exp(-r * r * 0.18);
  h -= 0.38 * exp(-r * r * 1.4);
  h += 1.15 * smoothstep(2.4, 6.0, r);
  return h * u_height;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  T = u_time * u_speed;

  // fixed camera on an orbit rig: yaw/pitch/distance are all manual —
  // the motion comes from the terrain flowing, not the camera
  float yaw = u_orbit;
  vec3 ta = vec3(0.0, 0.45, 0.0);
  vec3 ro = ta + u_dist * vec3(cos(u_pitch) * sin(yaw), sin(u_pitch), cos(u_pitch) * cos(yaw));
  ro.y = max(ro.y, terrain(ro.xz) + 0.3);   // never sink into a ridge
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.6 * fw);

  // raymarch the heightfield: advance until the ray dips below the surface
  float d = 0.15, pT = 0.1, pDiff = 1.0, hitT = -1.0;
  for (int i = 0; i < 130; i++) {
    vec3 p = ro + rd * d;
    float diff = p.y - terrain(p.xz);
    if (diff < 0.0) {                       // crossed the surface
      hitT = mix(pT, d, pDiff / (pDiff - diff)); // zero-crossing lerp
      break;
    }
    pT = d; pDiff = diff;
    d += 0.026 * d + 0.010;
    if (d > 20.0) break;
  }

  vec3 col = mix(u_bg, u_bg * 2.2, clamp(uv.y * 0.5 + 0.4, 0.0, 1.0)); // faint sky

  if (hitT > 0.0) {
    vec3 p = ro + rd * hitT;
    float H = terrain(p.xz);

    // surface normal for a faint sense of form
    vec2 e = vec2(0.02, 0.0);
    vec3 nor = normalize(vec3(terrain(p.xz - e.xy) - terrain(p.xz + e.xy),
                              2.0 * e.x,
                              terrain(p.xz - e.yx) - terrain(p.xz + e.yx)));
    float dif = clamp(dot(nor, normalize(vec3(0.5, 0.8, -0.4))), 0.0, 1.0);

    // contour lines, widened by depth-of-field away from the focal distance
    float f = H * u_lines;
    float g = abs(fract(f) - 0.5);
    float blur = u_dof * 0.35 * abs(hitT - u_focus);
    float lw = clamp(fwidth(f) * 1.2, 0.0, 0.32) + blur;
    float line = (1.0 - smoothstep(0.0, lw, g)) / (1.0 + blur * 3.0); // blur softens

    // fog fading into the background with distance (tuned to orbit scale)
    float fog = exp(-max(hitT - u_dist * 0.55, 0.0) * 0.30);

    vec3 sky = mix(u_bg, u_bg * 2.2, clamp(uv.y * 0.5 + 0.4, 0.0, 1.0));
    vec3 surf = u_bg * (0.5 + 0.6 * dif);
    vec3 lc = mix(vec3(1.0), ramp(0.9), 0.28);   // near-white lines, faint ramp tint
    col = surf + lc * line * 1.7 * (0.55 + 0.45 * dif);
    col = mix(sky, col, fog);
    // soft edge vignette — corners sink toward the background like the reference
    col = mix(u_bg, col, 1.0 - 0.55 * pow(length(uv * vec2(0.62, 1.0)), 2.2));
  }

  fragColor = vec4(col, 1.0);
}`,
  },

  // ------------------------------------------------------------ kaleido
  {
    id: "kaleido",
    name: "DMT",
    desc: "Polar-space kaleidoscope folded into an infinite tunnel, textured with fractal noise. Segments sets the mirror count.",
    params: [
      { key: "u_segments", label: "Segments", type: "range", min: 2,   max: 24, step: 1,    value: 20 },
      { key: "u_twist",    label: "Twist",    type: "range", min: 0,   max: 4,  step: 0.01, value: 1.61 },
      { key: "u_speed",    label: "Speed",    type: "range", min: 0,   max: 3,  step: 0.01, value: 0.66 },
      { key: "u_detail",   label: "Detail",   type: "range", min: 0.3, max: 3,  step: 0.01, value: 2.33 },
      ...RAMP_PARAMS,
    ],
    frag: RAMP_GLSL + NOISE_LIB + `
uniform float u_segments, u_twist, u_speed, u_detail;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  float a = atan(uv.y, uv.x);
  float r = length(uv);

  // kaleidoscope fold
  float seg = 6.2831 / max(u_segments, 1.0);
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  a += u_twist * r + t * 0.2;

  // tunnel coordinates
  vec2 p = vec2(a * 3.0, 1.0 / (r + 0.15) + t);
  float f = fbm5(p * u_detail);
  float rings = 0.5 + 0.5 * sin(p.y * 3.0 + f * 5.0);

  vec3 col = ramp(rings * (0.35 + 0.65 * f));
  col *= smoothstep(0.0, 0.35, r);          // darken the deep end
  col += u_c5 * pow(rings, 6.0) * 0.25;     // hot highlights

  fragColor = vec4(col, 1.0);
}`,
  },
];
