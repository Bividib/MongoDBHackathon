import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { JsonValue } from "@runwayops/domain";

import type {
  AccountingProvider,
  ListOptions,
  ProviderConnection,
  RawContact,
  RawInvoice,
  RawPayment,
} from "../provider.js";
import {
  applyListOptions,
  projectContact,
  projectInvoice,
  projectPayment,
} from "./xero-projection.js";

/**
 * Resolve the bundled fixture root once at module load. Tests can override
 * via `metadata.fixtureRoot` on the `ProviderConnection` so a per-test
 * directory can stage different scenarios without mutating the package.
 */
const PACKAGE_FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/xero",
);

function resolveFixtureRoot(connection: ProviderConnection): string {
  const override = connection.metadata?.fixtureRoot;
  if (typeof override === "string" && override.length > 0) return override;
  return PACKAGE_FIXTURE_ROOT;
}

/**
 * Read a fixture file as JSON. The simulated adapter is read-only, so a
 * missing fixture is treated as a hard failure (not "no records") — the
 * caller should know which lists are populated.
 */
async function readFixture(
  fixtureRoot: string,
  name: "contacts" | "invoices" | "payments",
): Promise<JsonValue[]> {
  const filePath = path.join(fixtureRoot, `${name}.json`);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `xero-simulated: fixture ${name}.json must be a JSON array, got ${typeof parsed}`,
    );
  }
  return parsed as JsonValue[];
}

/**
 * File-backed Xero adapter. No HTTP, no OAuth — fixtures live on disk and
 * the adapter reads them on each call. Real-Xero adapter parity:
 *   * Contacts → invoices (Contact.ContactID FK) → payments (Invoice.InvoiceID FK)
 *   * `UpdatedDateUTC` powers `modifiedSince` filtering.
 *   * Currency code from the row drives minor-unit conversion.
 *
 * Hard invariant: the adapter only reads. There is no mutation API on this
 * class, deliberately, so a Round-4 caller can never accidentally write to
 * a "provider" that has no remote.
 */
export class XeroSimulatedAdapter implements AccountingProvider {
  readonly providerKey = "xero" as const;

  async listContacts(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawContact[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "contacts");
    const projected = rows.map((row, idx) => projectContact(row, idx));
    return applyListOptions(projected, opts);
  }

  async listInvoices(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawInvoice[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "invoices");
    const projected = rows.map((row, idx) => projectInvoice(row, idx));
    return applyListOptions(projected, opts);
  }

  async listPayments(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawPayment[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "payments");
    const projected = rows.map((row, idx) => projectPayment(row, idx));
    return applyListOptions(projected, opts);
  }

  private assertProvider(connection: ProviderConnection): void {
    if (connection.providerKey !== "xero") {
      throw new Error(
        `XeroSimulatedAdapter: connection.providerKey must be "xero", got ${connection.providerKey}`,
      );
    }
  }
}
