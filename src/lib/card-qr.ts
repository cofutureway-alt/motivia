import QRCode from "qrcode";

const cache = new Map<string, string>();

export async function generateQrDataUrl(value: string, size = 512): Promise<string> {
  const key = `${size}:${value}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  cache.set(key, url);
  return url;
}
