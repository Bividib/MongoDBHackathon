"use client";

import { ChevronDown, Mail, Phone, ShieldCheck } from "lucide-react";
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
  email: <Mail size={11} aria-hidden />,
  phone: <Phone size={11} aria-hidden />,
  both: (
    <span className="flex items-center gap-0.5">
      <Mail size={11} aria-hidden />
      <Phone size={11} aria-hidden />
    </span>
  )
};

export function DraftApprovalPanel() {
  const [decisions, setDecisions] = useState<Record<string, DraftDecision>>({});
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  function setDecision(title: string, decision: DraftDecision) {
    setDecisions((current) => ({ ...current, [title]: decision }));
  }

  function toggleDraft(title: string) {
    setOpenDraft((current) => (current === title ? null : title));
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
      <div className="grid gap-2.5 lg:grid-cols-3">
        {draftRows.map((draft, index) => {
          const decision = decisions[draft.title] ?? "pending";
          const isApprovedEmail = decision === "approved-email";
          const isApprovedVoice = decision === "approved-voice";
          const isRejected = decision === "rejected";
          const recommendsEmail = draft.channel === "email" || draft.channel === "both";
          const recommendsPhone = draft.channel === "phone" || draft.channel === "both";
          const isOpen = openDraft === draft.title;

          return (
            <article
              key={draft.title}
              className={`flex h-full flex-col gap-2.5 rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-3 transition ${
                isApprovedEmail || isApprovedVoice
                  ? "border-[rgba(52,211,153,0.45)]"
                  : isRejected
                    ? "border-[rgba(239,106,74,0.45)] opacity-70"
                    : "border-[var(--line)] hover:border-[var(--line-strong)]"
              }`}
            >
              <header className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[rgba(245,166,35,0.4)] bg-[var(--amber-tint)] text-[0.68rem] font-semibold text-[var(--amber-soft)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-[0.88rem] font-semibold leading-5 tracking-tight text-[var(--text)]">
                    {draft.title}
                  </h3>
                  <p className="m-0 mt-0.5 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--text-faint)]">
                    {draft.subtitle}
                  </p>
                </div>
                <ChannelTag channel={draft.channel} />
              </header>

              <p className="m-0 text-[0.78rem] font-normal italic leading-5 text-[var(--text-muted)]">
                {draft.whyChannel}
              </p>

              <button
                aria-expanded={isOpen}
                aria-controls={`draft-preview-${index}`}
                className="inline-flex items-center gap-1 self-start text-[0.7rem] font-semibold text-[var(--amber)] transition hover:text-[var(--amber-soft)]"
                onClick={() => toggleDraft(draft.title)}
                type="button"
              >
                {isOpen ? "Hide preview" : "View draft"}
                <ChevronDown
                  aria-hidden
                  className={`transition ${isOpen ? "rotate-180" : ""}`}
                  size={11}
                />
              </button>

              {isOpen ? (
                <div id={`draft-preview-${index}`} className="grid gap-2">
                  {recommendsEmail ? (
                    <ChannelPreview
                      icon={<Mail size={10} aria-hidden />}
                      label="Email draft"
                      text={draft.body}
                    />
                  ) : null}
                  {recommendsPhone ? (
                    <ChannelPreview
                      icon={<Phone size={10} aria-hidden />}
                      label="Voice script"
                      text={draft.voiceScript}
                    />
                  ) : null}
                  <p className="m-0 text-[0.68rem] font-normal text-[var(--text-faint)]">
                    {draft.evidence}
                  </p>
                </div>
              ) : null}

              <div className="mt-auto grid gap-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <PrimaryApprove
                    active={isApprovedEmail}
                    disabled={!recommendsEmail && !isApprovedEmail}
                    icon={<Mail size={12} aria-hidden />}
                    label="Approve Email"
                    onClick={() => setDecision(draft.title, "approved-email")}
                  />
                  <SecondaryApprove
                    active={isApprovedVoice}
                    disabled={!recommendsPhone && !isApprovedVoice}
                    icon={<Phone size={12} aria-hidden />}
                    label="Approve Voice"
                    onClick={() => setDecision(draft.title, "approved-voice")}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 text-[0.7rem] font-semibold">
                  <button
                    aria-pressed={decision === "edit"}
                    className={`transition hover:text-[var(--text)] ${
                      decision === "edit"
                        ? "text-[var(--text)] underline"
                        : "text-[var(--text-faint)]"
                    }`}
                    onClick={() => setDecision(draft.title, "edit")}
                    type="button"
                  >
                    Edit
                  </button>
                  <span aria-hidden className="text-[var(--text-faint)]">·</span>
                  <button
                    aria-pressed={isRejected}
                    className={`transition hover:text-[var(--red)] ${
                      isRejected
                        ? "text-[var(--red)] underline"
                        : "text-[rgba(239,106,74,0.85)]"
                    }`}
                    onClick={() => setDecision(draft.title, "rejected")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function ChannelTag({ channel }: { channel: OutreachChannel }) {
  return (
    <span
      aria-label={`Recommended channel: ${channelLabel[channel]}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--amber-tint)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--amber-soft)]"
    >
      {channelIcon[channel]}
      {channelLabel[channel]}
    </span>
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
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="mb-1 flex items-center gap-1 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        {icon}
        {label}
      </div>
      <p className="m-0 text-[0.78rem] font-normal leading-5 text-[var(--text-muted)]">
        {text}
      </p>
    </div>
  );
}

function PrimaryApprove({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[0.72rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-[var(--green)] text-[#0a1f15] shadow-[0_0_18px_rgba(52,211,153,0.45)]"
          : "bg-[var(--amber)] text-[#1a1100] shadow-[var(--shadow-amber)] hover:bg-[var(--amber-soft)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {active ? "Approved" : label}
    </button>
  );
}

function SecondaryApprove({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[0.72rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-[var(--green)] bg-[rgba(52,211,153,0.16)] text-[var(--green)]"
          : "border-[rgba(245,166,35,0.55)] bg-transparent text-[var(--amber-soft)] hover:bg-[var(--amber-tint)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {active ? "Approved" : label}
    </button>
  );
}
