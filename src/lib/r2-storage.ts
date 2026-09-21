import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// All values come from env (.env) — no secrets hardcoded in source.
export const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/$/, "");
export const R2_ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID || "";
export const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID || "";
export const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = import.meta.env.VITE_R2_BUCKET_NAME || "";

export const isR2Configured = () =>
  !!(R2_PUBLIC_URL && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

const r2ClientLazy = (() => {
  let client: S3Client | null = null;
  return () => {
    if (!client) {
      client = new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      });
    }
    return client;
  };
})();

/**
 * Get the zero-egress Cloudflare R2 public URL for a bucket & file path
 */
export function getR2PublicUrl(bucket: string, path: string): string {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  // Strip leading slash
  const cleanPath = path.replace(/^\//, "");
  // If path already starts with bucket name, avoid duplicating
  if (cleanPath.startsWith(`${bucket}/`)) {
    return `${R2_PUBLIC_URL}/${cleanPath}`;
  }
  return `${R2_PUBLIC_URL}/${bucket}/${cleanPath}`;
}

/**
 * Upload a file directly to Cloudflare R2
 */
export async function uploadToR2(
  bucket: string,
  path: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  contentType?: string
): Promise<string> {
  const cleanPath = path.replace(/^\//, "");
  const key = `${bucket}/${cleanPath}`;

  let body: Uint8Array;
  if (file instanceof File || file instanceof Blob) {
    const arrayBuffer = await file.arrayBuffer();
    body = new Uint8Array(arrayBuffer);
  } else if (file instanceof ArrayBuffer) {
    body = new Uint8Array(file);
  } else {
    body = file;
  }

  const mimeType = contentType || (file as File).type || "application/octet-stream";

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: mimeType,
  });

  await r2ClientLazy().send(command);

  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Delete an object from Cloudflare R2
 */
export async function deleteFromR2(bucket: string, path: string): Promise<void> {
  if (!path) return;
  let key = path;
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = url.pathname.replace(/^\//, "");
    } catch {
      // keep original
    }
  } else {
    const cleanPath = path.replace(/^\//, "");
    if (!cleanPath.startsWith(`${bucket}/`)) {
      key = `${bucket}/${cleanPath}`;
    } else {
      key = cleanPath;
    }
  }

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  await r2ClientLazy().send(command);
}
