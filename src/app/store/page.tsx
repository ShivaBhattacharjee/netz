import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { requireStore } from "@/lib/auth/session";
import { countryFor, localized, storeStrings } from "@/lib/locale";
import { cachedPublished } from "@/server/storefront";
import { PhotoTile, StoreChrome } from "@/components/store-chrome";

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const country = countryFor((await searchParams).country);
  const t = storeStrings[country.locale];
  const { active } = await requireStore();
  const products = await cachedPublished(active.id);

  return (
    <StoreChrome country={country} storeName={active.name}>
      <div className="flex flex-col gap-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t.collection}</h1>
          <p className="text-compact text-muted-foreground tabular-nums">
            {products.length} {t.products}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const prices = p.variants.map((v) => v.price_cents).filter((c): c is number => c !== null);
            const from = prices.length ? Math.min(...prices) : null;
            return (
              <li key={p.id}>
                <Link href={`/store/${p.handle}?country=${country.code}`} className="group flex flex-col gap-3">
                  <div className="relative">
                    <PhotoTile src={p.photos[0]} />
                    {p.photos[1] ? (
                      <PhotoTile src={p.photos[1]} className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-compact group-hover:underline">{localized(p, country.locale, "title")}</span>
                    <span className="text-compact text-muted-foreground tabular-nums">
                      {from === null
                        ? t.noPrice
                        : `${prices.length > 1 ? `${t.from} ` : ""}${formatMoney(from, p.variants[0].currency, country.locale)}`}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </StoreChrome>
  );
}
