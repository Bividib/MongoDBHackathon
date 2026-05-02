import { FileSearch, ListChecks } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import {
  phaseSummary,
  retrievalEvidence,
  type DemoPhase
} from "./cockpit-data";

const auditQuestionsByPhase: Record<
  DemoPhase,
  Array<{
    question: string;
    answer: string;
  }>
> = {
  baseline: [
    {
      question: "What changed?",
      answer:
        "RunwayOps opened a Payroll Risk Case after the scheduled scan found payroll at risk."
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
        "The Northstar confirmation email, Blue Finch formal reminder, and Supplier X hold remain pending human approval."
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
      question: "Why did risk move HIGH -> WATCH?",
      answer:
        "The worst visible shortfall moved from £2,800 to £1,600 when Supplier X is held, and the Northstar-pay scenario now leaves £800 after Supplier X."
    },
    {
      question: "Why is it not SAFE?",
      answer:
        "Northstar still depends on PO re-approval. The system preserves the slip scenario instead of counting conditional language as guaranteed cash."
    },
    {
      question: "Why did Supplier X change?",
      answer:
        "The extra £1,200 makes a conditional hold viable, but release still waits for Friday morning cash confirmation."
    },
    {
      question: "Which evidence was used?",
      answer:
        "INV-1042, the Northstar email thread, payment history, prior PO-dependent memory, Supplier X grace terms, and the Harbour Labs bank transaction."
    },
    {
      question: "What needs approval?",
      answer:
        "The Northstar confirmation email, Blue Finch formal reminder, and Supplier X conditional hold remain pending human approval."
    }
  ]
};

export function AuditWhyPanel({ phase }: { phase: DemoPhase }) {
  const summary = phaseSummary[phase];
  const auditQuestions = auditQuestionsByPhase[phase];

  return (
    <Panel
      action={<StatusPill status={summary.riskStatus} />}
      eyebrow="Decision trace"
      icon={<FileSearch size={18} aria-hidden />}
      title="Audit / Why Panel"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {auditQuestions.map((item) => (
          <article
            key={item.question}
            className="rounded-md border border-[var(--line)] bg-white p-3"
          >
            <h3 className="m-0 text-sm font-black text-[var(--navy)]">{item.question}</h3>
            <p className="m-0 mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">
              {item.answer}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
          <ListChecks size={16} aria-hidden />
          Evidence Used
        </div>
        <div className="flex flex-wrap gap-2">
          {retrievalEvidence.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--text)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
