import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  icon?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: "default" | "muted" | "raised";
  children: ReactNode;
};

const variantClass = {
  default:
    "bg-[var(--surface)] border border-[var(--line)] shadow-[var(--shadow-soft)]",
  muted:
    "bg-[var(--surface-muted)] border border-[var(--line)]",
  raised:
    "bg-[var(--surface)] border border-[var(--line-strong)] shadow-[var(--shadow)]"
} as const;

export function Panel({
  title,
  icon,
  eyebrow,
  action,
  className = "",
  bodyClassName = "",
  variant = "default",
  children
}: PanelProps) {
  const hasHeader = Boolean(title || icon || eyebrow || action);

  return (
    <section
      className={`rounded-[var(--radius-lg)] ${variantClass[variant]} ${className}`}
    >
      {hasHeader ? (
        <div className="flex min-h-10 items-center justify-between gap-3 px-4 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--amber-tint)] text-[var(--amber)]">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                  {eyebrow}
                </div>
              ) : null}
              {title ? (
                <h2 className="m-0 truncate text-[0.92rem] font-semibold tracking-tight text-[var(--text)]">
                  {title}
                </h2>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={`px-4 pb-4 ${hasHeader ? "pt-3" : "pt-4"} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
