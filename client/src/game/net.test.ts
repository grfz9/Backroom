import { describe, expect, it, vi } from 'vitest';
import { memoryLinkPair, Net, type NetHandlers, type PlayerSnap } from './net';

const handlers = (): NetHandlers => ({
  onLevel: vi.fn(), onWorld: vi.fn(), onExit: vi.fn(), onDead: vi.fn(), onEnd: vi.fn(), onClosed: vi.fn(),
});
const snap = (x: number): PlayerSnap => ({ id: 0, x, z: 0, yaw: 0, cr: 0, alive: true, noise: 0, lit: true, fl: false, pid: 'p' + x });

function room(clients: number) {
  const hh = handlers(), host = new Net('host', hh);
  host.setLevel('seed', 2);
  const joined = Array.from({ length: clients }, () => {
    const h = handlers(), net = new Net('client', h), [a, b] = memoryLinkPair();
    net.join(b);
    return { net, h, ok: host.accept(a), link: b };
  });
  return { host, hh, joined };
}

describe('co-op protocol', () => {
  it('a joining client receives its id and the current level', () => {
    const { joined } = room(2);
    expect(joined[0].net.id).toBe(1);
    expect(joined[1].net.id).toBe(2);
    expect(joined[1].h.onLevel).toHaveBeenCalledWith('seed', 2);
  });

  it('refuses a fifth player', () => {
    const { joined, host } = room(4);
    expect(joined.map((j) => j.ok)).toEqual([true, true, true, false]);
    expect(host.playerCount).toBe(1);   // nobody has sent a state yet
  });

  it('relays every player to every other player, and the entity', () => {
    const { host, joined } = room(2);
    joined[0].net.sync(snap(10), 0, []);
    joined[1].net.sync(snap(20), 0, []);
    host.sync(snap(1), 5, [{ kind: 'prowler', i: 0, tgt: 1, x: 3, z: 4, yaw: 0, state: 'chase', speed: 4 }]);
    expect(host.playerCount).toBe(3);
    expect([...joined[0].net.others.values()].map((p) => [p.id, p.x])).toEqual([[0, 1], [2, 20]]);
    expect(joined[0].h.onWorld).toHaveBeenCalledWith(5, [expect.objectContaining({ state: 'chase' })]);
  });

  it('forwards exit, death, level change and end of run', () => {
    const { host, hh, joined } = room(2);
    joined[1].net.sendExit();
    expect(hh.onExit).toHaveBeenCalledTimes(1);
    host.sendDead(1);
    expect(joined[0].h.onDead).toHaveBeenCalled();
    expect(joined[1].h.onDead).not.toHaveBeenCalled();
    host.setLevel('seed', 3);
    expect(joined[1].h.onLevel).toHaveBeenLastCalledWith('seed', 3);
    host.sendEnd(120, 2);
    expect(joined[0].h.onEnd).toHaveBeenCalledWith(120, 2);
  });

  it('forgets a player who disconnects and warns clients when the host leaves', () => {
    const { host, joined } = room(2);
    joined[0].net.sync(snap(10), 0, []);
    expect(host.playerCount).toBe(2);
    joined[0].link.close();
    expect(host.playerCount).toBe(1);
    host.close();
    expect(joined[1].h.onClosed).toHaveBeenCalled();
  });
});
