export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8"
    >
      {children}
    </main>
  );
}
