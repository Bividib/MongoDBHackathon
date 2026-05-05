import { and, eq } from "drizzle-orm";

import type { CashEnginePolicy, Money } from "@runwayops/cash-engine";
import { money } from "@runwayops/domain";

import { companyPolicies } from "../schema/identity.js";
import type { DbHandle } from "./tenant.js";

const CASH_ENGINE_POLICY_KEY = "cash_engine";

type RawPolicyJson = Partial<{
  highConfidenceThreshold: unknown;
  mediumConfidenceThreshold: unknown;
  criticalObligationWindowDays: unknown;
  watchObligationWindowDays: unknown;
  immediateInterventionWindowDays: unknown;
  defaultInvoiceConfidence: unknown;
  staleInvoiceConfidence: unknown;
  materialShortfallAmountMinor: unknown;
  materialShortfallCurrency: unknown;
}>;

function pickNumber(value: unknown, range?: { min?: number; max?: number }): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (range?.min !== undefined && value < range.min) return undefined;
  if (range?.max !== undefined && value > range.max) return undefined;
  return value;
}

function pickMaterialShortfall(
  amountMinor: unknown,
  currency: unknown,
): Money | undefined {
  if (typeof amountMinor !== "string" && typeof amountMinor !== "number") return undefined;
  if (typeof currency !== "string" || currency.length !== 3) return undefined;
  return money(String(amountMinor), currency.toUpperCase());
}

/**
 * Fetch the cash-engine policy override for a company. Returns `undefined`
 * if no row exists — caller passes that through to `computeCashForecast`,
 * which falls back to `DEFAULT_CASH_ENGINE_POLICY`.
 *
 * The DB stores policies as key/value (`policy_key` + jsonb `policy_json`),
 * which is why we whitelist fields here rather than `JSON.parse`-ing blindly.
 * `materialShortfallAmount` is stored split — minor amount + currency — to
 * avoid round-trip bigint serialization on a single jsonb scalar.
 */
export async function getCashEnginePolicyForCompany(
  handle: DbHandle,
  input: { companyId: string },
): Promise<Partial<CashEnginePolicy> | undefined> {
  const rows = await handle
    .select({ policyJson: companyPolicies.policyJson })
    .from(companyPolicies)
    .where(
      and(
        eq(companyPolicies.companyId, input.companyId),
        eq(companyPolicies.policyKey, CASH_ENGINE_POLICY_KEY),
        eq(companyPolicies.status, "active"),
      ),
    )
    .limit(1);

  if (rows.length === 0) return undefined;
  const raw = (rows[0]!.policyJson ?? {}) as RawPolicyJson;

  const overrides: Partial<CashEnginePolicy> = {};
  const high = pickNumber(raw.highConfidenceThreshold, { min: 0, max: 1 });
  if (high !== undefined) overrides.highConfidenceThreshold = high;
  const medium = pickNumber(raw.mediumConfidenceThreshold, { min: 0, max: 1 });
  if (medium !== undefined) overrides.mediumConfidenceThreshold = medium;
  const critWin = pickNumber(raw.criticalObligationWindowDays, { min: 0 });
  if (critWin !== undefined) overrides.criticalObligationWindowDays = critWin;
  const watchWin = pickNumber(raw.watchObligationWindowDays, { min: 0 });
  if (watchWin !== undefined) overrides.watchObligationWindowDays = watchWin;
  const interveneWin = pickNumber(raw.immediateInterventionWindowDays, { min: 0 });
  if (interveneWin !== undefined) overrides.immediateInterventionWindowDays = interveneWin;
  const defConf = pickNumber(raw.defaultInvoiceConfidence, { min: 0, max: 1 });
  if (defConf !== undefined) overrides.defaultInvoiceConfidence = defConf;
  const staleConf = pickNumber(raw.staleInvoiceConfidence, { min: 0, max: 1 });
  if (staleConf !== undefined) overrides.staleInvoiceConfidence = staleConf;

  const shortfall = pickMaterialShortfall(
    raw.materialShortfallAmountMinor,
    raw.materialShortfallCurrency,
  );
  if (shortfall !== undefined) overrides.materialShortfallAmount = shortfall;

  return Object.keys(overrides).length === 0 ? undefined : overrides;
}
