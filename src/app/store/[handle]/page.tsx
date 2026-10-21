import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth/session";
import { countryFor, localized, storeStrings } from "@/lib/locale";
import { getPublishedByHandle } from "@/server/products";
import { PhotoTile, StoreChrome } from "@/components/store-chrome";
import { VariantPicker } from "@/components/variant-picker";

export default async function StoreProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { handle } = await params;
  const country = countryFor((await searchParams).country);
  const { active } = await requireStore();
  const product = await getPublishedByHandle(active.id, handle);
  if (!product) notFound();

  const t = storeStrings[country.locale];
  const photos = product.photos.length ? product.photos : [undefined];

  return (
    <StoreChrome country={country} storeName={active.name}>
      <div className="flex flex-col gap-6">
        <Link href={`/store?country=${country.code}`} className="text-compact text-muted-foreground hover:text-foreground">
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
            <dl className="flex flex-col divide-y divide-y border-y text-compact">
              {product.attributes.material ? (
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2">
                  <dt className="text-muted-foreground">{t.material}</dt>
                  <dd>{product.attributes.material}</dd>
                </div>
              ) : null}
              {product.attributes.color ? (
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2">
                  <dt className="text-muted-foreground">{t.color}</dt>
                  <dd>{product.attributes.color}</dd>
                </div>
              ) : null}
              {product.attributes.care ? (
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2">
                  <dt className="text-muted-foreground">{t.care}</dt>
                  <dd>{product.attributes.care}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </StoreChrome>
  );
}
