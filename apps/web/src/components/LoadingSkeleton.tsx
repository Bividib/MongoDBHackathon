"use client";

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div data-testid="loading-skeleton" className="animate-pulse space-y-4 p-6">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex space-x-4">
          <div className="h-4 w-1/4 rounded bg-gray-200" />
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="h-4 w-1/6 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
