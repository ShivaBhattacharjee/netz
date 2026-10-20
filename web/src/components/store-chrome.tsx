import { ArrowLeft, Boxes } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Country } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { CountrySwitcher } from "./country-switcher";

export function StoreChrome({ country, children }: { country: Country; children: ReactNode }) {
  return (
    <div lang={country.locale} className="min-h-svh">
      <div className="border-b bg-muted/40">
        <div className="mx-auto flex min-h-16 max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
              <Boxes className="size-4" />
            </span>
            <span className="text-sm">
              Previewing the storefront <span className="hidden text-muted-foreground sm:inline">as a shopper sees it</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CountrySwitcher value={country.code} />
            <Button asChild>
              <Link href="/products">
                <ArrowLeft data-icon="inline-start" />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center px-4 md:px-8">
          <Link href={`/store?country=${country.code}`} className="text-lg font-semibold tracking-tight">
            Atelier Terra
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1200px] px-4 py-10 md:px-8 md:py-14">
        {children}
      </main>
    </div>
  );
}

export function PhotoTile({ name, className }: { name?: string; className?: string }) {
  return (
    <div className={cn("flex aspect-[4/5] items-end rounded-lg bg-muted p-3", className)}>
      {name ? <span className="truncate font-mono text-xs text-muted-foreground">{name}</span> : null}
    </div>
  );
}
