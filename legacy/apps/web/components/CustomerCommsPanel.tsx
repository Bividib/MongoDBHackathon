"use client";

import { ChevronDown, MailCheck } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import type { DemoPhase } from "./cockpit-data";

const NORTHSTAR_REPLY =
  "Should be able to pay Friday once the PO is re-approved.";

export function CustomerCommsPanel({ phase }: { phase: DemoPhase }) {
  const [expanded, setExpanded] = useState(false);
  const hasReply = phase !== "baseline";

  return (
    <Panel
      icon={<MailCheck size={16} aria-hidden />}
      title="Customer comms"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          {hasReply ? "Email received" : "Waiting"}
        </span>
      }
      variant="default"
    >
      <div className="grid gap-3">
        <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <div className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
            Northstar Studio
          </div>
          <p className="m-0 mt-2 text-[0.9rem] font-normal leading-6 text-[var(--text)]">
            {hasReply
              ? `"${NORTHSTAR_REPLY}"`
              : "No new customer reply yet. Step 1 inserts the Northstar email into MongoDB."}
          </p>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-[rgba(245,166,35,0.35)] bg-[var(--amber-tint)] p-3">
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--amber-soft)]">
            Impact
          </div>
          <p className="m-0 mt-2 text-[0.84rem] font-normal leading-6 text-[var(--text-muted)]">
            {hasReply
              ? "The agents classify this as conditional. It helps the case, but it does not count as confirmed cash."
              : "The first visible change will be forecast v2 with risk still HIGH."}
          </p>
        </div>

        <button
          aria-expanded={expanded}
          className="inline-flex min-h-10 items-center justify-between gap-3 rounded-full border border-[var(--line-strong)] bg-transparent px-4 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--amber)]/60 hover:text-[var(--text)]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span>{expanded ? "Hide logic" : "Show logic"}</span>
          <ChevronDown
            aria-hidden
            className={`transition ${expanded ? "rotate-180" : ""}`}
            size={14}
          />
        </button>

        {expanded ? <CommsLogic phase={phase} /> : null}
      </div>
    </Panel>
  );
}

function CommsLogic({ phase }: { phase: DemoPhase }) {
  const rows = [
    {
      label: "Event",
      value:
        phase === "baseline"
          ? "Waiting for email.received"
          : "email.received stored in event_inbox"
    },
    {
      label: "Classification",
      value:
        phase === "baseline"
          ? "Pending"
          : "conditional_payment_promise; treat_as_cash = false"
    },
    {
      label: "Evidence",
      value:
        phase === "baseline"
          ? "Atlas Vector Search will retrieve Northstar memory and INV-1042 evidence."
          : "Atlas Vector Search retrieved Northstar PO memory, INV-1042 evidence, and the email thread."
    },
    {
      label: "Forecast impact",
      value:
        phase === "bank"
          ? "The bank payment moves the case to v3 / WATCH, but Northstar remains conditional."
          : phase === "reply"
            ? "Forecast v2 is written; risk stays HIGH because cash is not confirmed."
            : "Baseline remains v1 / HIGH until the reply is inserted."
    },
    {
      label: "Human action",
      value:
        phase === "baseline"
          ? "Approve nothing yet; wait for the reply event."
          : "Approve the follow-up email or voice call before anything is sent."
    }
  ];

  return (
    <dl className="m-0 grid gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1">
          <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
            {row.label}
          </dt>
          <dd className="m-0 text-[0.82rem] font-normal leading-5 text-[var(--text-muted)]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
