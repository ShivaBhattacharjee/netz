import { ArrowLeft, Boxes, ImageOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Country } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { CountrySwitcher } from "./country-switcher";

export function StoreChrome({ country, storeName, children }: { country: Country; storeName: string; children: ReactNode }) {
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
            {storeName}
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1200px] px-4 py-10 md:px-8 md:py-14">
        {children}
      </main>
    </div>
  );
}

export function PhotoTile({ src, className }: { src?: string; className?: string }) {
  if (!src) {
    return (
      <div className={cn("flex aspect-[4/5] items-center justify-center rounded-lg bg-muted text-muted-foreground/60", className)}>
        <ImageOff aria-hidden className="size-8" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- private, store-scoped photo route
  return <img src={src} alt="" loading="lazy" className={cn("aspect-[4/5] w-full rounded-lg bg-muted object-cover", className)} />;
}
