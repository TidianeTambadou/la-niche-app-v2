"use client";

/**
 * 3D mannequin with "click-anywhere-on-the-body" placement.
 *
 * Interaction model:
 *  - No predefined dots. The body is presented clean.
 *  - User taps/clicks any point on the body → we raycast the mesh, the hit
 *    gives us a precise 3D position, and we classify it into the closest
 *    anatomical region (BodyZone) so we keep stable labels for wishlist,
 *    recommendations, heatmap stats.
 *  - Camera dollies to the hit point and a pulsing "preview" marker is drawn
 *    exactly there. If the parent commits the placement, it becomes a solid
 *    marker with the perfume initials — again AT the exact click point, not
 *    snapped to a zone anchor.
 *  - Drag the canvas horizontally to orbit the model (access back-of-body).
 *
 * The `filledMarkers` prop carries the existing placements: each with its
 * zone (for labeling), initials (for display), and optional precise position.
 * When position is missing, we fall back to the zone anchor (legacy data).
 */

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clsx } from "clsx";
import { useTheme } from "next-themes";
import { Icon } from "@/components/Icon";
import type { BodyZone } from "@/lib/fragrances";

const MODEL_URL = "/models/mannequin.glb";
const TARGET_HEIGHT = 1.85;

/* -------------------------------------------------------------------------
 * Zone anchors — used for derivation ("which zone is this hit closest to?")
 * and as fallback marker positions for legacy placements without a stored
 * world position.
 * --------------------------------------------------------------------- */

const ZONE_ANCHORS: Record<BodyZone, THREE.Vector3> = {
  "behind-ear-left": new THREE.Vector3(-0.11, 1.73, -0.02),
  "behind-ear-right": new THREE.Vector3(0.11, 1.73, -0.02),
  "neck-left": new THREE.Vector3(-0.06, 1.55, 0.05),
  "neck-right": new THREE.Vector3(0.06, 1.55, 0.05),
  throat: new THREE.Vector3(0, 1.5, 0.1),
  nape: new THREE.Vector3(0, 1.62, -0.06),
  chest: new THREE.Vector3(0, 1.32, 0.13),
  "inner-elbow-left": new THREE.Vector3(-0.45, 1.5, 0.05),
  "inner-elbow-right": new THREE.Vector3(0.45, 1.5, 0.05),
  "outer-elbow-left": new THREE.Vector3(-0.45, 1.5, -0.05),
  "outer-elbow-right": new THREE.Vector3(0.45, 1.5, -0.05),
  "wrist-left": new THREE.Vector3(-0.78, 1.5, 0.04),
  "wrist-right": new THREE.Vector3(0.78, 1.5, 0.04),
  "back-of-hand-left": new THREE.Vector3(-0.92, 1.52, -0.04),
  "back-of-hand-right": new THREE.Vector3(0.92, 1.52, -0.04),
};

const ALL_ZONES = Object.keys(ZONE_ANCHORS) as BodyZone[];

function closestZone(worldPoint: THREE.Vector3): BodyZone {
  let bestZone: BodyZone = ALL_ZONES[0];
  let bestDist = Infinity;
  for (const zone of ALL_ZONES) {
    const d = ZONE_ANCHORS[zone].distanceToSquared(worldPoint);
    if (d < bestDist) {
      bestDist = d;
      bestZone = zone;
    }
  }
  return bestZone;
}

/* -------------------------------------------------------------------------
 * Public prop types
 * --------------------------------------------------------------------- */

export type PlacedMarker = {
  fragranceId: string;
  zone: BodyZone;
  label: string; // perfume initials
  position?: [number, number, number];
  /** When true, this marker is rendered greyed-out — used in placement mode
   *  to signal "this zone is already taken; tapping = layering". */
  dimmed?: boolean;
};

type Props = {
  /** Placements to render as solid markers on the body. */
  filledMarkers?: PlacedMarker[];
  /** Zone currently being edited (e.g. just-placed) — pulses. */
  highlightedZone?: BodyZone | null;
  /** Called when user clicks a point on the body mesh. */
  onBodyClick?: (zone: BodyZone, position: [number, number, number]) => void;
  /** When true, taps draw a preview marker (placement in progress).
   *  When false, taps only zoom the camera. Defaults to false. */
  placementMode?: boolean;
  readOnly?: boolean;
  className?: string;
};

/* -------------------------------------------------------------------------
 * Mannequin — load + normalize + apply clay material
 * --------------------------------------------------------------------- */

function Mannequin({
  onBodyClick,
  readOnly,
  isDark,
}: {
  onBodyClick?: (zone: BodyZone, position: [number, number, number]) => void;
  readOnly: boolean;
  isDark: boolean;
}) {
  const { scene } = useGLTF(MODEL_URL);

  const clayMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isDark ? "#3a3632" : "#d8d5d0",
        roughness: 0.82,
        metalness: 0.02,
      }),
    [isDark],
  );

  useEffect(() => () => { clayMaterial.dispose(); }, [clayMaterial]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = clayMaterial;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
  }, [scene, clayMaterial]);

  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    return {
      scale,
      position: [
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [scene]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (readOnly || !onBodyClick) return;
    e.stopPropagation();
    const p = e.point;
    const zone = closestZone(p);
    onBodyClick(zone, [p.x, p.y, p.z]);
  }

  function setCursor(c: string) {
    if (typeof document !== "undefined") document.body.style.cursor = c;
  }

  return (
    <group position={transform.position} scale={transform.scale}>
      <primitive
        object={scene}
        onClick={handleClick}
        onPointerOver={() => setCursor(readOnly ? "default" : "crosshair")}
        onPointerOut={() => setCursor("default")}
      />
    </group>
  );
}

useGLTF.preload(MODEL_URL);

/* -------------------------------------------------------------------------
 * Marker — drawn at a precise 3D point on the body
 * --------------------------------------------------------------------- */

function Marker({
  position,
  label,
  highlighted,
  isDark,
  dimmed = false,
}: {
  position: [number, number, number];
  label: string;
  highlighted: boolean;
  isDark: boolean;
  dimmed?: boolean;
}) {
  // Dimmed markers use a lighter grey to signal "zone already occupied —
  // tapping means layering". Crisp markers remain black/white for fresh poses.
  const color = dimmed
    ? isDark
      ? "#6b6764"
      : "#a8a39d"
    : isDark
      ? "#f0ede8"
      : "#000";
  const haloRef = useRef<THREE.Mesh>(null);
  const spotRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!highlighted || !haloRef.current || !spotRef.current) return;
    const t = state.clock.elapsedTime;
    const wave = (Math.sin(t * 1.6) + 1) / 2;
    haloRef.current.scale.setScalar(1 + wave * 0.55);
    (haloRef.current.material as THREE.MeshBasicMaterial).opacity =
      0.45 - wave * 0.32;
    spotRef.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.08);
    state.invalidate(); // keep demand-mode canvas alive while animating
  });

  return (
    <group position={position}>
      <mesh ref={haloRef} renderOrder={2}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.4 : 0.22}
          depthTest={false}
        />
      </mesh>
      <mesh ref={spotRef} renderOrder={3}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.7 : 1} depthTest={false} />
      </mesh>
      {label && highlighted && (
        <Html
          position={[0.05, 0.04, 0]}
          center={false}
          distanceFactor={0.9}
          zIndexRange={[50, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-on-background bg-background/95 px-2 py-0.5 border border-outline-variant whitespace-nowrap">
            {label}
          </span>
        </Html>
      )}
    </group>
  );
}

/** "Drawn" preview marker shown while the user is about to commit a placement. */
function PreviewMarker({
  position,
  isDark,
}: {
  position: [number, number, number];
  isDark: boolean;
}) {
  const color = isDark ? "#f0ede8" : "#000";
  const haloRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const wave = (Math.sin(t * 1.8) + 1) / 2;
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1 + wave * 0.55);
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.36 - wave * 0.28;
    }
    if (ring1Ref.current) {
      const growth = (t * 0.55) % 2;
      ring1Ref.current.scale.setScalar(1 + growth * 1.2);
      (ring1Ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.55 - growth * 0.3,
      );
    }
    if (ring2Ref.current) {
      const growth = ((t + 1.0) * 0.55) % 2;
      ring2Ref.current.scale.setScalar(1 + growth * 1.2);
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.45 - growth * 0.25,
      );
    }
    state.invalidate(); // keep demand-mode canvas alive while animating
  });

  return (
    <group position={position}>
      <mesh ref={haloRef} renderOrder={2}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          depthTest={false}
        />
      </mesh>
      <mesh renderOrder={3}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <torusGeometry args={[0.03, 0.002, 4, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          depthTest={false}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <torusGeometry args={[0.03, 0.0015, 4, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------
 * Camera controller — drei CameraControls for orbit + animated focus
 * --------------------------------------------------------------------- */

// Camera framed to show full mannequin (head to feet) on all screen sizes.
// FOV 36° vertical + lookAt at mannequin mid-height (0.925m = 1.85m / 2).
const OVERVIEW = {
  pos: [0, 0.925, 3.4] as const,
  look: [0, 0.925, 0] as const,
};

/**
 * Directional key light with shadows that auto-update DISABLED.
 *
 * The mannequin is static (only the camera moves) so the shadow map only
 * needs to be rendered ONCE after the model loads. We force a single update
 * 400ms after mount, then the shadow stays cached forever — no per-frame
 * shadow render. This is the single biggest perf win on this scene.
 */
function StaticShadowKey() {
  const ref = useRef<THREE.DirectionalLight>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.shadow.autoUpdate = false;
    const id = setTimeout(() => {
      if (ref.current) {
        ref.current.shadow.needsUpdate = true;
        invalidate(); // force one render to apply the shadow bake
      }
    }, 400);
    return () => clearTimeout(id);
  }, [invalidate]);

  return (
    <directionalLight
      ref={ref}
      position={[2.4, 3.2, 2.8]}
      intensity={1.2}
      color="#fff2dc"
      castShadow
      // 1024² instead of 2048² → 4× less work for the one-shot bake, and the
      // resulting cached shadow is plenty sharp at this scene scale.
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      // Tight ortho frustum: only covers the mannequin volume — every wasted
      // pixel of shadow camera = wasted shadow render.
      shadow-camera-near={1}
      shadow-camera-far={6}
      shadow-camera-left={-1.2}
      shadow-camera-right={1.2}
      shadow-camera-top={2.5}
      shadow-camera-bottom={-0.2}
      shadow-bias={-0.0005}
    />
  );
}

/** Invisible ground plane that catches the directional light's shadow. */
function ShadowFloor() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      receiveShadow
    >
      <planeGeometry args={[3, 3]} />
      <shadowMaterial transparent opacity={0.32} />
    </mesh>
  );
}

function CameraController({
  focusPoint,
  controlsRef,
}: {
  focusPoint: [number, number, number] | null;
  controlsRef: React.RefObject<ComponentRef<typeof CameraControls> | null>;
}) {
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    if (focusPoint) {
      const [x, y, z] = focusPoint;
      // Top-down 3/4 view: camera ABOVE the click point and slightly in front.
      // This is the angle a perfumer/illustrator would use when applying — you
      // see the surface flat, perfect for "drawing" the placement spot.
      c.setLookAt(
        x,         // same X (no lateral offset → straight from above)
        y + 0.45,  // 45cm above the click point
        z + 0.45,  // 45cm in front (so we look down + slightly back)
        x,
        y,
        z,
        true, // animated (uses smoothTime for the dolly)
      );
    } else {
      c.setLookAt(
        OVERVIEW.pos[0],
        OVERVIEW.pos[1],
        OVERVIEW.pos[2],
        OVERVIEW.look[0],
        OVERVIEW.look[1],
        OVERVIEW.look[2],
        true,
      );
    }
  }, [focusPoint, controlsRef]);

  return null;
}

/* -------------------------------------------------------------------------
 * Top-level
 * --------------------------------------------------------------------- */

export function BodySilhouette3D({
  filledMarkers = [],
  highlightedZone,
  onBodyClick,
  placementMode = false,
  readOnly = false,
  className,
}: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [focusPoint, setFocusPoint] = useState<[number, number, number] | null>(
    null,
  );
  /** Preview marker shown at the just-clicked point (before commit). */
  const [previewPoint, setPreviewPoint] = useState<
    [number, number, number] | null
  >(null);
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);

  // Clear the preview when the caller confirms a placement (highlightedZone
  // changes to one of the markers' zones) OR when it disappears.
  useEffect(() => {
    if (!highlightedZone) {
      setPreviewPoint(null);
      return;
    }
    // If a marker now exists at the highlighted zone, stop showing the preview.
    const markerAtZone = filledMarkers.find((m) => m.zone === highlightedZone);
    if (markerAtZone) {
      setPreviewPoint(null);
      if (markerAtZone.position) setFocusPoint(markerAtZone.position);
    }
  }, [highlightedZone, filledMarkers]);

  function handleBodyClick(
    zone: BodyZone,
    position: [number, number, number],
  ) {
    if (readOnly) return;
    // Camera zoom always — useful even when just inspecting.
    setFocusPoint(position);
    // Preview marker only when the parent says we're placing. Otherwise the
    // user is just looking around and shouldn't see a stray dot appear.
    if (placementMode) {
      setPreviewPoint(position);
    } else {
      setPreviewPoint(null);
    }
    onBodyClick?.(zone, position);
  }

  function resetView() {
    setFocusPoint(null);
    setPreviewPoint(null);
  }

  const filledCount = filledMarkers.length;

  return (
    <div
      className={clsx(
        "relative w-full max-w-[380px] mx-auto",
        readOnly && "pointer-events-none",
        className,
      )}
      style={{ aspectRatio: "3 / 4", touchAction: "none" }}
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [...OVERVIEW.pos], fov: 36 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onPointerMissed={() => !readOnly && resetView()}
      >
        <color attach="background" args={[isDark ? "#0f0f0e" : "#ece8e2"]} />

        <ambientLight intensity={isDark ? 0.35 : 0.55} />
        <StaticShadowKey />
        <directionalLight
          position={[0, 2.5, -2.5]}
          intensity={isDark ? 0.4 : 0.6}
          color="#ffffff"
        />

        <Suspense fallback={null}>
          <Mannequin onBodyClick={handleBodyClick} readOnly={readOnly} isDark={isDark} />
        </Suspense>

        <ShadowFloor />

        {filledMarkers.map((m, i) => {
          const pos: [number, number, number] = m.position ?? [
            ZONE_ANCHORS[m.zone].x,
            ZONE_ANCHORS[m.zone].y,
            ZONE_ANCHORS[m.zone].z,
          ];
          const isHighlighted = highlightedZone === m.zone;
          return (
            <Marker
              key={`${m.fragranceId}-${m.zone}-${i}`}
              position={pos}
              label={m.label}
              highlighted={isHighlighted}
              isDark={isDark}
              dimmed={m.dimmed ?? false}
            />
          );
        })}

        {previewPoint && <PreviewMarker position={previewPoint} isDark={isDark} />}

        {/* ContactShadows removed — adds a per-frame FBO render pass.
            The directional shadow on the floor handles ground anchoring. */}

        <CameraControls
          ref={controlsRef}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2 + 0.15}
          polarRotateSpeed={0.6}
          azimuthRotateSpeed={0.9}
          dollySpeed={0}
          truckSpeed={0}
          minDistance={0.3}
          maxDistance={5}
          smoothTime={0.25}
          draggingSmoothTime={0.04}
          enabled={!readOnly}
        />
        <CameraController
          focusPoint={focusPoint}
          controlsRef={controlsRef}
        />
      </Canvas>

      {focusPoint && !readOnly && (
        <button
          type="button"
          onClick={resetView}
          aria-label="Vue d'ensemble"
          className="absolute top-2 right-2 px-3 py-1.5 bg-background/95 backdrop-blur border border-outline-variant text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 active:scale-95 transition-transform z-10"
        >
          <Icon name="zoom_out" size={12} />
          Vue d&apos;ensemble
        </button>
      )}

      {filledCount > 0 && (
        <div className="absolute bottom-2 left-2 px-3 py-1.5 bg-background/95 backdrop-blur border border-outline-variant text-[10px] uppercase tracking-widest font-mono z-10">
          {filledCount} pose{filledCount > 1 ? "s" : ""}
        </div>
      )}

      {!readOnly && (
        <div className="absolute bottom-2 right-2 px-3 py-1.5 bg-background/95 backdrop-blur border border-outline-variant text-[9px] uppercase tracking-widest font-mono text-outline z-10 flex items-center gap-1.5">
          <Icon name="360" size={11} />
          Glisse pour tourner
        </div>
      )}

      {!readOnly && filledCount === 0 && !previewPoint && (
        <div className="absolute top-2 left-2 px-3 py-1.5 bg-background/95 backdrop-blur border border-outline-variant text-[10px] uppercase tracking-widest font-bold z-10 max-w-[calc(100%-4rem)]">
          Touche n&apos;importe où sur le corps
        </div>
      )}
    </div>
  );
}
