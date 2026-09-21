import { useEffect, useState } from "react";
import { getR2PublicUrl } from "@/lib/r2-storage";

export const useSignedUrl = (
  bucket: string,
  path: string | null | undefined,
  _ttlSeconds = 3600,
) => {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    return getR2PublicUrl(bucket, path);
  });

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    setUrl(getR2PublicUrl(bucket, path));
  }, [bucket, path]);

  return url;
};

