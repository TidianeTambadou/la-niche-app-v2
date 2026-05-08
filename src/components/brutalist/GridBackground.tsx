/**
 * Grille de points + dégradé radial central. Toujours en `position: fixed`,
 * derrière le contenu (`z-0`). Utilisée sur les pages hero / landing pour
 * apporter la signature "précision technique" du design system.
 */
export function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
          color: "var(--on-background)",
          opacity: 0.06,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, var(--background) 100%)",
        }}
      />
    </div>
  );
}
