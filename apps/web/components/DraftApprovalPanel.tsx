"use client";

import { Check, ChevronDown, Mail, Pencil, Phone, ShieldCheck, X } from "lucide-react";
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

function channelIconNode(channel: OutreachChannel, size = 11): ReactNode {
  if (channel === "email") return <Mail size={size} aria-hidden />;
  if (channel === "phone") return <Phone size={size} aria-hidden />;
  return (
    <span className="flex items-center gap-0.5">
      <Mail size={size} aria-hidden />
      <Phone size={size} aria-hidden />
    </span>
  );
}

export function DraftApprovalPanel() {
  const [decisions, setDecisions] = useState<Record<string, DraftDecision>>({});
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  function setDecision(title: string, decision: DraftDecision) {
    setDecisions((current) => {
      if (current[title] === decision) {
        const { [title]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [title]: decision };
    });
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
          const isEdit = decision === "edit";
          const isRejected = decision === "rejected";
          const isApproved = isApprovedEmail || isApprovedVoice;
          const recommendsEmail = draft.channel === "email" || draft.channel === "both";
          const recommendsPhone = draft.channel === "phone" || draft.channel === "both";
          const isOpen = openDraft === draft.title;

          return (
            <article
              key={draft.title}
              className={`flex h-full flex-col gap-2.5 rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-3 transition ${
                isApproved
                  ? "border-[var(--green)]/60 shadow-[0_0_24px_rgba(52,211,153,0.15)]"
                  : isRejected
                    ? "border-[rgba(239,106,74,0.55)] opacity-70"
                    : isEdit
                      ? "border-[var(--line-strong)]"
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
                <ChannelTag channel={draft.channel} decision={decision} />
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
                    label="Approve Email"
                    icon={<Mail size={12} aria-hidden />}
                    onClick={() => setDecision(draft.title, "approved-email")}
                  />
                  <SecondaryApprove
                    active={isApprovedVoice}
                    disabled={!recommendsPhone && !isApprovedVoice}
                    label="Approve Voice"
                    icon={<Phone size={12} aria-hidden />}
                    onClick={() => setDecision(draft.title, "approved-voice")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <EditPill
                    active={isEdit}
                    onClick={() => setDecision(draft.title, "edit")}
                  />
                  <RejectPill
                    active={isRejected}
                    onClick={() => setDecision(draft.title, "rejected")}
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

function ChannelTag({
  channel,
  decision
}: {
  channel: OutreachChannel;
  decision: DraftDecision;
}) {
  if (decision === "approved-email") {
    return (
      <Tag tone="success" icon={<Check size={11} aria-hidden />}>
        Email approved
      </Tag>
    );
  }

  if (decision === "approved-voice") {
    return (
      <Tag tone="success" icon={<Check size={11} aria-hidden />}>
        Voice approved
      </Tag>
    );
  }

  if (decision === "rejected") {
    return (
      <Tag tone="danger" icon={<X size={11} aria-hidden />}>
        Rejected
      </Tag>
    );
  }

  if (decision === "edit") {
    return (
      <Tag tone="neutral" icon={<Pencil size={10} aria-hidden />}>
        Editing
      </Tag>
    );
  }

  return (
    <Tag
      tone="recommend"
      icon={channelIconNode(channel, 11)}
      ariaLabel={`Recommended channel: ${channelLabel[channel]}`}
    >
      Rec · {channelLabel[channel]}
    </Tag>
  );
}

function Tag({
  children,
  tone,
  icon,
  ariaLabel
}: {
  children: ReactNode;
  tone: "recommend" | "success" | "danger" | "neutral";
  icon?: ReactNode;
  ariaLabel?: string;
}) {
  const toneClass: Record<typeof tone, string> = {
    recommend:
      "bg-[var(--amber-tint)] text-[var(--amber-soft)] border border-[rgba(245,166,35,0.32)]",
    success:
      "bg-[rgba(52,211,153,0.18)] text-[var(--green)] border border-[var(--green)]/50",
    danger:
      "bg-[rgba(239,106,74,0.18)] text-[var(--red)] border border-[var(--red)]/50",
    neutral:
      "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--line-strong)]"
  };

  return (
    <span
      aria-label={ariaLabel}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${toneClass[tone]}`}
    >
      {icon}
      {children}
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
          ? "bg-[var(--green)] text-[#0a1f15] ring-2 ring-[var(--green)] ring-offset-2 ring-offset-[var(--surface-muted)] shadow-[0_0_22px_rgba(52,211,153,0.55)]"
          : "bg-[var(--amber)] text-[#1a1100] shadow-[var(--shadow-amber)] hover:bg-[var(--amber-soft)] active:scale-[0.98]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {active ? <Check size={13} aria-hidden /> : icon}
      {active ? "Email approved" : label}
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
          ? "border-[var(--green)] bg-[rgba(52,211,153,0.18)] text-[var(--green)] ring-1 ring-[var(--green)]/40"
          : "border-[rgba(245,166,35,0.55)] bg-transparent text-[var(--amber-soft)] hover:bg-[var(--amber-tint)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {active ? <Check size={13} aria-hidden /> : icon}
      {active ? "Voice approved" : label}
    </button>
  );
}

function EditPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-3 text-[0.7rem] font-semibold transition ${
        active
          ? "border-[var(--text-muted)] bg-[var(--surface-2)] text-[var(--text)]"
          : "border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <Pencil size={11} aria-hidden />
      {active ? "Editing" : "Edit"}
    </button>
  );
}

function RejectPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-3 text-[0.7rem] font-semibold transition ${
        active
          ? "border-[var(--red)] bg-[rgba(239,106,74,0.16)] text-[var(--red)]"
          : "border-[rgba(239,106,74,0.4)] bg-transparent text-[rgba(239,106,74,0.85)] hover:bg-[rgba(239,106,74,0.08)] hover:text-[var(--red)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <X size={11} aria-hidden />
      {active ? "Rejected" : "Reject"}
    </button>
  );
}
