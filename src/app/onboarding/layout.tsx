/**
 * Strip the app shell (top header + bottom tab bar) from the onboarding wizard.
 * Same pattern as /login.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-background overflow-y-auto z-50">
      {children}
    </div>
  );
}
