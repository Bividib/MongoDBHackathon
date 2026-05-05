"use client";

import { useState } from "react";
import type { AuditEventView } from "@/fixtures/types";

const ACTOR_ICONS: Record<string, string> = {
  user: "U",
  system: "S",
  ai: "A",
  integration: "I",
  workflow: "W",
};

type Props = {
  events: AuditEventView[];
  trigger?: React.ReactNode;
};

export function AuditDrawer({ events, trigger }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-testid="audit-trigger"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 hover:text-gray-700 underline"
      >
        {trigger ?? "View history"}
      </button>
      {open && (
        <div
          data-testid="audit-drawer"
          className="fixed inset-y-0 right-0 z-50 w-96 overflow-y-auto border-l bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Audit Timeline</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg"
            >
              x
            </button>
          </div>
          <div className="p-4">
            {events.length === 0 && (
              <p
                data-testid="audit-empty"
                className="text-sm text-gray-500"
              >
                No audit events for this scope.
              </p>
            )}
            <ol className="relative border-l border-gray-200 ml-2 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="ml-4" data-testid="audit-event">
                  <div className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] font-bold">
                    {ACTOR_ICONS[event.actorType] ?? "?"}
                  </div>
                  <div className="rounded border px-3 py-2">
                    <p className="text-xs font-medium text-gray-900">
                      {event.action}
                    </p>
                    <p className="text-xs text-gray-600">{event.summary}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {event.occurredAt}
                    </p>
                    {event.before && event.after && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-blue-500 cursor-pointer">
                          Diff
                        </summary>
                        <pre className="text-[10px] bg-gray-50 p-1 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(
                            { before: event.before, after: event.after },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
