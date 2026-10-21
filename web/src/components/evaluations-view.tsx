import { PageHeader } from "./common";
import { EmptyState } from "./empty-state";

export function EvaluationsView() {
  return (
    <>
      <PageHeader title="Evaluations" meta="Accuracy per field against a labelled set" />
      <EmptyState title="No evaluation runs yet" description="Runs against the labelled sets in evals/ will show per-field accuracy and invented-claim counts here." />
    </>
  );
}
