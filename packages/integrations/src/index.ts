export type {
  AccountingProvider,
  AccountingProviderKey,
  ListOptions,
  ProviderConnection,
  ProviderObjectType,
  RawContact,
  RawInvoice,
  RawPayment,
} from "./provider.js";

export {
  canonicalJsonStringify,
  sha256OfJson,
} from "./hash.js";

export type {
  CanonicalCustomerInsert,
  CanonicalInvoiceInsert,
  CanonicalPaymentInsert,
  SourceObjectUpsert,
} from "./mapper.js";
export {
  mapRawContactToCustomer,
  mapRawContactToSourceObject,
  mapRawInvoiceToInvoice,
  mapRawInvoiceToSourceObject,
  mapRawPaymentToPayment,
  mapRawPaymentToSourceObject,
} from "./mapper.js";

export type { SyncOptions, SyncResult } from "./sync.js";
export { syncProviderToSourceObjects } from "./sync.js";

export { XeroSimulatedAdapter } from "./adapters/xero-simulated.js";
