import { PageHeader } from "./common";
import { EmptyState } from "./empty-state";

export function ApiKeysView() {
  return (
    <>
      <PageHeader title="API keys" meta="Programmatic imports for this store" />
      <EmptyState title="No API keys yet" description="Store-scoped API keys for the public import API are not built yet. Imports can be started from the dashboard." />
    </>
  );
}
