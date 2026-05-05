"use client";

type ErrorPanelProps = {
  title: string;
  message: string;
  retryable: boolean;
  onRetry?: () => void;
};

export function ErrorPanel({ title, message, retryable, onRetry }: ErrorPanelProps) {
  return (
    <div
      data-testid={retryable ? "error-retryable" : "error-non-retryable"}
      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-8 text-center"
    >
      <h2 className="text-lg font-semibold text-red-900">{title}</h2>
      <p className="mt-2 text-sm text-red-700">{message}</p>
      {retryable && onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
