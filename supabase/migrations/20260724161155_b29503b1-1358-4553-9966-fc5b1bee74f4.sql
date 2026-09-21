
-- Revoke sensitive digital-book columns from anonymous role only.
-- Public catalog page (Books.tsx) does not select these columns, so browsing is unaffected.
-- Admins and purchasers use the authenticated role, which keeps full access.
REVOKE SELECT (digital_file_url, download_limit, is_drm_protected)
  ON public.books FROM anon;
