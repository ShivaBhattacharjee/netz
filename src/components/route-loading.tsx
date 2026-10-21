"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "./common";
import { PageLoader } from "./page-loader";

const HEADERS: Record<string, { title: string; meta?: string }> = {
  "/imports": { title: "Imports", meta: "Supplier sheets and photos, processed in the background" },
  "/products": { title: "Products" },
  "/storefront": { title: "Storefront" },
  "/metrics": { title: "Overview", meta: "Throughput, quality and AI spend across all imports" },
  "/evaluations": { title: "Evaluations", meta: "Accuracy per field against a labelled set" },
  "/experiments": { title: "Experiments", meta: "A/B tests of prompts and models" },
  "/queue": { title: "Queue & workers", meta: "Live job counts for each queue" },
  "/settings/webhooks": { title: "Webhooks", meta: "Get notified when an import finishes or products are approved" },
  "/settings/api": { title: "API keys", meta: "Programmatic imports for this store" },
};

export function RouteLoading() {
  const header = HEADERS[usePathname()];
  return (
    <>
      <PageHeader title={header?.title ?? <span aria-hidden className="block h-7 w-64 animate-pulse bg-muted" />} meta={header?.meta} />
      <PageLoader />
    </>
  );
}
