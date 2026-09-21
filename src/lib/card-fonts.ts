import WebFont from "webfontloader";

export const FEATURED_FONTS = ["Tajawal", "Cairo"] as const;

export const GOOGLE_FONTS = [
  "Tajawal",
  "Cairo",
  "Almarai",
  "Amiri",
  "Changa",
  "El Messiri",
  "IBM Plex Sans Arabic",
  "Lateef",
  "Markazi Text",
  "Noto Kufi Arabic",
  "Noto Naskh Arabic",
  "Reem Kufi",
  "Scheherazade New",
  "Inter",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Lora",
];

const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function loadFont(family: string): Promise<void> {
  if (!family) return Promise.resolve();
  if (loaded.has(family)) return Promise.resolve();
  const existing = pending.get(family);
  if (existing) return existing;

  const p = new Promise<void>((resolve) => {
    try {
      WebFont.load({
        google: { families: [`${family}:400,700`] },
        active: async () => {
          try {
            // Ensure the font is actually usable by canvas
            // @ts-ignore
            if (document.fonts?.load) {
              await Promise.all([
                (document as any).fonts.load(`16px "${family}"`),
                (document as any).fonts.load(`bold 16px "${family}"`),
              ]);
            }
          } catch {}
          loaded.add(family);
          resolve();
        },
        inactive: () => {
          loaded.add(family);
          resolve();
        },
        timeout: 5000,
      });
    } catch {
      resolve();
    }
  });
  pending.set(family, p);
  return p;
}

export async function preloadFontsFromJson(json: any): Promise<void> {
  if (!json?.objects) return;
  const families = new Set<string>();
  for (const o of json.objects) {
    if (o?.fontFamily) families.add(o.fontFamily);
  }
  await Promise.all(Array.from(families).map(loadFont));
}
