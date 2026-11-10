/**
 * World view: streams chunks of the level around the camera, builds one merged geometry per
 * material per chunk (so ~4 draw calls per chunk), and maintains the light grid texture.
 */

import * as THREE from 'three';
import { CELL, CHUNK, CHUNK_SIZE } from '@shared/constants';
import { CEILING, LIGHT_NONE, PILLAR_HALF, WALL_T, type Halls } from '@shared/levels/halls';
import { SURFACE_FRAG, SURFACE_VERT } from './shaders';
import { arrowTexture, carpetTexture, ceilingTexture, exitTexture, panelTexture, wallpaperTexture } from './textures';

const GRID = 64;                 // light grid side, in cells (128 m around the camera)
const LOAD_RADIUS = 2;           // chunks
const FOG_DENSITY = 0.052;       // nothing is visible beyond ~40 m
const LIGHT_REACH = 4.2;         // cells
const AMBIENT = 0.016;           // what is left where no neon reaches: almost nothing
const TINT = new THREE.Vector3(1.0, 0.93, 0.68);
const FOG = new THREE.Vector3(0.105, 0.09, 0.04);

/** Accumulates quads for one material. */
class QuadBuffer {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** Quad from corner `o` spanned by edges `a` and `b`; normal = a × b. UVs in tiles. */
  quad(ox: number, oy: number, oz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number,
       u0: number, v0: number, u1: number, v1: number): void {
    const n = this.pos.length / 3;
    this.pos.push(ox, oy, oz, ox + ax, oy + ay, oz + az, ox + ax + bx, oy + ay + by, oz + az + bz, ox + bx, oy + by, oz + bz);
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    for (let i = 0; i < 4; i++) this.nor.push(nx, ny, nz);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }

  build(material: THREE.Material): THREE.Mesh | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

/** A vertical box (wall segment or pillar): 4 side faces, wallpaper mapped in metres. */
function box(q: QuadBuffer, x0: number, z0: number, x1: number, z1: number): void {
  const H = CEILING, w = x1 - x0, d = z1 - z0, vt = 1; // texture covers the full height
  q.quad(x0, 0, z1, w, 0, 0, 0, H, 0, x0 / CELL, 0, x1 / CELL, vt);     // south face (+z)
  q.quad(x1, 0, z0, -w, 0, 0, 0, H, 0, x1 / CELL, 0, x0 / CELL, vt);    // north face (-z)
  q.quad(x1, 0, z1, 0, 0, -d, 0, H, 0, z1 / CELL, 0, z0 / CELL, vt);    // east face (+x)
  q.quad(x0, 0, z0, 0, 0, d, 0, H, 0, z0 / CELL, 0, z1 / CELL, vt);     // west face (-x)
}

export class WorldView {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh[]>();
  private queue: Array<[number, number]> = [];
  private materials: THREE.ShaderMaterial[] = [];
  private mats: Record<'floor' | 'ceil' | 'wall' | 'panel' | 'arrow' | 'exit', THREE.ShaderMaterial>;
  private gridData = new Uint8Array(GRID * GRID * 4);
  private gridTex = new THREE.DataTexture(this.gridData, GRID, GRID, THREE.RGBAFormat);
  private gridOrigin = new THREE.Vector2();
  private acc = new Float32Array(GRID * GRID);
  private gridTimer = 0;
  private gridOx = 0;
  private gridOz = 0;
  private lightCount = -1;
  private wallBits = new Uint8Array(GRID * GRID);
  private seen = new Int32Array(GRID * GRID);
  private steps = new Uint8Array(GRID * GRID);
  private queue2 = new Int32Array(GRID * GRID);
  private stamp = 0;
  private lightCell = new Int32Array(GRID * GRID / 4 + 8);
  private splatStart = new Int32Array(GRID * GRID / 4 + 9);
  private splatCell = new Int32Array(90000);
  private splatW = new Float32Array(90000);
  /** Illumination at the camera (0..~1.5), smoothed. Used for fog and audio. */
  lightAtCamera = 1;

  constructor(private halls: Halls) {
    this.gridTex.magFilter = this.gridTex.minFilter = THREE.LinearFilter;
    this.mats = {
      floor: this.material(carpetTexture(), 0), ceil: this.material(ceilingTexture(), 0), wall: this.material(wallpaperTexture(), 0),
      panel: this.material(panelTexture(), 1), arrow: this.material(arrowTexture(), 2), exit: this.material(exitTexture(), 3),
    };
  }

  /** Create a material lit by the level's light grid. mode: 0 surface, 2 alpha-tested decal, 3 emissive. */
  material(map: THREE.Texture, panel: number): THREE.ShaderMaterial {
    {
      const m = new THREE.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: {
          map: { value: map }, uGrid: { value: this.gridTex }, uGridOrigin: { value: this.gridOrigin },
          uGridSize: { value: GRID }, uCell: { value: CELL }, uPanel: { value: panel }, uTint: { value: TINT },
          uFog: { value: FOG.clone() }, uFogDensity: { value: FOG_DENSITY },
          uCam: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector3(0, 0, -1) }, uFlash: { value: 0 },
        },
      });
      this.materials.push(m);
      return m;
    }
  }

  /** Surface material lit like the walls — reused for the entity, which is made of wallpaper. */
  get wallMaterial(): THREE.ShaderMaterial {
    return this.mats.wall;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  private buildChunk(cx: number, cz: number): THREE.Mesh[] {
    const h = this.halls, x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE, S = CHUNK_SIZE, t = WALL_T / 2;
    const floor = new QuadBuffer(), ceil = new QuadBuffer(), wall = new QuadBuffer(), panel = new QuadBuffer();
    const arrow = new QuadBuffer(), exit = new QuadBuffer();
    // Lighting is per fragment, so floor and ceiling are a single quad each.
    floor.quad(x0, 0, z0, 0, 0, S, S, 0, 0, 0, 0, CHUNK, CHUNK);
    ceil.quad(x0, CEILING, z0, S, 0, 0, 0, 0, S, 0, 0, CHUNK, CHUNK);
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const ix = cx * CHUNK + lx, iz = cz * CHUNK + lz, x = ix * CELL, z = iz * CELL;
      // Walls overshoot by half a thickness so corners close without gaps.
      if (h.wallN(ix, iz)) box(wall, x - t, z - t, x + CELL + t, z + t);
      if (h.wallW(ix, iz)) box(wall, x - t, z - t, x + t, z + CELL + t);
      const mx = x + CELL / 2, mz = z + CELL / 2;
      if (h.pillar(ix, iz)) box(wall, mx - PILLAR_HALF, mz - PILLAR_HALF, mx + PILLAR_HALF, mz + PILLAR_HALF);
      if (h.light(ix, iz) !== LIGHT_NONE) panel.quad(mx - 0.6, CEILING - 0.01, mz - 0.3, 1.2, 0, 0, 0, 0, 0.6, 0, 0, 1, 1);
      const dir = h.arrow(ix, iz);
      if (dir !== null) {
        // Flat quad on the carpet, texture +u along the arrow direction.
        const fx = Math.cos(dir), fz = Math.sin(dir), L = 0.9, W = 0.5;
        arrow.quad(mx - (fx * L + fz * W) / 2, 0.012, mz - (fz * L - fx * W) / 2, fx * L, 0, fz * L, fz * W, 0, -fx * W, 0, 0, 1, 1);
      }
      if (ix === h.exitX && iz === h.exitZ) {
        // Free-standing service door: a slab with the door texture on its four sides.
        const a = 0.55, b = 0.12, H = 2.2;
        exit.quad(mx - a, 0, mz + b, 2 * a, 0, 0, 0, H, 0, 0, 0, 1, 1);
        exit.quad(mx + a, 0, mz - b, -2 * a, 0, 0, 0, H, 0, 0, 0, 1, 1);
        exit.quad(mx + a, 0, mz + b, 0, 0, -2 * b, 0, H, 0, 0, 0, 0.1, 1);
        exit.quad(mx - a, 0, mz - b, 0, 0, 2 * b, 0, H, 0, 0, 0, 0.1, 1);
      }
    }
    const out: THREE.Mesh[] = [];
    for (const [q, m] of [[floor, this.mats.floor], [ceil, this.mats.ceil], [wall, this.mats.wall], [panel, this.mats.panel], [arrow, this.mats.arrow], [exit, this.mats.exit]] as const) {
      const mesh = q.build(m);
      if (mesh) {
        out.push(mesh);
        this.group.add(mesh);
      }
    }
    return out;
  }

  /** Load/unload chunks around the camera. At most one chunk is built per frame after the first call. */
  private stream(camX: number, camZ: number): void {
    const ccx = Math.floor(camX / CHUNK_SIZE), ccz = Math.floor(camZ / CHUNK_SIZE);
    const first = this.chunks.size === 0;
    this.queue.length = 0;
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      if (!this.chunks.has(`${ccx + dx},${ccz + dz}`)) this.queue.push([ccx + dx, ccz + dz]);
    }
    this.queue.sort((a, b) => Math.hypot(a[0] - ccx, a[1] - ccz) - Math.hypot(b[0] - ccx, b[1] - ccz));
    const budget = first ? this.queue.length : 1;
    for (let i = 0; i < budget && i < this.queue.length; i++) {
      const [cx, cz] = this.queue[i];
      this.chunks.set(`${cx},${cz}`, this.buildChunk(cx, cz));
    }
    for (const [key, meshes] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > LOAD_RADIUS + 1) {
        for (const m of meshes) {
          this.group.remove(m);
          m.geometry.dispose();
        }
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Precompute, for the grid window at (ox,oz), where each neon's light goes. Light spreads from
   * cell to cell and is stopped by walls, so a dark room stays dark next to a lit corridor.
   */
  private buildSplats(ox: number, oz: number): void {
    const h = this.halls, wall = this.wallBits, R = Math.ceil(LIGHT_REACH);
    for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
      wall[gz * GRID + gx] = (h.wallN(ox + gx, oz + gz) ? 1 : 0) | (h.wallW(ox + gx, oz + gz) ? 2 : 0);
    }
    const seen = this.seen, queue = this.queue2;
    let n = 0, lights = 0;
    for (let gz = 0; gz < GRID; gz++) for (let gx = 0; gx < GRID; gx++) {
      if (h.light(ox + gx, oz + gz) === LIGHT_NONE) continue;
      const stamp = ++this.stamp, src = gz * GRID + gx;
      this.lightCell[lights] = src;
      this.splatStart[lights] = n;
      let head = 0, tail = 0;
      queue[tail++] = src;
      seen[src] = stamp;
      this.steps[src] = 0;
      while (head < tail) {
        const cur = queue[head++], x = cur % GRID, z = (cur - x) / GRID, st = this.steps[cur];
        // Light that had to turn corners travelled farther than the straight distance.
        const w = 1 - Math.max(Math.hypot(x - gx, z - gz), st * 0.85) / LIGHT_REACH;
        if (w <= 0) continue;
        if (n < this.splatCell.length) {
          this.splatCell[n] = cur;
          this.splatW[n++] = w * w;
        }
        if (st >= R + 1) continue;
        const tryGo = (nx: number, nz: number, blocked: boolean): void => {
          if (blocked || nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) return;
          const ni = nz * GRID + nx;
          if (seen[ni] === stamp) return;
          seen[ni] = stamp;
          this.steps[ni] = st + 1;
          queue[tail++] = ni;
        };
        tryGo(x, z - 1, (wall[cur] & 1) !== 0);
        tryGo(x - 1, z, (wall[cur] & 2) !== 0);
        tryGo(x, z + 1, z + 1 < GRID && (wall[cur + GRID] & 1) !== 0);
        tryGo(x + 1, z, x + 1 < GRID && (wall[cur + 1] & 2) !== 0);
      }
      lights++;
    }
    this.splatStart[lights] = n;
    this.lightCount = lights;
  }

  /** Recompute the light grid centred on the camera. */
  private updateGrid(camX: number, camZ: number, time: number): void {
    const ox = Math.floor(camX / CELL) - GRID / 2, oz = Math.floor(camZ / CELL) - GRID / 2;
    if (ox !== this.gridOx || oz !== this.gridOz || this.lightCount < 0) {
      this.gridOx = ox;
      this.gridOz = oz;
      this.buildSplats(ox, oz);
    }
    const acc = this.acc, d = this.gridData, h = this.halls;
    acc.fill(AMBIENT);
    for (let i = 0; i < GRID * GRID; i++) d[i * 4 + 3] = 0;
    for (let l = 0; l < this.lightCount; l++) {
      const cell = this.lightCell[l], gx = cell % GRID;
      const level = h.lightLevel(ox + gx, oz + (cell - gx) / GRID, time);
      d[cell * 4 + 3] = level * 255;
      if (level <= 0) continue;
      for (let k = this.splatStart[l], end = this.splatStart[l + 1]; k < end; k++) acc[this.splatCell[k]] += this.splatW[k] * level * 0.5;
    }
    for (let i = 0; i < GRID * GRID; i++) d[i * 4] = Math.min(255, acc[i] * 127.5);
    this.gridOrigin.set(ox, oz);
    this.gridTex.needsUpdate = true;
    const here = acc[(GRID / 2) * GRID + GRID / 2];
    this.lightAtCamera += (here - this.lightAtCamera) * 0.35;
  }

  update(dt: number, time: number, cam: THREE.Camera, flashlight: number): void {
    this.stream(cam.position.x, cam.position.z);
    this.gridTimer -= dt;
    if (this.gridTimer <= 0) {
      this.gridTimer = 1 / 20;
      this.updateGrid(cam.position.x, cam.position.z, time);
    }
    const fogScale = 0.35 + Math.min(1, this.lightAtCamera) * 0.65;   // darker fog in dark zones
    for (const m of this.materials) {
      m.uniforms.uCam.value.copy(cam.position);
      cam.getWorldDirection(m.uniforms.uCamDir.value);
      m.uniforms.uFlash.value = flashlight;
      m.uniforms.uFog.value.copy(FOG).multiplyScalar(fogScale);
    }
  }

  dispose(): void {
    for (const meshes of this.chunks.values()) for (const m of meshes) m.geometry.dispose();
    for (const m of this.materials) {
      (m.uniforms.map.value as THREE.Texture).dispose();
      m.dispose();
    }
    this.gridTex.dispose();
    this.chunks.clear();
  }
}
