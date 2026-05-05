"use client";

type EmptyStateProps = {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function EmptyState({ title, subtitle, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-4xl text-gray-300">---</div>
      <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
