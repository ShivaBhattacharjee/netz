import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryFor, localized, localizedAttribute, storeStrings } from "@/lib/locale";
import { cachedPublishedByHandle, cachedStoreBySlug, shopHref } from "@/server/storefront";
import { PhotoTile, StoreChrome } from "@/components/store-chrome";
import { VariantPicker } from "@/components/variant-picker";

type Props = { params: Promise<{ store: string; handle: string }>; searchParams: Promise<{ country?: string; preview?: string }> };

async function load(slug: string, handle: string) {
  const shop = await cachedStoreBySlug(slug);
  const product = shop ? await cachedPublishedByHandle(shop, handle) : null;
  return shop && product ? { shop, product } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ store, handle }, query] = await Promise.all([params, searchParams]);
  const found = await load(store, handle);
  if (!found) return { title: "Product not found" };
  const locale = countryFor(query.country).locale;
  const seo = found.product.seo[locale];
  return { title: seo.meta_title || localized(found.product, locale, "title"), description: seo.meta_description || undefined };
}

export default async function ShopProductPage({ params, searchParams }: Props) {
  const [{ store, handle }, query] = await Promise.all([params, searchParams]);
  const found = await load(store, handle);
  if (!found) notFound();
  const { shop, product } = found;

  const country = countryFor(query.country);
  const preview = query.preview === "1";
  const t = storeStrings[country.locale];
  const photos = product.photos.length ? product.photos : [undefined];
  const home = shopHref(shop.slug, "", { country: country.code, preview });

  return (
    <StoreChrome country={country} storeName={shop.name} homeHref={home} preview={preview}>
      <div className="flex flex-col gap-6">
        <Link href={home} className="text-compact text-muted-foreground hover:text-foreground">
          {t.back}
        </Link>
        <div className="grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-12">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {photos.map((p, i) => (
              <PhotoTile key={p ?? i} src={p} className={i === 0 ? "sm:col-span-2" : ""} />
            ))}
          </div>
          <div className="flex flex-col gap-8">
            <h1 className="text-2xl font-semibold tracking-tight">{localized(product, country.locale, "title")}</h1>
            <VariantPicker variants={product.variants} locale={country.locale} strings={t} />
            <div
              className="flex flex-col gap-3 text-body [&_li]:ml-5 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: localized(product, country.locale, "description_html") }}
            />
            <dl className="flex flex-col divide-y border-y text-compact">
              {(["material", "color", "care"] as const).map((key) => {
                const value = localizedAttribute(product, country.locale, key);
                return value ? (
                  <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2">
                    <dt className="text-muted-foreground">{t[key]}</dt>
                    <dd>{value}</dd>
                  </div>
                ) : null;
              })}
            </dl>
          </div>
        </div>
      </div>
    </StoreChrome>
  );
}
