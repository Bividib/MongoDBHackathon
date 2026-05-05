"use client";

import { useState } from "react";
import type { EvidenceRefView } from "@/fixtures/types";

const KIND_LABELS: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  bank_transaction: "Bank Transaction",
  communication_message: "Message",
  promise_to_pay: "Promise",
  customer_stat: "Customer Stat",
  obligation: "Obligation",
  policy: "Policy",
  forecast: "Forecast",
  source_object: "Source Object",
  collection_action: "Action",
  approval: "Approval",
  customer: "Customer",
};

type Props = {
  evidenceRefs: EvidenceRefView[];
  trigger?: React.ReactNode;
};

export function EvidenceDrawer({ evidenceRefs, trigger }: Props) {
  const [open, setOpen] = useState(false);

  const grouped = groupByKind(evidenceRefs);

  return (
    <>
      <button
        data-testid="evidence-trigger"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        {trigger ?? `Evidence (${evidenceRefs.length})`}
      </button>
      {open && (
        <div
          data-testid="evidence-drawer"
          className="fixed inset-y-0 right-0 z-50 w-96 overflow-y-auto border-l bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Evidence</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg"
            >
              x
            </button>
          </div>
          <div className="p-4 space-y-4">
            {Object.entries(grouped).map(([kind, refs]) => (
              <div key={kind}>
                <h4 className="text-xs font-medium uppercase text-gray-500 mb-1">
                  {KIND_LABELS[kind] ?? kind}
                </h4>
                <ul className="space-y-1">
                  {refs.map((ref) => (
                    <li
                      key={ref.id}
                      className="rounded border px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-gray-400">
                        {ref.id}
                      </span>
                      {ref.summary && (
                        <p className="text-gray-700">{ref.summary}</p>
                      )}
                      {ref.sourceProvider && (
                        <span className="text-xs text-gray-400 ml-2">
                          via {ref.sourceProvider}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {evidenceRefs.length === 0 && (
              <p className="text-sm text-gray-500">No evidence available.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function groupByKind(refs: EvidenceRefView[]): Record<string, EvidenceRefView[]> {
  const map: Record<string, EvidenceRefView[]> = {};
  for (const ref of refs) {
    const list = map[ref.kind] ?? [];
    list.push(ref);
    map[ref.kind] = list;
  }
  return map;
}
