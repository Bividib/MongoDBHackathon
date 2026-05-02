"use client";

import { UserCircle2 } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import { draftRows } from "./cockpit-data";

type DraftDecision = "pending" | "approved" | "edit" | "rejected";

export function DraftApprovalPanel() {
  const [decisions, setDecisions] = useState<Record<string, DraftDecision>>({});

  function setDecision(title: string, decision: DraftDecision) {
    setDecisions((current) => ({ ...current, [title]: decision }));
  }

  return (
    <Panel
      icon={<UserCircle2 size={16} aria-hidden />}
      title="Approvals drawer"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          3 actions for you
        </span>
      }
      variant="default"
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {draftRows.map((draft, index) => {
          const decision = decisions[draft.title] ?? "pending";

          return (
            <article
              key={draft.title}
              className={`flex h-full flex-col gap-3 rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-4 transition ${
                decision === "approved"
                  ? "border-[rgba(52,211,153,0.45)]"
                  : decision === "rejected"
                    ? "border-[rgba(239,106,74,0.45)] opacity-70"
                    : "border-[var(--line)] hover:border-[var(--line-strong)]"
              }`}
            >
              <header className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[rgba(245,166,35,0.4)] bg-[var(--amber-tint)] text-xs font-semibold text-[var(--amber-soft)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="m-0 text-[0.95rem] font-semibold leading-5 tracking-tight text-[var(--text)]">
                    {draft.title}
                  </h3>
                  <p className="m-0 mt-0.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-[var(--text-faint)]">
                    {draft.subtitle}
                  </p>
                </div>
              </header>

              <p className="m-0 text-sm font-normal leading-6 text-[var(--text-muted)]">
                {draft.body}
              </p>

              <p className="m-0 mt-auto text-xs font-normal italic leading-5 text-[var(--text-faint)]">
                {draft.evidence}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <DecisionButton
                  active={decision === "approved"}
                  label="Approve"
                  onClick={() => setDecision(draft.title, "approved")}
                  tone="success"
                />
                <DecisionButton
                  active={decision === "edit"}
                  label="Edit"
                  onClick={() => setDecision(draft.title, "edit")}
                  tone="neutral"
                />
                <DecisionButton
                  active={decision === "rejected"}
                  label="Reject"
                  onClick={() => setDecision(draft.title, "rejected")}
                  tone="danger"
                />
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function DecisionButton({
  active,
  label,
  onClick,
  tone
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: "success" | "neutral" | "danger";
}) {
  const baseClass = `inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold transition`;
  const toneClass: Record<typeof tone, string> = {
    success: active
      ? "border-[var(--green)] bg-[rgba(52,211,153,0.16)] text-[var(--green)]"
      : "border-[rgba(52,211,153,0.45)] bg-transparent text-[var(--green)] hover:bg-[rgba(52,211,153,0.10)]",
    neutral: active
      ? "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]"
      : "border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
    danger: active
      ? "border-[var(--red)] bg-[rgba(239,106,74,0.16)] text-[var(--red)]"
      : "border-[rgba(239,106,74,0.45)] bg-transparent text-[var(--red)] hover:bg-[rgba(239,106,74,0.10)]"
  };

  return (
    <button
      aria-pressed={active}
      className={`${baseClass} ${toneClass[tone]}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
