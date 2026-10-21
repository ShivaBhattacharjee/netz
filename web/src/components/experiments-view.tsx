import { PageHeader } from "./common";
import { EmptyState } from "./empty-state";

export function ExperimentsView() {
  return (
    <>
      <PageHeader title="Experiments" meta="A/B tests of prompts and models" />
      <EmptyState title="No experiments yet" description="Prompt and model comparisons will appear here once experiments can be started." />
    </>
  );
}
