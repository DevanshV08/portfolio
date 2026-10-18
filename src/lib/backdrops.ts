/**
 * What stands behind the car. "studio" is the original product studio; the
 * others are real 360° photos of Zwartkops Raceway, South Africa
 * (Poly Haven, CC0). Kept free of three.js so the page overlay can import it.
 */
export const BACKDROPS = [
  { id: "studio", label: "Studio" },
  { id: "pit", label: "Pit lane" },
  { id: "grid", label: "Start grid" },
  { id: "straight", label: "Back straight" },
] as const;

export type BackdropId = (typeof BACKDROPS)[number]["id"];
export type PhotoBackdropId = Exclude<BackdropId, "studio">;

export function parseBackdrop(value: string | null): BackdropId | null {
  return BACKDROPS.find((b) => b.id === value)?.id ?? null;
}

export function isPhotoBackdrop(id: BackdropId): id is PhotoBackdropId {
  return id !== "studio";
}
