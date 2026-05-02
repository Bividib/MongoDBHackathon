"use client";

import { Mail, Phone, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Panel } from "./Panel";
import { draftRows, type OutreachChannel } from "./cockpit-data";

type DraftDecision = "pending" | "approved-email" | "approved-voice" | "edit" | "rejected";

const channelLabel: Record<OutreachChannel, string> = {
  email: "Email",
  phone: "Phone",
  both: "Email + Phone"
};

const channelIcon: Record<OutreachChannel, ReactNode> = {
  email: <Mail size={12} aria-hidden />,
  phone: <Phone size={12} aria-hidden />,
  both: (
    <span className="flex items-center gap-0.5">
      <Mail size={12} aria-hidden />
      <Phone size={12} aria-hidden />
    </span>
  )
};

export function DraftApprovalPanel() {
  const [decisions, setDecisions] = useState<Record<string, DraftDecision>>({});

  function setDecision(title: string, decision: DraftDecision) {
    setDecisions((current) => ({ ...current, [title]: decision }));
  }

  return (
    <Panel
      icon={<ShieldCheck size={16} aria-hidden />}
      title="Approvals"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          3 actions ready for you
        </span>
      }
      variant="default"
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {draftRows.map((draft, index) => {
          const decision = decisions[draft.title] ?? "pending";
          const isApprovedEmail = decision === "approved-email";
          const isApprovedVoice = decision === "approved-voice";
          const isRejected = decision === "rejected";
          const recommendsEmail = draft.channel === "email" || draft.channel === "both";
          const recommendsPhone = draft.channel === "phone" || draft.channel === "both";

          return (
            <article
              key={draft.title}
              className={`flex h-full flex-col gap-3 rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-4 transition ${
                isApprovedEmail || isApprovedVoice
                  ? "border-[rgba(52,211,153,0.45)]"
                  : isRejected
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

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(245,166,35,0.45)] bg-[var(--amber-tint)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--amber-soft)]">
                  {channelIcon[draft.channel]}
                  Recommended · {channelLabel[draft.channel]}
                </span>
              </div>

              <p className="m-0 text-xs font-normal italic leading-5 text-[var(--text-muted)]">
                {draft.whyChannel}
              </p>

              {recommendsEmail ? (
                <ChannelPreview
                  icon={<Mail size={12} aria-hidden />}
                  label="Email draft"
                  text={draft.body}
                />
              ) : null}

              {recommendsPhone ? (
                <ChannelPreview
                  icon={<Phone size={12} aria-hidden />}
                  label="Voice call script"
                  text={draft.voiceScript}
                />
              ) : null}

              <p className="m-0 mt-auto text-[0.7rem] font-normal text-[var(--text-faint)]">
                {draft.evidence}
              </p>

              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    active={isApprovedEmail}
                    disabled={!recommendsEmail && !isApprovedEmail}
                    icon={<Mail size={13} aria-hidden />}
                    label="Approve Email"
                    onClick={() => setDecision(draft.title, "approved-email")}
                    tone="success"
                  />
                  <ActionButton
                    active={isApprovedVoice}
                    disabled={!recommendsPhone && !isApprovedVoice}
                    icon={<Phone size={13} aria-hidden />}
                    label="Approve Voice Call"
                    onClick={() => setDecision(draft.title, "approved-voice")}
                    tone="success"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    active={decision === "edit"}
                    label="Edit"
                    onClick={() => setDecision(draft.title, "edit")}
                    tone="neutral"
                  />
                  <ActionButton
                    active={isRejected}
                    label="Reject"
                    onClick={() => setDecision(draft.title, "rejected")}
                    tone="danger"
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function ChannelPreview({
  icon,
  label,
  text
}: {
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        {icon}
        {label}
      </div>
      <p className="m-0 text-[0.82rem] font-normal leading-5 text-[var(--text-muted)]">
        {text}
      </p>
    </div>
  );
}

function ActionButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
  tone
}: {
  active: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  tone: "success" | "neutral" | "danger";
}) {
  const baseClass =
    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const toneClass: Record<typeof tone, string> = {
    success: active
      ? "border-[var(--green)] bg-[rgba(52,211,153,0.18)] text-[var(--green)]"
      : "border-[rgba(52,211,153,0.45)] bg-transparent text-[var(--green)] hover:bg-[rgba(52,211,153,0.10)]",
    neutral: active
      ? "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]"
      : "border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
    danger: active
      ? "border-[var(--red)] bg-[rgba(239,106,74,0.18)] text-[var(--red)]"
      : "border-[rgba(239,106,74,0.45)] bg-transparent text-[var(--red)] hover:bg-[rgba(239,106,74,0.10)]"
  };

  return (
    <button
      aria-pressed={active}
      className={`${baseClass} ${toneClass[tone]}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
