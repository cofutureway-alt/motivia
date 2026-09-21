import React from "react";
/**
 * Reusable Islamic geometric pattern and ornament SVG components.
 */

/** Islamic arch (mihrab) shape used as section dividers or decorative frames */
export const IslamicArch = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 200 120" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 120 L10 50 Q10 10 100 10 Q190 10 190 50 L190 120"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path
      d="M30 120 L30 55 Q30 25 100 25 Q170 25 170 55 L170 120"
      stroke="currentColor"
      strokeWidth="0.8"
      fill="none"
    />
  </svg>
);

/**
 * Eight-pointed star slot → now renders a benzene aromatic ring.
 * Name kept so all existing call sites adopt the chemistry identity
 * without touching every file.
 */
export const EightPointStar = ({ className = "", size = 40, style }: { className?: string; size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <polygon
      points="20,4 33.86,12 33.86,28 20,36 6.14,28 6.14,12"
      stroke="currentColor"
      strokeWidth="2.4"
      fill="none"
    />
    <circle cx="20" cy="20" r="7.5" stroke="currentColor" strokeWidth="1.8" opacity="0.7" />
    <circle cx="20" cy="4" r="2.6" fill="currentColor" />
    <circle cx="33.86" cy="12" r="2" fill="currentColor" opacity="0.7" />
    <circle cx="33.86" cy="28" r="2" fill="currentColor" opacity="0.55" />
    <circle cx="6.14" cy="28" r="2" fill="currentColor" opacity="0.7" />
  </svg>
);

/** Islamic geometric repeating tile pattern for backgrounds */
export const IslamicPattern = ({ className = "" }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80" fill="none">
    <g stroke="currentColor" strokeWidth="0.5" opacity="0.15">
      {/* Central octagon */}
      <polygon points="40,10 55,17 60,33 55,48 40,55 25,48 20,33 25,17" />
      {/* Corner connections */}
      <line x1="0" y1="0" x2="25" y2="17" />
      <line x1="80" y1="0" x2="55" y2="17" />
      <line x1="0" y1="80" x2="25" y2="48" />
      <line x1="80" y1="80" x2="55" y2="48" />
      {/* Side connections */}
      <line x1="40" y1="0" x2="40" y2="10" />
      <line x1="40" y1="55" x2="40" y2="80" />
      <line x1="0" y1="33" x2="20" y2="33" />
      <line x1="60" y1="33" x2="80" y2="33" />
      {/* Inner star */}
      <line x1="40" y1="10" x2="55" y2="48" />
      <line x1="55" y1="17" x2="25" y2="48" />
      <line x1="60" y1="33" x2="25" y2="17" />
      <line x1="55" y1="48" x2="20" y2="33" />
      <line x1="40" y1="55" x2="25" y2="17" />
      <line x1="25" y1="48" x2="55" y2="17" />
      <line x1="20" y1="33" x2="55" y2="48" />
      <line x1="25" y1="17" x2="60" y2="33" />
    </g>
  </svg>
);

/** Crescent and star motif */
export const CrescentStar = ({ className = "", size = 32, style }: { className?: string; size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M60 15 A35 35 0 1 0 60 85 A28 28 0 1 1 60 15Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <polygon
      points="78,35 81,43 89,43 83,48 85,56 78,51 71,56 73,48 67,43 75,43"
      stroke="currentColor"
      strokeWidth="1"
      fill="currentColor"
      opacity="0.3"
    />
  </svg>
);

/** Section divider — bond-lines meeting a benzene node (solid colors) */
export const IslamicDivider = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`}>
    <span className="h-px w-16 sm:w-24 bg-primary/40" />
    <BenzeneRing size={22} className="text-primary/70" />
    <span className="h-px w-16 sm:w-24 bg-primary/40" />
  </div>
);

/** Aromatic benzene ring used by the divider above. */
export const BenzeneRing = ({ className = "", size = 22 }: { className?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
    <polygon points="20,4 33.86,12 33.86,28 20,36 6.14,28 6.14,12" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
  </svg>
);
