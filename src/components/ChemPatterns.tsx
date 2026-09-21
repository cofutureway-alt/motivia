/**
 * Chemistry-themed decorative SVG patterns — replacements for the old
 * Islamic-geometry ornaments, keeping the same usage API.
 */

/** Benzene hexagon with inner circle (aromatic ring). */
export const BenzeneRing = ({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <polygon
      points="20,4 33.86,12 33.86,28 20,36 6.14,28 6.14,12"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    <circle cx="20" cy="4" r="1.8" fill="currentColor" />
    <circle cx="33.86" cy="28" r="1.8" fill="currentColor" opacity="0.65" />
  </svg>
);

/** Bond-line divider: solid lines meeting a benzene node. */
export const ChemDivider = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
    <span className="h-px w-16 sm:w-24 bg-primary/40" />
    <BenzeneRing size={22} className="text-primary/70" />
    <span className="h-px w-16 sm:w-24 bg-primary/40" />
  </div>
);

/** Small molecule cluster (three bonded atoms) used as a bullet/marker. */
export const MoleculeMark = ({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size * 0.75}
    viewBox="0 0 32 24"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <line x1="8" y1="18" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" />
    <line x1="16" y1="6" x2="26" y2="14" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="18" r="3.4" fill="currentColor" opacity="0.55" />
    <circle cx="16" cy="6" r="4.2" fill="currentColor" />
    <circle cx="26" cy="14" r="3.4" fill="currentColor" opacity="0.75" />
  </svg>
);
