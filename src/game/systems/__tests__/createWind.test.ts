import { describe, expect, it } from 'vitest';
import { createWind } from '../createWind';
import { gustAt, gustEnvelope, sampleWind, windAngle } from '../windMath';

describe('createWind', () => {
  it('strengthUniform reflects the enabled flag (D-12 uniform-driven kill)', () => {
    expect(createWind(true).strengthUniform.value).toBe(1);
    expect(createWind(false).strengthUniform.value).toBe(0);
  });

  it('update accumulates the single clock into timeUniform', () => {
    const wind = createWind(true);
    expect(wind.timeUniform.value).toBe(0);
    wind.update(1.5);
    expect(wind.timeUniform.value).toBe(1.5);
    wind.update(0.5);
    expect(wind.timeUniform.value).toBe(2);
  });

  it('directionUniform.value is the SAME Vector2 object across updates, mutated in place (D-06/D-13)', () => {
    const wind = createWind(true);
    const vectorBefore = wind.directionUniform.value;
    wind.update(1.5);
    wind.update(2.5);
    expect(wind.directionUniform.value).toBe(vectorBefore);
  });

  it('direction components equal (cos(windAngle(t)), sin(windAngle(t)))', () => {
    const wind = createWind(true);
    wind.update(37.25);
    const theta = windAngle(wind.timeUniform.value);
    expect(wind.directionUniform.value.x).toBeCloseTo(Math.cos(theta), 12);
    expect(wind.directionUniform.value.y).toBeCloseTo(Math.sin(theta), 12);
  });

  it('sampleWind delegates to windMath.sampleWind at the live clock', () => {
    const wind = createWind(true);
    wind.update(12.75);
    expect(wind.sampleWind(3.2, -7.4)).toBe(sampleWind(wind.timeUniform.value, 3.2, -7.4));
  });

  it('sampleGust delegates to windMath.gustAt with the live direction', () => {
    const wind = createWind(true);
    wind.update(41.5);
    const { x: dirX, y: dirZ } = wind.directionUniform.value;
    expect(wind.sampleGust(10, 20)).toBe(gustAt(wind.timeUniform.value, 10, 20, dirX, dirZ));
  });

  it('getGustEnvelope returns the un-retarded global envelope (Phase 10 audio contract)', () => {
    const wind = createWind(true);
    wind.update(23.1);
    const envelope = wind.getGustEnvelope();
    expect(envelope).toBe(gustEnvelope(wind.timeUniform.value));
    expect(envelope).toBeGreaterThanOrEqual(0);
    expect(envelope).toBeLessThanOrEqual(1);
  });
});
