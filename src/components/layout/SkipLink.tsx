export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="bg-surface text-surface-foreground focus-visible:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus-visible:ring-2"
    >
      Skip to content
    </a>
  );
}
