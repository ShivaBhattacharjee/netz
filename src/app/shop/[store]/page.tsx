import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { countryFor, localized, storeStrings } from "@/lib/locale";
import { STOREFRONT_PAGE_SIZE } from "@/server/products";
import { cachedPublished, cachedStoreBySlug, shopHref } from "@/server/storefront";
import { PhotoTile, StoreChrome } from "@/components/store-chrome";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<{ country?: string; page?: string; preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await cachedStoreBySlug((await params).store);
  return { title: shop?.name ?? "Store not found" };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const [{ store: slug }, query] = await Promise.all([params, searchParams]);
  const shop = await cachedStoreBySlug(slug);
  if (!shop) notFound();

  const country = countryFor(query.country);
  const preview = query.preview === "1";
  const t = storeStrings[country.locale];
  const requested = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const { products, total } = await cachedPublished(shop, page);
  const pages = Math.max(1, Math.ceil(total / STOREFRONT_PAGE_SIZE));
  const href = (path: string, n?: number) => shopHref(shop.slug, path, { country: country.code, page: n, preview });
  if (page > pages) redirect(href("", pages));

  return (
    <StoreChrome country={country} storeName={shop.name} homeHref={href("")} preview={preview}>
      <div className="flex flex-col gap-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t.collection}</h1>
          <p className="text-compact text-muted-foreground tabular-nums">
            {total} {t.products}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const prices = p.variants.map((v) => v.price_cents).filter((c): c is number => c !== null);
            const from = prices.length ? Math.min(...prices) : null;
            return (
              <li key={p.id}>
                <Link href={href(`/${p.handle}`)} className="group flex flex-col gap-3">
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
        {pages > 1 ? (
          <nav className="flex items-center justify-between gap-4 text-compact" aria-label={t.page}>
            {page > 1 ? (
              <Link href={href("", page - 1)} className="hover:underline">
                {t.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground tabular-nums">
              {t.page} {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={href("", page + 1)} className="hover:underline">
                {t.next}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </StoreChrome>
  );
}
