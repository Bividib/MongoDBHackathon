"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import {
  phaseSummary,
  retrievalEvidence,
  yourPlanByPhase,
  type DemoPhase
} from "./cockpit-data";

const auditQuestionsByPhase: Record<
  DemoPhase,
  Array<{ question: string; answer: string }>
> = {
  baseline: [
    {
      question: "What changed?",
      answer:
        "RunwayOps opened a Payroll Risk Case after the scheduled scan found Friday short by £5,200."
    },
    {
      question: "Why is risk HIGH?",
      answer:
        "If Supplier X is paid and invoices slip, Friday is short by £5,200. Holding Supplier X still leaves a £2,800 gap."
    },
    {
      question: "Why not count Northstar yet?",
      answer:
        "Northstar is the main dependency, but prior memory says PO-dependent promises need explicit confirmation."
    },
    {
      question: "What needs approval?",
      answer:
        "The Northstar reminder, Blue Finch reminder, and Supplier X delay request — all pending human approval."
    }
  ],
  reply: [
    {
      question: "What changed?",
      answer:
        "Northstar replied that they should be able to pay Friday once the PO is re-approved."
    },
    {
      question: "Why is risk still HIGH?",
      answer:
        "The reply is a conditional promise with confidence 0.48, so the system does not treat it as guaranteed cash."
    },
    {
      question: "Which evidence was used?",
      answer:
        "INV-1042, the Northstar email thread, payment history, prior PO-dependent memory, and Supplier X grace terms."
    },
    {
      question: "What needs approval?",
      answer:
        "Approve the explicit PO/payment confirmation email and keep Supplier X held inside written grace terms."
    }
  ],
  bank: [
    {
      question: "What changed?",
      answer:
        "Harbour Labs posted a £1,200 retainer, lifting cash from £8,400 to £9,600 before payroll."
    },
    {
      question: "Why did risk move HIGH → WATCH?",
      answer:
        "The worst visible shortfall moved from £2,800 to £1,600 with Supplier X held, and the Northstar-pay scenario now leaves £800 after Supplier X."
    },
    {
      question: "Why is it not SAFE?",
      answer:
        "Northstar still depends on PO re-approval. The slip scenario stays in play instead of being counted as guaranteed cash."
    },
    {
      question: "Why did Supplier X change?",
      answer:
        "The extra £1,200 makes a conditional hold viable, but release still waits for Friday morning cash confirmation."
    }
  ]
};

export function AuditWhyPanel({ phase }: { phase: DemoPhase }) {
  const summary = phaseSummary[phase];
  const plan = yourPlanByPhase[phase];
  const auditQuestions = auditQuestionsByPhase[phase];
  const [expanded, setExpanded] = useState(false);

  return (
    <Panel
      icon={<CheckCircle2 size={16} aria-hidden />}
      title={plan.title}
      variant="default"
    >
      <p className="m-0 text-[0.95rem] font-normal leading-7 text-[var(--text-muted)]">
        {plan.body}
      </p>

      <button
        aria-expanded={expanded}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--amber)] transition hover:text-[var(--amber-soft)]"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="border-b border-dashed border-[var(--amber)] pb-0.5">
          {plan.cta}
        </span>
        <ArrowRight
          aria-hidden
          className={`transition ${expanded ? "rotate-90" : ""}`}
          size={14}
        />
      </button>

      {expanded ? (
        <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5">
          {auditQuestions.map((item) => (
            <article key={item.question}>
              <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--text)]">
                {item.question}
              </h3>
              <p className="m-0 mt-1.5 text-sm font-normal leading-6 text-[var(--text-muted)]">
                {item.answer}
              </p>
            </article>
          ))}

          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Evidence used · {summary.forecastVersion}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {retrievalEvidence.map((evidence) => (
                <span
                  key={evidence}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--text-muted)]"
                >
                  {evidence}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
