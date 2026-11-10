/**
 * Procedural textures drawn on canvas — no external asset. Everything is stained on purpose.
 * A tiny local PRNG keeps the textures identical from one launch to the next.
 */

import * as THREE from 'three';
import { Rng } from '@shared/math/rng';

function make(size: number, draw: (g: CanvasRenderingContext2D, s: number, r: Rng) => void, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size, new Rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Fine per-pixel noise over the whole canvas. */
function speckle(g: CanvasRenderingContext2D, s: number, r: Rng, amount: number): void {
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r.next() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
}

/** Soft dark blotches (wrapping around the edges so the tile stays seamless). */
function stains(g: CanvasRenderingContext2D, s: number, r: Rng, count: number, color: string, maxR: number): void {
  for (let i = 0; i < count; i++) {
    const x = r.next() * s, y = r.next() * s, rad = maxR * (0.3 + r.next() * 0.7);
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
}

/** Damp beige carpet. One tile = 2 m. */
export function carpetTexture(): THREE.Texture {
  return make(512, (g, s, r) => {
    g.fillStyle = '#9a8a52';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = r.chance(0.5) ? 'rgba(60,50,20,0.18)' : 'rgba(210,195,130,0.14)';
      g.fillRect(r.next() * s, r.next() * s, 1 + r.next() * 2, 1);
    }
    stains(g, s, r, 9, 'rgba(50,38,12,0.30)', 90);
    stains(g, s, r, 4, 'rgba(25,20,8,0.35)', 40);
    speckle(g, s, r, 26);
  }, 11);
}

/** Yellowed wallpaper with chevrons on vertical stripes. One tile = 2 m wide × 2.6 m high. */
export function wallpaperTexture(): THREE.Texture {
  return make(512, (g, s, r) => {
    g.fillStyle = '#b9a856';
    g.fillRect(0, 0, s, s);
    const stripe = s / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(160,140,60,0.35)' : 'rgba(215,200,120,0.25)';
      g.fillRect(i * stripe, 0, stripe, s);
    }
    g.strokeStyle = 'rgba(120,100,40,0.55)';
    g.lineWidth = 2;
    for (let y = 10; y < s; y += 32) for (let i = 0; i < 8; i++) {
      const x = i * stripe + stripe / 2;
      g.beginPath();
      g.moveTo(x - 12, y + 10);
      g.lineTo(x, y);
      g.lineTo(x + 12, y + 10);
      g.stroke();
    }
    // Grime: darker near the ceiling (top) and the floor (bottom), water runs.
    let grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, 'rgba(70,55,15,0.45)');
    grad.addColorStop(0.18, 'rgba(70,55,15,0)');
    grad.addColorStop(0.85, 'rgba(40,30,10,0)');
    grad.addColorStop(1, 'rgba(40,30,10,0.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const x = r.next() * s, w = 4 + r.next() * 14, h = s * (0.2 + r.next() * 0.5);
      grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(80,60,20,0.35)');
      grad.addColorStop(1, 'rgba(80,60,20,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, w, h);
    }
    // Baseboard.
    g.fillStyle = '#4d4424';
    g.fillRect(0, s - 20, s, 20);
    stains(g, s, r, 5, 'rgba(60,45,15,0.22)', 70);
    speckle(g, s, r, 16);
  }, 22);
}

/** Suspended ceiling: 4×4 speckled tiles per texture. One tile of texture = 2 m. */
export function ceilingTexture(): THREE.Texture {
  return make(512, (g, s, r) => {
    g.fillStyle = '#b3ab86';
    g.fillRect(0, 0, s, s);
    const t = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const shade = 150 + r.int(40);
      g.fillStyle = `rgb(${shade + 20},${shade + 14},${shade - 18})`;
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      if (r.chance(0.2)) {
        const grad = g.createRadialGradient(x * t + t / 2, y * t + t / 2, 4, x * t + t / 2, y * t + t / 2, t / 2);
        grad.addColorStop(0, 'rgba(90,65,20,0.5)');
        grad.addColorStop(1, 'rgba(90,65,20,0)');
        g.fillStyle = grad;
        g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      }
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = 'rgba(60,55,35,0.35)';
      g.fillRect(r.next() * s, r.next() * s, 1.5, 1.5);
    }
    g.fillStyle = '#6e6950';
    for (let i = 0; i <= 4; i++) {
      g.fillRect(i * t - 2, 0, 4, s);
      g.fillRect(0, i * t - 2, s, 4);
    }
    speckle(g, s, r, 14);
  }, 33);
}

/** Ribbed diffuser of a neon panel. */
export function panelTexture(): THREE.Texture {
  return make(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < s; x += 8) g.fillRect(x, 0, 2, s);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 8;
    g.strokeRect(0, 0, s, s);
  }, 44);
}

/** Chalk arrow pointing toward +u, on a transparent background. */
export function arrowTexture(): THREE.Texture {
  return make(128, (g, s, r) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = 'rgba(240,238,225,0.95)';
    g.lineCap = 'round';
    for (let pass = 0; pass < 3; pass++) {     // several shaky strokes look like chalk
      g.lineWidth = 5 + r.next() * 3;
      const j = (): number => (r.next() - 0.5) * 5;
      g.beginPath();
      g.moveTo(14 + j(), 64 + j());
      g.lineTo(112 + j(), 64 + j());
      g.moveTo(80 + j(), 34 + j());
      g.lineTo(114 + j(), 64 + j());
      g.lineTo(80 + j(), 94 + j());
      g.stroke();
    }
  }, 55);
}

/** Service door with its green « SORTIE » sign. */
export function exitTexture(): THREE.Texture {
  return make(256, (g, s) => {
    g.fillStyle = '#3d423f';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#565d59';
    g.fillRect(14, 60, s - 28, s - 60);
    g.fillStyle = '#23c75a';
    g.fillRect(40, 8, s - 80, 40);
    g.fillStyle = '#eafff0';
    g.font = 'bold 30px monospace';
    g.textAlign = 'center';
    g.fillText('SORTIE', s / 2, 39);
    g.fillStyle = '#1b1d1c';
    g.fillRect(40, 150, s - 80, 10);          // panic bar
  }, 66);
}

/** Grey coverall fabric of the surveyors. */
export function suitTexture(): THREE.Texture {
  return make(64, (g, s, r) => {
    g.fillStyle = '#8b8f8a';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 30);
  }, 77);
}

/** Flat colour (camcorder body, record light). */
export function flatTexture(color: string): THREE.Texture {
  return make(4, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
  }, 88);
}
