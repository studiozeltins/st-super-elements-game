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
  // Blades are GPU-instanced single triangles (5 draws total, wind in the
  // vertex shader), so count costs vertices + one-time placement, not frame
  // CPU — 40k measured indistinguishable from 12k in the combat fps playtest.
  return isCoarsePointer
    ? { grassBladeCount: 10000, influenceResolution: 256 }
    : { grassBladeCount: 40000, influenceResolution: 512 };
}

export function detectQualityProfile(): QualityProfile {
  return chooseQualityProfile(window.matchMedia('(pointer: coarse)').matches);
}
