import * as THREE from "three";

type Spec = THREE.MeshPhysicalMaterialParameters;

/** Metallic paint under clear coat, like a die-cast collectible. */
// Clear-coat roughness above ~0.05 keeps thin reflections from breaking up into dashes.
const PAINT: Spec = { metalness: 0.45, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.07 };

/**
 * Materials keyed by the names exported from Blender
 * (blender/build_rb9_figurine.py). Colours only: no logos or sponsor marks.
 */
const SPECS: Record<string, Spec> = {
  paint_navy: { ...PAINT, color: "#1f2758" },
  paint_purple: { ...PAINT, color: "#4a2f95" },
  paint_yellow: { ...PAINT, color: "#f2c200", metalness: 0.08, roughness: 0.32 },
  paint_red: { ...PAINT, color: "#d0122f", metalness: 0.08, roughness: 0.32 },
  carbon: { color: "#101114", metalness: 0.35, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.08 },
  rubber: { color: "#141414", metalness: 0, roughness: 0.82, sheen: 0.4, sheenRoughness: 0.8, sheenColor: "#2a2a2a" },
  tyre_band: { color: "#efbf00", metalness: 0, roughness: 0.62 },
  rim_metal: { color: "#c7ccd4", metalness: 1, roughness: 0.22 },
  hub_dark: { color: "#2a2c31", metalness: 0.9, roughness: 0.34 },
  helmet_white: { color: "#f2f2ef", metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 },
  helmet_red: { color: "#c8102e", metalness: 0, roughness: 0.28, clearcoat: 1 },
  visor: { color: "#07090d", metalness: 0.7, roughness: 0.06, clearcoat: 1 },
  mirror_glass: { color: "#aab2bc", metalness: 1, roughness: 0.03 },
  decal_white: { color: "#f4f4f2", metalness: 0, roughness: 0.35, clearcoat: 1 },
  padding: { color: "#1a1e3a", metalness: 0, roughness: 0.86 },
  inlet_black: { color: "#030304", metalness: 0, roughness: 0.92 },
  rain_light: { color: "#5a0b08", metalness: 0, roughness: 0.3 },
};

export function createFigurineMaterials(): Record<string, THREE.Material> {
  return Object.fromEntries(
    Object.entries(SPECS).map(([name, spec]) => {
      const material = new THREE.MeshPhysicalMaterial(spec);
      material.name = name;
      return [name, material];
    }),
  );
}
