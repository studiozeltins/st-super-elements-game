/**
 * Quality tiers for the ambiance systems. Coarse-pointer devices (phones,
 * tablets) get fewer grass blades and a smaller influence map — aligned with
 * the CSS `@media (pointer: coarse)` breakpoints the HUD already uses.
 */
export interface QualityProfile {
  grassBladeCount: number;
  influenceResolution: number;
}

export function chooseQualityProfile(isCoarsePointer: boolean): QualityProfile {
  return isCoarsePointer
    ? { grassBladeCount: 6000, influenceResolution: 256 }
    : { grassBladeCount: 28000, influenceResolution: 512 };
}

export function detectQualityProfile(): QualityProfile {
  return chooseQualityProfile(window.matchMedia('(pointer: coarse)').matches);
}
