/**
 * Shaders. Surfaces are lit by a "light grid" texture (one texel per world cell, refreshed a few
 * times per second) instead of one dynamic light per neon: flicker really changes the room, at
 * the cost of a single texture fetch. The VHS pass is one full-screen shader.
 */

export const SURFACE_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);   // chunks are built in world space (identity matrix)
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const SURFACE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform sampler2D uGrid;       // r: illumination, a: brightness of the panel of that cell
uniform vec2 uGridOrigin;      // world cell of texel (0,0)
uniform float uGridSize;
uniform float uCell;
uniform float uPanel;          // 0 surface, 1 neon panel, 2 lit decal (alpha test), 3 emissive
uniform vec3 uTint;            // neon colour
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uCam;
uniform vec3 uCamDir;
uniform float uFlash;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  // Sample the room the surface faces, not the one behind the wall.
  vec3 p = vWorld + vNormal * 0.55;
  vec4 L = texture2D(uGrid, (p.xz / uCell - uGridOrigin) / uGridSize);
  float light = L.r * 2.0;
  vec3 col;
  if (uPanel > 2.5) {
    col = texture2D(map, vUv).rgb * 1.25;
  } else if (uPanel > 1.5) {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.35) discard;
    col = t.rgb * uTint * (0.12 + light * 0.75);
  } else if (uPanel > 0.5) {
    float on = texture2D(uGrid, (vWorld.xz / uCell - uGridOrigin) / uGridSize).a;
    col = mix(vec3(0.16, 0.15, 0.11), uTint * 1.7, on) * texture2D(map, vUv).rgb;
  } else {
    vec3 base = texture2D(map, vUv).rgb;
    base *= 0.82 + 0.36 * vnoise(vWorld.xz * 0.17 + vWorld.y * 0.3);   // large-scale variation
    float wall = 1.0 - abs(vNormal.y);
    light *= mix(1.0, mix(0.72, 1.08, clamp(vWorld.y / 2.6, 0.0, 1.0)), wall);
    // Fake ambient occlusion where walls meet floor and ceiling.
    light *= mix(1.0, smoothstep(0.0, 0.35, vWorld.y) * 0.25 + 0.75, wall);
    vec3 toP = vWorld - uCam;
    float d = length(toP);
    float cone = smoothstep(0.86, 0.97, dot(toP / d, uCamDir));
    float spot = uFlash * cone * max(dot(vNormal, -toP / d), 0.15) / (1.0 + 0.06 * d * d);
    col = base * (uTint * light + vec3(1.0, 0.96, 0.86) * spot * 2.2);
  }
  float dist = length(vWorld - uCam);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}`;

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform float uTime;
uniform float uVhs;            // 0..1
uniform float uGlitch;         // 0..1, signal breaking up (entity nearby, death)
uniform float uFade;           // 0..1, fade to black
uniform vec2 uRes;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  float k = uVhs + uGlitch * 1.5;
  // Tape wobble: each scanline shifts a little; rare horizontal tears.
  float line = floor(uv.y * uRes.y);
  uv.x += (hash(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.0016 * k;
  float tearT = floor(uTime * (1.3 + uGlitch * 9.0));
  float tearY = hash(vec2(tearT, 3.0));
  float tearOn = step(0.9 - uGlitch * 0.7, hash(vec2(tearT, 7.0))) * k;
  uv.x += tearOn * smoothstep(0.03, 0.0, abs(uv.y - tearY)) * 0.03 * sin(uTime * 90.0);
  // Head-switching noise at the bottom of the picture.
  float bottom = smoothstep(0.035, 0.0, uv.y) * k;
  uv.x += bottom * (hash(vec2(line, uTime)) - 0.5) * 0.08;

  // Chromatic aberration (radial) + horizontal chroma bleed.
  vec2 c = uv - 0.5;
  float ab = (0.0015 + 0.004 * dot(c, c)) * k;
  vec3 col;
  col.r = texture2D(tScene, uv + c * ab * 2.0 + vec2(ab, 0.0)).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - c * ab * 2.0 - vec2(ab, 0.0)).b;
  // Halation: bright neon panels bloom into the picture, like on a cheap camcorder sensor.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472;
    vec2 dir = vec2(cos(a), sin(a) * uRes.x / uRes.y);
    glow += max(texture2D(tScene, uv + dir * 0.016).rgb - 0.7, 0.0);
  }
  col += glow * 0.3;
  vec3 bleed = texture2D(tScene, uv - vec2(0.004, 0.0)).rgb + texture2D(tScene, uv - vec2(0.008, 0.0)).rgb;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 chroma = mix(col - luma, bleed * 0.5 - dot(bleed * 0.5, vec3(0.299, 0.587, 0.114)), 0.45 * k);
  col = luma + chroma;

  // Grade: lifted blacks, sickly yellow-green cast, lower saturation.
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.0 - 0.22 * k);
  col = col * vec3(1.03, 1.02, 0.9) + vec3(0.018, 0.02, 0.008) * k;
  col = col / (1.0 + col * 0.35);                       // soft highlight roll-off

  // Grain, scanlines, bottom noise, vignette.
  float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
  col += g * 0.085 * k * (1.2 - luma);
  col *= 1.0 - 0.09 * k * (0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159));
  col = mix(col, vec3(hash(vec2(line, uTime * 3.0))), bottom * 0.5);
  col *= 1.0 - dot(c, c) * (0.55 + 0.75 * k);

  col = mix(col, vec3(hash(uv * uRes + uTime)) * 0.5, uGlitch * 0.25);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;
