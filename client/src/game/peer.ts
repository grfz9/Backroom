/**
 * WebRTC transport for co-op, through PeerJS and its free public broker: the page is hosted
 * statically (GitHub Pages), so there is no game server — players connect directly to the host.
 * Game data goes through the host (star); voice is a full mesh of audio calls between players.
 * PeerJS is loaded on demand: solo play never needs it.
 */

import type { DataConnection, MediaConnection, Peer } from 'peerjs';
import type { Link, NetMsg } from './net';

const PREFIX = 'liminal-bci-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easier to read aloud

export function randomRoomCode(): string {
  return Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
}

function toLink(conn: DataConnection): Link {
  const link: Link = {
    send: (msg) => { if (conn.open) conn.send(msg); },
    close: () => conn.close(),
    onMessage: () => {},
    onClose: () => {},
  };
  conn.on('data', (data) => link.onMessage(data as NetMsg));
  conn.on('close', () => link.onClose());
  conn.on('error', () => link.onClose());
  return link;
}

export class PeerRoom {
  /** Called with the voice stream of another player. */
  onStream: (pid: string, stream: MediaStream) => void = () => {};
  onStreamEnd: (pid: string) => void = () => {};
  private stream: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private calls = new Map<string, MediaConnection>();

  private constructor(private peer: Peer) {
    peer.on('call', (call) => {
      if (!this.stream) return call.close();
      call.answer(this.stream);
      this.track(call);
    });
  }

  /** This player's WebRTC id. */
  get pid(): string {
    return this.peer.id;
  }

  private static async open(id?: string): Promise<Peer> {
    const { Peer: PeerClass } = await import('peerjs');
    const peer = id ? new PeerClass(id) : new PeerClass();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    return peer;
  }

  /** Open a room. `onLink` is called for every player who joins. */
  static async host(code: string, onLink: (link: Link) => void): Promise<PeerRoom> {
    const peer = await PeerRoom.open(PREFIX + code);
    peer.on('connection', (conn) => conn.on('open', () => onLink(toLink(conn))));
    return new PeerRoom(peer);
  }

  /** Join a room by code. Rejects if the room does not exist or cannot be reached. */
  static async join(code: string): Promise<{ room: PeerRoom; link: Link }> {
    const peer = await PeerRoom.open();
    return new Promise((resolve, reject) => {
      const fail = (err: unknown): void => { peer.destroy(); reject(err); };
      const timer = setTimeout(() => fail(new Error('timeout')), 15000);
      peer.on('error', fail);
      const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
      conn.on('open', () => {
        clearTimeout(timer);
        peer.off('error', fail);
        resolve({ room: new PeerRoom(peer), link: toLink(conn) });
      });
    });
  }

  /**
   * Ask for the microphone. Without it (refused or absent) the player can still hear the
   * others: `silent` is sent instead. Returns true if the microphone is live.
   */
  async enableVoice(silent: MediaStream): Promise<boolean> {
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.stream = this.mic;
    } catch {
      this.stream = silent;
    }
    return this.mic !== null;
  }

  /** Mute / unmute the microphone. Returns the new state (true = talking allowed). */
  toggleMic(): boolean {
    const track = this.mic?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  /** Make sure a voice call exists with this player. Only the lower id calls, to avoid doubles. */
  ensureCall(pid: string): void {
    if (!this.stream || !pid || this.calls.has(pid) || this.pid >= pid) return;
    this.track(this.peer.call(pid, this.stream));
  }

  private track(call: MediaConnection): void {
    this.calls.set(call.peer, call);
    call.on('stream', (remote) => this.onStream(call.peer, remote));
    const end = (): void => {
      if (this.calls.get(call.peer) === call) this.calls.delete(call.peer);
      this.onStreamEnd(call.peer);
    };
    call.on('close', end);
    call.on('error', end);
  }

  destroy(): void {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.peer.destroy();
  }
}
