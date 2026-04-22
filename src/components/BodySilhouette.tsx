"use client";

/**
 * Public BodySilhouette wrapper. The actual rendering is the 3D mannequin
 * (`BodySilhouette3D`) loaded via `next/dynamic` with `ssr: false` so the
 * WebGL initialization stays out of the build / SSR pipeline.
 */

import dynamic from "next/dynamic";
import type { BodyZone } from "@/lib/fragrances";
import type { PlacedMarker } from "./BodySilhouette3D";

export type { PlacedMarker };

type Props = {
  filledMarkers?: PlacedMarker[];
  highlightedZone?: BodyZone | null;
  onBodyClick?: (zone: BodyZone, position: [number, number, number]) => void;
  readOnly?: boolean;
  className?: string;
};

const BodySilhouette3D = dynamic(
  () =>
    import("./BodySilhouette3D").then((m) => ({
      default: m.BodySilhouette3D,
    })),
  {
    ssr: false,
    loading: SkeletonMannequin,
  },
);

export function BodySilhouette(props: Props) {
  return <BodySilhouette3D {...props} />;
}

export function fragranceInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function SkeletonMannequin() {
  return (
    <div
      className="w-full max-w-[380px] mx-auto bg-surface-container-low animate-pulse"
      style={{ aspectRatio: "3 / 4" }}
      aria-hidden
    />
  );
}
