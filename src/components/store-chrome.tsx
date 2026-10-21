import { ArrowLeft, Boxes, ImageOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Country } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { CountrySwitcher } from "./country-switcher";

export function StoreChrome({
  country,
  storeName,
  homeHref,
  preview,
  children,
}: {
  country: Country;
  storeName: string;
  homeHref: string;
  preview: boolean;
  children: ReactNode;
}) {
  return (
    <div lang={country.locale} className="min-h-svh">
      {preview ? (
        <div className="border-b bg-muted/40">
          <div className="mx-auto flex min-h-12 max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-8">
            <span className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
                <Boxes className="size-3.5" />
              </span>
              Previewing your public storefront
            </span>
            <Button asChild size="sm">
              <Link href="/products">
                <ArrowLeft data-icon="inline-start" />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
      <header className="border-b">
        <div className="mx-auto flex min-h-16 max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-8">
          <Link href={homeHref} className="text-lg font-semibold tracking-tight">
            {storeName}
          </Link>
          <CountrySwitcher value={country.code} />
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
  // eslint-disable-next-line @next/next/no-img-element -- photos come from the store-scoped shop photo route
  return <img src={src} alt="" loading="lazy" className={cn("aspect-[4/5] w-full rounded-lg bg-muted object-cover", className)} />;
}
