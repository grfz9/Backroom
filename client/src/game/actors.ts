/**
 * Procedural, articulated character models (no external asset): surveyors (players), the Prowler
 * and their heads. Limbs hang from pivot groups so a walk cycle is a few rotations.
 * The same builders serve the lit world (custom shader materials) and the jumpscare close-up
 * (standard materials): only the material set changes.
 */

import * as THREE from 'three';

export interface ActorMats {
  skin: THREE.Material;
  dark: THREE.Material;
  /** Unlit, bright: eyes. */
  glow: THREE.Material;
  teeth: THREE.Material;
  suit: THREE.Material;
  face: THREE.Material;
  /** Unlit red: the camcorder REC lamp. */
  rec: THREE.Material;
}

export interface Actor {
  group: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  kind: 'prowler' | 'surveyor';
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};

/** A two-segment limb hanging from a pivot at its top. Returns the pivot; `joint` bends the lower half. */
function limb(m: THREE.Material, r: number, upper: number, lower: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CapsuleGeometry(r, upper, 3, 7), m, 0, -upper / 2, 0));
  const joint = new THREE.Group();
  joint.name = 'joint';
  joint.position.y = -upper;
  joint.add(mesh(new THREE.CapsuleGeometry(r * 0.85, lower, 3, 7), m, 0, -lower / 2, 0));
  pivot.add(joint);
  return pivot;
}

/** The Prowler's head: stretched skull, hollow sockets with pinpoint eyes, a mouth that opens too far. Faces -Z. */
export function buildProwlerHead(m: ActorMats): THREE.Group {
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.15, 14, 12), m.skin);
  skull.scale.set(0.85, 1.3, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) {
    const socket = mesh(new THREE.SphereGeometry(0.046, 10, 8), m.dark, s * 0.056, 0.035, -0.112);
    socket.scale.set(1, 1.25, 0.6);
    head.add(socket, mesh(new THREE.SphereGeometry(0.011, 6, 6), m.glow, s * 0.056, 0.035, -0.142));
  }
  const mouth = new THREE.Group();
  mouth.name = 'mouth';
  mouth.position.set(0, -0.1, -0.11);
  const hole = mesh(new THREE.SphereGeometry(0.07, 12, 10), m.dark);
  hole.scale.set(0.8, 1.5, 0.5);
  mouth.add(hole);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.016;
    const up = mesh(new THREE.ConeGeometry(0.008, 0.045, 5), m.teeth, x, 0.07 - Math.abs(x) * 0.5, -0.03);
    up.rotation.x = Math.PI;
    mouth.add(up, mesh(new THREE.ConeGeometry(0.008, 0.04, 5), m.teeth, x, -0.075 + Math.abs(x) * 0.5, -0.03));
  }
  head.add(mouth);
  return head;
}

/** A surveyor's head with cap. `wrong` gives the Double's real face: black eyes, a mouth torn open. */
export function buildSurveyorHead(m: ActorMats, wrong: boolean): THREE.Group {
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.11, 14, 12), m.face);
  skull.scale.set(0.92, 1.12, 1);
  head.add(skull);
  const cap = mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), m.suit, 0, 0.012, 0);
  head.add(cap, mesh(new THREE.BoxGeometry(0.16, 0.012, 0.09), m.suit, 0, 0.055, -0.13));
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(wrong ? 0.03 : 0.012, 8, 6), m.dark, s * 0.04, 0.012, -0.098);
    if (wrong) eye.scale.set(1, 1.5, 0.5);
    head.add(eye);
    if (wrong) head.add(mesh(new THREE.SphereGeometry(0.006, 5, 5), m.glow, s * 0.04, 0.012, -0.115));
  }
  const mouth = new THREE.Group();
  mouth.name = 'mouth';
  mouth.position.set(0, -0.058, -0.092);
  const hole = mesh(new THREE.SphereGeometry(0.03, 10, 8), m.dark);
  hole.scale.set(wrong ? 1.5 : 0.9, wrong ? 1.9 : 0.25, 0.4);
  mouth.add(hole);
  if (wrong) for (let i = 0; i < 6; i++) mouth.add(mesh(new THREE.ConeGeometry(0.005, 0.03, 4), m.teeth, (i - 2.5) * 0.013, -0.04, -0.012));
  head.add(mouth);
  return head;
}

/** Le Rôdeur: 2.4 m, emaciated, stooped under the ceiling, arms down to the knees, clawed hands. */
export function buildProwler(m: ActorMats): Actor {
  const group = new THREE.Group();
  const hipY = 1.2;
  const legL = limb(m.skin, 0.055, 0.6, 0.6), legR = limb(m.skin, 0.055, 0.6, 0.6);
  legL.position.set(-0.11, hipY, 0);
  legR.position.set(0.11, hipY, 0);
  const spine = new THREE.Group();
  spine.position.y = hipY;
  spine.rotation.x = -0.42;                                    // leaning forward (toward -Z)
  const belly = mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 8), m.skin, 0, 0.2, 0);
  belly.scale.set(1.1, 1, 0.7);
  const ribs = mesh(new THREE.CapsuleGeometry(0.15, 0.3, 3, 9), m.skin, 0, 0.62, 0);
  ribs.scale.set(1.15, 1, 0.75);
  spine.add(belly, ribs, mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 7), m.skin, 0, 0.98, 0));
  const head = buildProwlerHead(m);
  head.position.set(0, 1.2, -0.04);
  head.rotation.x = 0.55;                                      // looks up at you from under its brow
  const arm = (side: number): THREE.Group => {
    const a = limb(m.skin, 0.04, 0.62, 0.7);
    a.position.set(side * 0.22, 0.8, 0);
    const hand = a.getObjectByName('joint')!;
    for (let i = -1; i <= 1; i++) {
      const claw = mesh(new THREE.ConeGeometry(0.014, 0.2, 5), m.dark, i * 0.028, -0.8, 0);
      claw.rotation.x = Math.PI;
      claw.rotation.z = i * 0.18;
      hand.add(claw);
    }
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  spine.add(head, armL, armR);
  group.add(legL, legR, spine);
  return { group, legL, legR, armL, armR, head, kind: 'prowler' };
}

/** A surveyor in coverall with boots, backpack and shoulder camcorder. `recording` lights the REC lamp. */
export function buildSurveyor(m: ActorMats, recording: boolean, wrong = false): Actor {
  const group = new THREE.Group();
  const hipY = 0.92;
  const leg = (side: number): THREE.Group => {
    const l = limb(m.suit, 0.078, 0.38, 0.36);
    l.position.set(side * 0.1, hipY, 0);
    l.getObjectByName('joint')!.add(mesh(new THREE.BoxGeometry(0.13, 0.1, 0.27), m.dark, 0, -0.45, -0.04));   // boot
    return l;
  };
  const legL = leg(-1), legR = leg(1);
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), m.suit, 0, hipY + 0.32, 0);
  torso.scale.set(1.08, 1, 0.72);
  const armL = limb(m.suit, 0.055, 0.28, 0.27), armR = limb(m.suit, 0.055, 0.28, 0.27);
  armL.position.set(-0.24, hipY + 0.52, 0);
  armR.position.set(0.24, hipY + 0.52, 0);
  const head = buildSurveyorHead(m, wrong);
  head.position.set(0, hipY + 0.76, -0.01);
  group.add(
    legL, legR, torso, armL, armR, head,
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), m.face, 0, hipY + 0.62, 0),               // neck
    mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), m.dark, 0, hipY + 0.36, 0.17),                     // backpack
    mesh(new THREE.BoxGeometry(0.12, 0.13, 0.32), m.dark, 0.2, hipY + 0.72, -0.06),                 // camcorder
    mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.07, 10).rotateX(Math.PI / 2), m.dark, 0.2, hipY + 0.72, -0.25),
    mesh(new THREE.SphereGeometry(0.014, 6, 6), recording ? m.rec : m.dark, 0.2, hipY + 0.8, -0.215),   // REC lamp: the tell
  );
  return { group, legL, legR, armL, armR, head, kind: 'surveyor' };
}

/**
 * Walk cycle. `t` is seconds, `speed` in m/s. A chasing Prowler reaches forward with both arms.
 */
export function animateActor(a: Actor, t: number, speed: number, chasing: boolean): void {
  const stride = a.kind === 'prowler' ? 1.6 : 1.3;
  const phase = t * Math.max(speed, 0.001) * (Math.PI * 2) / stride;
  const amp = Math.min(1, speed / 1.5) * (a.kind === 'prowler' ? 0.55 : 0.6);
  const s = Math.sin(phase) * amp;
  a.legL.rotation.x = s;
  a.legR.rotation.x = -s;
  (a.legL.children[1] as THREE.Group).rotation.x = -Math.max(0, -s) * 1.2;   // knees bend on the back swing
  (a.legR.children[1] as THREE.Group).rotation.x = -Math.max(0, s) * 1.2;
  if (a.kind === 'prowler') {
    const reach = chasing ? 1.25 : 0.15;
    a.armL.rotation.x += (reach - s * 0.5 - a.armL.rotation.x) * 0.15;
    a.armR.rotation.x += (reach + s * 0.5 - a.armR.rotation.x) * 0.15;
    a.head.rotation.z = Math.sin(t * 1.7) * 0.18 + (chasing ? Math.sin(t * 23) * 0.06 : 0);   // twitching
    a.group.position.y = Math.abs(Math.sin(phase)) * 0.04 * amp;
  } else {
    a.armL.rotation.x = -s * 0.7;
    a.armR.rotation.x = -0.9;                                    // holding the camcorder
    a.group.position.y = Math.abs(Math.sin(phase)) * 0.03 * amp;
  }
}

/** Standard-material set for the jumpscare close-up (lit by its own lamp). */
export function scareMats(): ActorMats {
  const std = (color: number): THREE.Material => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  return {
    skin: std(0xb9ad7a), dark: new THREE.MeshBasicMaterial({ color: 0x020202 }), glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    teeth: std(0xd9d2b4), suit: std(0x777b76), face: std(0xa89684), rec: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  };
}
