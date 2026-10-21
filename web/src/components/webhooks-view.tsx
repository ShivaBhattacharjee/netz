import { PageHeader } from "./common";
import { EmptyState } from "./empty-state";

export function WebhooksView() {
  return (
    <>
      <PageHeader title="Webhooks" meta="Get notified when an import finishes or a product needs review" />
      <EmptyState title="No webhooks yet" description="Signed webhook deliveries for import.completed and import.failed are not built yet. Live progress is available in the dashboard meanwhile." />
    </>
  );
}
