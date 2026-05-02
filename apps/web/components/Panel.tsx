import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  icon: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Panel({
  title,
  icon,
  eyebrow,
  action,
  className = "",
  children
}: PanelProps) {
  return (
    <section
      className={`rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)] ${className}`}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 text-[var(--navy)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel-muted)] text-[var(--blue)]">
            {icon}
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                {eyebrow}
              </div>
            ) : null}
            <h2 className="m-0 truncate text-sm font-black uppercase tracking-[0.08em]">
              {title}
            </h2>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
