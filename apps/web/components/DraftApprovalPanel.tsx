import { MailCheck, Paperclip, UserCheck } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { draftRows } from "./cockpit-data";

export function DraftApprovalPanel() {
  return (
    <Panel
      eyebrow="Human-in-the-loop"
      icon={<MailCheck size={18} aria-hidden />}
      title="Drafts / Approvals"
    >
      <div className="grid gap-3">
        {draftRows.map((draft) => (
          <article
            key={draft.title}
            className="rounded-md border border-[var(--line)] bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 text-sm font-black leading-5 text-[var(--navy)]">
                  {draft.title}
                </h3>
                <p className="m-0 mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--blue)]">
                  {draft.subtitle}
                </p>
              </div>
              <StatusPill status={draft.status} />
            </div>
            <p className="m-0 mt-3 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3 text-sm font-semibold leading-6 text-[var(--text)]">
              {draft.body}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--muted)]">
              <span className="inline-flex items-center gap-1">
                <Paperclip size={13} aria-hidden />
                {draft.evidence}
              </span>
              <span className="inline-flex items-center gap-1 text-[var(--amber)]">
                <UserCheck size={13} aria-hidden />
                Human approval required
              </span>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
