// Renders the hero moon sprite: a full moon with bump-lit craters,
// albedo maria after the real near side, and ray systems for Tycho,
// Copernicus and Kepler. Deterministic — same seed, same pixels.
//
//   node frontend/scripts/generate-moon.mjs
//
// Writes frontend/public/images/moon-surface.png (RGBA, transparent
// outside the disc). Hand-rolled PNG encoder so the script needs no
// dependencies.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 1080;
const RADIUS = SIZE / 2 - 2; // fill the sprite so the disc meets the CSS glow
const CENTER = SIZE / 2;

/* ---------- deterministic randomness ---------- */

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = mulberry32(20260719);

// lattice for value noise
const LATTICE = 256;
const lattice = new Float32Array(LATTICE * LATTICE);
for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

const latticeAt = (ix, iy) =>
  lattice[((iy & (LATTICE - 1)) * LATTICE + (ix & (LATTICE - 1))) | 0];

const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const valueNoise = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smootherstep(x - ix);
  const fy = smootherstep(y - iy);
  const a = latticeAt(ix, iy);
  const b = latticeAt(ix + 1, iy);
  const c = latticeAt(ix, iy + 1);
  const d = latticeAt(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

const fbm = (x, y, octaves, lacunarity = 2, gain = 0.5) => {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y);
    norm += amp;
    x = x * lacunarity + 31.7;
    y = y * lacunarity + 17.3;
    amp *= gain;
  }
  return sum / norm;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, v) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- surface buffers ---------- */

const height = new Float32Array(SIZE * SIZE);
const albedo = new Float32Array(SIZE * SIZE);
const idx = (x, y) => y * SIZE + x;

/* Maria basins, near side, north up. Coordinates authored in the old
   520-viewBox space and scaled up. Every mare is a round basin. */
const K = SIZE / 520;
const BASINS = [
  // west: Imbrium flowing into the huge Oceanus Procellarum, Humorum, Nubium
  [190, 130, 50], [150, 185, 34], [95, 180, 26], [118, 225, 42],
  [100, 255, 30], [112, 280, 34], [135, 320, 26], [150, 340, 20],
  [162, 238, 30], [148, 258, 24], [150, 295, 26], [170, 300, 22],
  [185, 280, 18], [180, 310, 18], [196, 258, 16], [205, 330, 27],
  // east: Serenitatis -> Tranquillitatis diagonal, Nectaris detached
  [290, 128, 44], [345, 195, 40], [318, 212, 26], [352, 232, 18],
  [340, 285, 20], [375, 225, 16], [395, 252, 24],
  // Crisium, alone by the east limb
  [424, 148, 25],
].map(([x, y, r]) => [x * K, y * K, r * K * 1.15]);

/* Metaball field: every basin adds a gaussian, so overlapping circles
   melt into one connected plain instead of reading as stacked discs. */
const mariaField = (x, y) => {
  let f = 0;
  for (const [bx, by, br] of BASINS) {
    const q = Math.hypot(x - bx, y - by) / br;
    if (q < 2.4) f += Math.exp(-q * q * 1.4);
  }
  return f;
};

const ALB_HIGHLANDS = 0.86;
const ALB_MARIA = 0.62;

const mariaMask = new Float32Array(SIZE * SIZE);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = idx(x, y);
    // rolling large-scale terrain
    let h = (fbm(x * 0.004, y * 0.004, 4) - 0.5) * 26;
    h += (fbm(x * 0.016, y * 0.016, 4) - 0.5) * 7;

    // maria with noise-perturbed coastlines
    const F = mariaField(x, y);
    const Fn =
      F +
      (fbm(x * 0.006, y * 0.006, 3) - 0.5) * 0.26 +
      (fbm(x * 0.02 + 80, y * 0.02, 3) - 0.5) * 0.2;
    const m = smoothstep(0.4, 0.8, Fn);
    mariaMask[i] = m;

    let a = ALB_HIGHLANDS + (fbm(x * 0.008, y * 0.008, 4) - 0.5) * 0.1;
    a = a * (1 - m) + (ALB_MARIA + (fbm(x * 0.012 + 40, y * 0.012, 3) - 0.5) * 0.07) * m;
    // where basins overlap the field runs high — darken those cores
    a -= 0.045 * smoothstep(1.05, 1.9, Fn);

    // maria sit slightly below the highlands — soft inner shore shadow
    h -= m * 9;

    height[i] = h;
    albedo[i] = a;
  }
}

/* ---------- crater field ---------- */

const stampCrater = (cx, cy, r, depthScale = 1) => {
  const depth = Math.min(r * 0.5, 20) * depthScale;
  const rimH = depth * 0.45;
  const outer = Math.ceil(r * 1.3);
  const x0 = Math.max(1, Math.floor(cx - outer));
  const x1 = Math.min(SIZE - 2, Math.ceil(cx + outer));
  const y0 = Math.max(1, Math.floor(cy - outer));
  const y1 = Math.min(SIZE - 2, Math.ceil(cy + outer));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const q = Math.hypot(x - cx, y - cy) / r;
      if (q >= 1.3) continue;
      const i = idx(x, y);
      if (q < 0.82) {
        const t = q / 0.82;
        height[i] -= depth * (1 - t * t);
      } else {
        // cosine rim bump, fading into ejecta
        const t = (q - 0.82) / 0.48;
        height[i] += rimH * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 - Math.PI)) * (1 - t * 0.55);
      }
    }
  }
};

const brightSpot = (cx, cy, sigma, amount) => {
  const outer = Math.ceil(sigma * 3);
  const x0 = Math.max(0, Math.floor(cx - outer));
  const x1 = Math.min(SIZE - 1, Math.ceil(cx + outer));
  const y0 = Math.max(0, Math.floor(cy - outer));
  const y1 = Math.min(SIZE - 1, Math.ceil(cy + outer));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dd = ((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma);
      if (dd > 9) continue;
      albedo[idx(x, y)] += amount * Math.exp(-dd);
    }
  }
};

// power-law sizes: lots of small ones, a handful of large ones
const craters = [];
let attempts = 0;
while (craters.length < 2400 && attempts < 60000) {
  attempts++;
  const x = rand() * SIZE;
  const y = rand() * SIZE;
  const dc = Math.hypot(x - CENTER, y - CENTER);
  if (dc > RADIUS - 6) continue;
  const r = 2.6 * Math.pow(72 / 2.6, Math.pow(rand(), 2.7));
  const m = mariaMask[idx(Math.floor(x), Math.floor(y))];
  const south = 0.55 + 0.8 * smoothstep(0.45, 0.95, y / SIZE);
  let p = south * (1 - 0.74 * m);
  if (r > 34) p *= 0.45;
  if (rand() > p) continue;
  craters.push([x, y, r]);
}
// stamp big ones first so small ones overprint them
craters.sort((a, b) => b[2] - a[2]);
for (const [x, y, r] of craters) {
  stampCrater(x, y, r);
  if (r < 8 && rand() < 0.28) brightSpot(x, y, r * 0.8, 0.045);
}

/* ---------- ray craters: Tycho, Copernicus, Kepler ---------- */

const stampRays = (cx, cy, count, startR, minLen, maxLen, amp, seedShift) => {
  for (let k = 0; k < count; k++) {
    const baseAngle = (k / count) * Math.PI * 2 + (rand() - 0.5) * 0.55;
    const len = minLen + (maxLen - minLen) * rand();
    const width = 3.2 + rand() * 3.4;
    // shift the origin off-center so rays never converge into a star flare
    const jitter = (rand() - 0.5) * 14;
    const ox0 = cx + Math.cos(baseAngle + Math.PI / 2) * jitter;
    const oy0 = cy + Math.sin(baseAngle + Math.PI / 2) * jitter;
    for (let t = startR; t < len; t += 1) {
      // rays wander a little instead of running dead straight
      const angle = baseAngle + (valueNoise(t * 0.01 + seedShift, k * 3.7) - 0.5) * 0.22;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const px = ox0 + dirX * t;
      const py = oy0 + dirY * t;
      if (px < 2 || px > SIZE - 3 || py < 2 || py > SIZE - 3) break;
      const fade = Math.pow(1 - t / len, 1.9);
      const patch = 0.3 + 0.7 * valueNoise(t * 0.05 + seedShift, k * 7.31);
      const a = amp * fade * patch;
      const w = Math.ceil(width);
      for (let ox = -w; ox <= w; ox++) {
        for (let oy = -w; oy <= w; oy++) {
          const perp = Math.abs(ox * -dirY + oy * dirX);
          const along = Math.abs(ox * dirX + oy * dirY);
          if (along > 1.2) continue;
          const g = Math.exp(-(perp * perp) / (2 * (width * 0.55) ** 2));
          albedo[idx((px + ox) | 0, (py + oy) | 0)] += a * g * 0.5;
        }
      }
    }
  }
};

const TYCHO = [242 * K, 402 * K];
const COPERNICUS = [196 * K, 214 * K];
const KEPLER = [126 * K, 236 * K];

stampRays(...TYCHO, 13, 34, 190, 470, 0.055, 3.1);
brightSpot(...TYCHO, 30, 0.06);
stampCrater(...TYCHO, 16 * (K / 2), 1.4);
brightSpot(...TYCHO, 5, 0.09);

stampRays(...COPERNICUS, 9, 24, 80, 190, 0.032, 11.7);
brightSpot(...COPERNICUS, 20, 0.045);
stampCrater(...COPERNICUS, 13, 1.2);

stampRays(...KEPLER, 7, 18, 55, 130, 0.026, 23.9);
brightSpot(...KEPLER, 14, 0.04);
stampCrater(...KEPLER, 9, 1.1);

/* ---------- shade the sphere ---------- */

const out = Buffer.alloc(SIZE * SIZE * 4);

// light mostly face-on (full moon) with a top-left bias
const LX = -0.4;
const LY = -0.44;
const LZ = 0.8;
const LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN;
const ly = LY / LN;
const lz = LZ / LN;
const BUMP = 0.045;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    const dx = (x - CENTER) / RADIUS;
    const dy = (y - CENTER) / RADIUS;
    const rr = dx * dx + dy * dy;
    const dist = Math.sqrt(rr) * RADIUS;
    const aa = clamp((RADIUS + 0.9 - dist) / 1.8, 0, 1);
    if (aa <= 0) {
      out[o + 3] = 0;
      continue;
    }
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(rr, 1)));

    const xi = clamp(x, 1, SIZE - 2);
    const yi = clamp(y, 1, SIZE - 2);
    const gx = (height[idx(xi + 1, yi)] - height[idx(xi - 1, yi)]) * 0.5;
    const gy = (height[idx(xi, yi + 1)] - height[idx(xi, yi - 1)]) * 0.5;

    let nx2 = dx - gx * BUMP;
    let ny2 = dy - gy * BUMP;
    let nz2 = Math.max(nz, 0.04);
    const nn = Math.hypot(nx2, ny2, nz2);
    nx2 /= nn;
    ny2 /= nn;
    nz2 /= nn;

    const diff = Math.max(0, nx2 * lx + ny2 * ly + nz2 * lz);
    let I = 0.33 + 0.78 * diff;
    I *= 0.64 + 0.36 * Math.pow(nz, 0.68);

    const A = clamp(albedo[idx(xi, yi)], 0.05, 1.05);
    const lum = Math.pow(clamp(I * A * 1.1, 0, 1), 0.86);

    out[o] = clamp(Math.round(lum * 246), 0, 255);
    out[o + 1] = clamp(Math.round(lum * 243), 0, 255);
    out[o + 2] = clamp(Math.round(lum * 235), 0, 255);
    out[o + 3] = Math.round(aa * 255);
  }
}

/* ---------- minimal PNG encoder ---------- */

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crcBuf]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "public", "images", "moon-surface.png");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`moon-surface.png: ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(0)} KB, ${craters.length} craters`);
