import { describe, expect, it } from 'vitest';
import { VOICE_RANGE, voiceGain, voicePan } from './voice';

describe('proximity voice', () => {
  it('fades with distance and is silent out of range', () => {
    expect(voiceGain(0)).toBe(1);
    expect(voiceGain(5)).toBeGreaterThan(voiceGain(10));
    expect(voiceGain(VOICE_RANGE)).toBe(0);
    expect(voiceGain(VOICE_RANGE + 30)).toBe(0);
  });

  it('pans a speaker to the side they are on', () => {
    // Listener at yaw 0 faces -Z: +X is on the right.
    expect(voicePan(5, 0, 0)).toBeCloseTo(1);
    expect(voicePan(-5, 0, 0)).toBeCloseTo(-1);
    expect(voicePan(0, -5, 0)).toBeCloseTo(0);
    // Turned 90° left (facing -X): what was ahead (-Z) is now on the right.
    expect(voicePan(0, -5, Math.PI / 2)).toBeCloseTo(1);
    expect(voicePan(0, 0, 1)).toBe(0);
  });
});
