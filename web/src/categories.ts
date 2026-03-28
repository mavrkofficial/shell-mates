/** tag1 values used on-chain + human labels for the UI */
export const LOBSTER_CATEGORY_LABELS: Record<string, string> = {
  hotOrNot: "Hot or Not",
  shellGleam: "Shell Gleam",
  clawGame: "Claw Game",
  antennaRizz: "Antenna Rizz",
  tailFlex: "Tail Flex",
  butterBath: "Butter Bath",
  barnacleBling: "Barnacle Bling",
};

/** Stable default so callers (e.g. useCallback deps) don’t see a new array every render. */
const DEFAULT_CATEGORY_TAGS: string[] = ["hotOrNot"];

export function parseCategoriesEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return DEFAULT_CATEGORY_TAGS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
