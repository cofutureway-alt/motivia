import { useEffect, useState } from "react";
import { getR2PublicUrl } from "@/lib/r2-storage";

export const useSignedThumbnail = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    return getR2PublicUrl("thumbnails", path);
  });

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    setUrl(getR2PublicUrl("thumbnails", path));
  }, [path]);

  return url;
};

