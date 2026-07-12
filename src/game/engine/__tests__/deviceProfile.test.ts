import { describe, expect, it } from 'vitest';
import { chooseQualityProfile } from '../deviceProfile';

describe('chooseQualityProfile', () => {
  it('gives coarse-pointer devices the reduced tier', () => {
    expect(chooseQualityProfile(true)).toEqual({
      grassBladeCount: 6000,
      influenceResolution: 256,
    });
  });

  it('gives fine-pointer devices the full tier', () => {
    expect(chooseQualityProfile(false)).toEqual({
      grassBladeCount: 28000,
      influenceResolution: 512,
    });
  });
});
