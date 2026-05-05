import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  createdAt,
  currency,
  evidenceRefs,
  id,
  jsonObject,
  moneyMinor,
  nullableMoneyMinor,
  updatedAt,
} from "./common.js";
import { companies } from "./identity.js";

export const cashForecasts = pgTable(
  "cash_forecasts",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    horizonDays: integer("horizon_days").notNull(),
    triggerEventIds: uuid("trigger_event_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    cashBalanceMinor: moneyMinor("cash_balance_minor"),
    currency: currency(),
    riskStatus: text("risk_status").notNull(),
    shortfallAmountMinor: nullableMoneyMinor("shortfall_amount_minor"),
    forecastJson: jsonObject("forecast_json"),
    evidenceRefs: evidenceRefs(),
  },
  (table) => [
    index("cash_forecasts_company_generated_at_idx").on(table.companyId, table.generatedAt),
    index("cash_forecasts_company_generated_horizon_idx").on(
      table.companyId,
      table.generatedAt,
      table.horizonDays,
    ),
    index("cash_forecasts_company_risk_status_idx").on(table.companyId, table.riskStatus),
    check("cash_forecasts_horizon_days_positive", sql`${table.horizonDays} > 0`),
  ],
);

export const forecastScenarios = pgTable(
  "forecast_scenarios",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    forecastId: uuid("forecast_id")
      .notNull()
      .references(() => cashForecasts.id, { onDelete: "cascade" }),
    scenarioName: text("scenario_name").notNull(),
    riskStatus: text("risk_status").notNull(),
    shortfallAmountMinor: nullableMoneyMinor("shortfall_amount_minor"),
    scenarioJson: jsonObject("scenario_json"),
    evidenceRefs: evidenceRefs(),
  },
  (table) => [
    index("forecast_scenarios_company_forecast_idx").on(table.companyId, table.forecastId),
  ],
);
