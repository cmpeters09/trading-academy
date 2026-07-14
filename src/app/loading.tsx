export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-md" />
      <div className="bg-muted h-4 w-2/3 max-w-sm animate-pulse rounded-md" />
    </div>
  );
}
