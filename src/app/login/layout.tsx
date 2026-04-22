/**
 * Route group layout override: strip the app shell (top header + bottom tab bar)
 * from the login page. The root layout still wraps us with ThemeProvider + Store,
 * but we want a focused, nav-free surface here.
 */
export default function LoginLayout({
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
