"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useImports, useProducts } from "@/lib/data/store";

const sections: Record<string, { label: string; parent?: string }> = {
  imports: { label: "Imports" },
  products: { label: "Products" },
  metrics: { label: "Overview", parent: "Analytics" },
  evaluations: { label: "Evaluations", parent: "Analytics" },
  experiments: { label: "Experiments", parent: "Analytics" },
  queue: { label: "Queue & workers", parent: "Platform" },
  webhooks: { label: "Webhooks", parent: "Platform" },
  api: { label: "API keys", parent: "Platform" },
};

export function AppTopbar() {
  const pathname = usePathname();
  const imports = useImports();
  const products = useProducts();
  const parts = pathname.split("/").filter(Boolean);
  const [first, id] = parts[0] === "settings" ? [parts[1]] : parts;
  const section = sections[first];

  const crumbs: { label: string; href?: string }[] = [];
  if (section?.parent) crumbs.push({ label: section.parent });
  crumbs.push({ label: section?.label ?? "Dashboard", href: pathname.split("/").slice(0, parts[0] === "settings" ? 3 : 2).join("/") });
  if (id) {
    const label = first === "imports" ? imports.find((j) => j.id === id)?.file_name : products.find((p) => p.id === id)?.title;
    crumbs.push({ label: label ?? "Not found" });
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="min-w-0">
                  {last ? (
                    <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                  ) : c.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
