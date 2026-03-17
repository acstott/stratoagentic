import { icon } from "@fortawesome/fontawesome-svg-core";
import { faPlane } from "@fortawesome/free-solid-svg-icons";

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildPlaneSvg(color: string): string {
  const fa = icon(faPlane);
  const path = (fa.icon as any)[4];

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <path fill="${color}" d="${path}" filter="url(#glow)" />
</svg>
`;
}

export function getPlaneDataUrl(color = "#67e8f9"): string {
  return toDataUrl(buildPlaneSvg(color));
}

export function getGroundPlaneDataUrl(color = "#f59e0b"): string {
  return toDataUrl(buildPlaneSvg(color));
}