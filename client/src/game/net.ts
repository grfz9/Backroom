/**
 * Co-op networking, transport-agnostic. One player hosts the room and runs the entity; the
 * others send their own position and receive everyone else's. The host relays (star topology).
 *
 * The transport is a `Link` (a WebRTC data channel in the game, an in-memory pair in tests),
 * so the whole protocol is testable without a browser.
 */

export interface Link {
  send(msg: NetMsg): void;
  close(): void;
  onMessage: (msg: NetMsg) => void;
  onClose: () => void;
}

export interface PlayerSnap {
  id: number;
  x: number;
  z: number;
  yaw: number;
  /** 0 standing … 1 crouched. */
  cr: number;
  alive: boolean;
  /** Noise radius in metres, and whether the player is lit: what the entity perceives. */
  noise: number;
  lit: boolean;
  /** Flashlight on. */
  fl: boolean;
  /** WebRTC peer id, used to set up proximity voice between players. */
  pid: string;
}

export interface EntitySnap {
  kind: 'prowler' | 'mimic';
  x: number;
  z: number;
  yaw: number;
  state: string;
  speed: number;
}

export type NetMsg =
  | { t: 'welcome'; id: number; seedText: string; depth: number }
  | { t: 'level'; seedText: string; depth: number }
  | { t: 'state'; p: PlayerSnap }
  | { t: 'world'; time: number; players: PlayerSnap[]; entities: EntitySnap[] }
  | { t: 'exit' }
  | { t: 'dead' }
  | { t: 'end'; runTime: number; deaths: number };

export const MAX_PLAYERS = 4;

export interface NetHandlers {
  /** Client: the host tells which level to load. */
  onLevel(seedText: string, depth: number): void;
  /** Client: world update from the host. */
  onWorld(time: number, entities: EntitySnap[]): void;
  /** Host: a client walked into the exit. */
  onExit(): void;
  /** Client: the entity caught this player. */
  onDead(): void;
  onEnd(runTime: number, deaths: number): void;
  /** Client: the host left. */
  onClosed(): void;
}

export class Net {
  /** Local player id (0 for the host). */
  id = 0;
  /** Latest known state of every OTHER player. */
  readonly others = new Map<number, PlayerSnap>();
  private links = new Map<number, Link>();
  private nextId = 1;
  private level = { seedText: '', depth: 0 };

  constructor(readonly role: 'host' | 'client', private handlers: NetHandlers) {}

  get playerCount(): number {
    return this.others.size + 1;
  }

  /** Host: a new client connected. Returns false if the room is full. */
  accept(link: Link): boolean {
    if (this.links.size >= MAX_PLAYERS - 1) {
      link.close();
      return false;
    }
    const id = this.nextId++;
    this.links.set(id, link);
    link.onMessage = (msg) => {
      if (msg.t === 'state') this.others.set(id, { ...msg.p, id });
      else if (msg.t === 'exit') this.handlers.onExit();
    };
    link.onClose = () => {
      this.links.delete(id);
      this.others.delete(id);
    };
    link.send({ t: 'welcome', id, ...this.level });
    return true;
  }

  /** Client: attach the link to the host. */
  join(link: Link): void {
    this.links.set(0, link);
    link.onMessage = (msg) => {
      if (msg.t === 'welcome') {
        this.id = msg.id;
        this.handlers.onLevel(msg.seedText, msg.depth);
      } else if (msg.t === 'level') this.handlers.onLevel(msg.seedText, msg.depth);
      else if (msg.t === 'world') {
        this.others.clear();
        for (const p of msg.players) if (p.id !== this.id) this.others.set(p.id, p);
        this.handlers.onWorld(msg.time, msg.entities);
      } else if (msg.t === 'dead') this.handlers.onDead();
      else if (msg.t === 'end') this.handlers.onEnd(msg.runTime, msg.deaths);
    };
    link.onClose = () => this.handlers.onClosed();
  }

  /** Host: announce the level to everyone (also remembered for late joiners). */
  setLevel(seedText: string, depth: number): void {
    this.level = { seedText, depth };
    for (const link of this.links.values()) link.send({ t: 'level', seedText, depth });
  }

  /** Called ~15 times per second with the local player state (and, on the host, the entity). */
  sync(local: PlayerSnap, time: number, entities: EntitySnap[]): void {
    local.id = this.id;
    if (this.role === 'client') {
      this.links.get(0)?.send({ t: 'state', p: local });
      return;
    }
    const players = [local, ...this.others.values()];
    for (const link of this.links.values()) link.send({ t: 'world', time, players, entities });
  }

  /** Client: tell the host the exit was reached. */
  sendExit(): void {
    this.links.get(0)?.send({ t: 'exit' });
  }

  /** Host: tell a client it was caught. */
  sendDead(id: number): void {
    this.links.get(id)?.send({ t: 'dead' });
  }

  /** Host: the run is over. */
  sendEnd(runTime: number, deaths: number): void {
    for (const link of this.links.values()) link.send({ t: 'end', runTime, deaths });
  }

  close(): void {
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this.others.clear();
  }
}

/** Two connected in-memory links (for tests). Messages are JSON-cloned like on the wire. */
export function memoryLinkPair(): [Link, Link] {
  const make = (): Link => ({ send: () => {}, close: () => {}, onMessage: () => {}, onClose: () => {} });
  const a = make(), b = make();
  a.send = (m) => b.onMessage(JSON.parse(JSON.stringify(m)) as NetMsg);
  b.send = (m) => a.onMessage(JSON.parse(JSON.stringify(m)) as NetMsg);
  a.close = b.close = () => {
    a.onClose();
    b.onClose();
  };
  return [a, b];
}
