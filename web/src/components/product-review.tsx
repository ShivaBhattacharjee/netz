"use client";

import { AlertTriangle, Check, ImageOff, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { actions, useProducts } from "@/lib/data/store";
import { formatDuration, formatMoney, formatNumber, formatUsd, formatWeight } from "@/lib/format";
import type { FieldTranslation, Product, TranslatableField, TranslatedLocale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Confidence, PageHeader, ProductStatusLabel, StatusLabel } from "./common";
import { RerunDialog } from "./rerun-dialog";
import type { Locale } from "@/lib/types";

const sourceColumns = ["SKU", "Name", "Size", "Colour", "Price", "Weight", "Notes", "Description"];

function SourcePanel({ product, highlight }: { product: Product; highlight: number | null }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
        <CardTitle className="text-sm">Supplier rows</CardTitle>
        <span className="text-xs text-muted-foreground">As uploaded</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] table-fixed text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="h-9 w-24 px-4 text-left font-medium">
                <span className="sr-only">Column</span>
              </th>
              {product.sources.map((s) => (
                <th
                  key={s.row}
                  id={`source-row-${s.row}`}
                  scope="col"
                  className={cn("h-9 px-4 text-left font-medium tabular-nums", highlight === s.row && "bg-warning/15 text-foreground")}
                >
                  Row {s.row}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sourceColumns.map((c) => (
              <tr key={c} className="border-b last:border-0 align-top">
                <th scope="row" className="px-4 py-2 text-left text-xs font-normal text-muted-foreground">
                  {c}
                </th>
                {product.sources.map((s) => (
                  <td
                    key={s.row}
                    className={cn(
                      "px-4 py-2 break-words",
                      (c === "SKU" || c === "Description") && "font-mono text-xs",
                      highlight === s.row && "bg-warning/10",
                    )}
                  >
                    {s.cells[c] || <span className="text-muted-foreground/60">–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 overflow-x-auto border-t p-4">
        {product.photos.length ? (
          product.photos.map((p) => (
            <div key={p} className="flex size-24 shrink-0 items-end rounded-md bg-muted p-1.5">
              <span className="truncate font-mono text-[10px] text-muted-foreground">{p}</span>
            </div>
          ))
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="size-4" /> No matched photos
          </span>
        )}
      </div>
    </Card>
  );
}

function Field({ label, score, manual, children }: { label: string; score?: number; manual?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
          {manual ? <span className="ml-2 font-normal text-foreground">Edited</span> : null}
        </span>
        {score !== undefined ? <Confidence score={score} /> : null}
      </div>
      {children}
    </div>
  );
}

const stateTone: Record<FieldTranslation["state"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  current: { tone: "success", label: "Current" },
  out_of_date: { tone: "warning", label: "Out of date" },
  missing: { tone: "neutral", label: "Not translated" },
};

function TranslationFields({ product, locale }: { product: Product; locale: TranslatedLocale }) {
  const fields: { key: TranslatableField; label: string }[] = [
    { key: "title", label: "Title" },
    { key: "description_html", label: "Description" },
  ];
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        const t = product.translations[locale][f.key];
        const s = stateTone[t.state];
        const save = (value: string) => value && value !== t.text && actions.editTranslation(product.id, locale, f.key, value);
        return (
          <div key={`${locale}-${f.key}`} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-muted-foreground">
                {f.label}
                <span className="ml-2 font-normal">{t.origin === "manual" ? "Merchant fix" : "AI"}</span>
              </span>
              <StatusLabel tone={s.tone}>{s.label}</StatusLabel>
            </div>
            {f.key === "title" ? (
              <Input lang={locale} defaultValue={t.state === "missing" ? "" : t.text} placeholder="Translated after approval" onBlur={(e) => save(e.target.value)} />
            ) : (
              <Textarea
                lang={locale}
                rows={3}
                className="font-mono text-xs"
                defaultValue={t.state === "missing" ? "" : t.text}
                placeholder="Translated after approval"
                onBlur={(e) => save(e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const seoLimits = { meta_title: 60, meta_description: 155 };

function SeoFields({ product }: { product: Product }) {
  const [locale, setLocale] = useState<Locale>("en");
  const seo = product.seo[locale];
  const [title, setTitle] = useState(seo.meta_title);
  const [desc, setDesc] = useState(seo.meta_description);
  const host = locale === "en" ? "atelierterra.shop" : `atelierterra.shop/${locale}`;

  function switchTo(l: Locale) {
    setLocale(l);
    setTitle(product.seo[l].meta_title);
    setDesc(product.seo[l].meta_description);
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={locale} onValueChange={(v) => switchTo(v as Locale)}>
        <TabsList>
          <TabsTrigger value="en">English</TabsTrigger>
          <TabsTrigger value="de">German</TabsTrigger>
          <TabsTrigger value="fr">French</TabsTrigger>
        </TabsList>
      </Tabs>
      {(
        [
          ["meta_title", "Meta title", title, setTitle],
          ["meta_description", "Meta description", desc, setDesc],
        ] as const
      ).map(([key, label, value, set]) => {
        const over = value.length > seoLimits[key];
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className={cn("text-xs tabular-nums", over ? "text-error" : "text-muted-foreground")}>
                {value.length}/{seoLimits[key]}
              </span>
            </div>
            {key === "meta_title" ? (
              <Input lang={locale} value={value} aria-invalid={over} onChange={(e) => set(e.target.value)} onBlur={() => actions.editSeo(product.id, locale, key, value)} />
            ) : (
              <Textarea lang={locale} rows={3} value={value} aria-invalid={over} onChange={(e) => set(e.target.value)} onBlur={() => actions.editSeo(product.id, locale, key, value)} />
            )}
          </div>
        );
      })}
      <div className="flex flex-col gap-0.5 rounded-lg border bg-muted/30 p-3">
        <span className="text-xs text-muted-foreground">
          {host} › products › {product.handle}
        </span>
        <span className="truncate text-base text-info">{title}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{desc}</span>
      </div>
    </div>
  );
}

function ResultPanel({ product, onClaim }: { product: Product; onClaim: (row: number) => void }) {
  const c = product.confidence;
  const isManual = (f: string) => product.manual_fields.includes(f);
  const stale = (l: TranslatedLocale) => Object.values(product.translations[l]).some((t) => t.state === "out_of_date");
  const staleDot = <span aria-label="has out of date fields" className="size-1.5 rounded-full bg-warning" />;

  return (
    <Card className="gap-0 py-0">
      <Tabs defaultValue="details" className="gap-0">
        <div className="flex items-center justify-between gap-2 overflow-x-auto border-b px-3 py-2">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="variants">Variants {product.variants.length}</TabsTrigger>
            <TabsTrigger value="claims">Claims {product.claims.length}</TabsTrigger>
            <TabsTrigger value="de">German {stale("de") ? staleDot : null}</TabsTrigger>
            <TabsTrigger value="fr">French {stale("fr") ? staleDot : null}</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details" className="flex flex-col gap-4 p-4">
          <Field label="Title" score={c.title} manual={isManual("title")}>
            <Input defaultValue={product.title} onBlur={(e) => actions.editField(product.id, "title", e.target.value)} />
          </Field>
          <Field label="Description" score={c.description_html} manual={isManual("description_html")}>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              defaultValue={product.description_html}
              onBlur={(e) => actions.editField(product.id, "description_html", e.target.value)}
            />
          </Field>
          <Field label="Category" score={c.category} manual={isManual("category")}>
            <Input defaultValue={product.category} onBlur={(e) => actions.editField(product.id, "category", e.target.value)} />
          </Field>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <th scope="row" className="w-28 px-3 py-2 text-left text-xs font-normal text-muted-foreground">Tags</th>
                  <td className="px-3 py-2">{product.tags.join(", ")}</td>
                  <td className="px-3 py-2 text-right">{c.tags !== undefined ? <Confidence score={c.tags} /> : null}</td>
                </tr>
                {Object.entries(product.attributes).map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left text-xs font-normal capitalize text-muted-foreground">{k}</th>
                    <td className="px-3 py-2">{v}</td>
                    <td className="px-3 py-2 text-right">{c[`attributes.${k}`] !== undefined ? <Confidence score={c[`attributes.${k}`]} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {product.usage.model} · {formatNumber(product.usage.input_tokens + product.usage.output_tokens)} tokens · {formatUsd(product.usage.cost_micros, 4)} ·{" "}
            {formatDuration(product.usage.latency_ms)}
          </p>
        </TabsContent>

        <TabsContent value="variants" className="p-4">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="h-8 px-3 text-left font-medium">SKU</th>
                  <th scope="col" className="h-8 px-3 text-left font-medium">Options</th>
                  <th scope="col" className="h-8 px-3 text-right font-medium">Price</th>
                  <th scope="col" className="h-8 px-3 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.sku} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{v.sku}</td>
                    <td className="px-3 py-2">{Object.values(v.options).join(", ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {v.price_cents === null ? <span className="text-warning">Missing</span> : formatMoney(v.price_cents, v.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatWeight(v.weight_grams)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="claims" className="p-4">
          {product.claims.length ? (
            <ul className="divide-y overflow-hidden rounded-md border">
              {product.claims.map((claim) => {
                const row = Number(claim.source.match(/row (\d+)/)?.[1]);
                return (
                  <li key={claim.text} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                    <span>{claim.text}</span>
                    <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => onClaim(row)}>
                      {claim.source}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No claims found in the source.</p>
          )}
        </TabsContent>

        <TabsContent value="de" className="p-4">
          <TranslationFields product={product} locale="de" />
        </TabsContent>
        <TabsContent value="fr" className="p-4">
          <TranslationFields product={product} locale="fr" />
        </TabsContent>
        <TabsContent value="seo" className="p-4">
          <SeoFields product={product} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function SendBack({ product }: { product: Product }) {
  const [note, setNote] = useState("");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Undo2 data-icon="inline-start" />
          Send back
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate this product</AlertDialogTitle>
          <AlertDialogDescription>Your note is added to the prompt. Fields you edited stay locked.</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the 30 cm size is 34,99 €" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              actions.sendBack(product.id, note.trim());
              setNote("");
            }}
          >
            Send back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProductReview({ id }: { id: string }) {
  const product = useProducts().find((p) => p.id === id);
  const [highlight, setHighlight] = useState<number | null>(null);

  if (!product) {
    return (
      <PageHeader
        title="Product not found"
        meta={
          <Link href="/products" className="underline underline-offset-4">
            Back to products
          </Link>
        }
      />
    );
  }

  function showSource(row: number) {
    setHighlight(row);
    document.getElementById(`source-row-${row}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  return (
    <>
      <PageHeader
        title={product.title || "Untitled product"}
        meta={
          <span className="flex items-center gap-3">
            <ProductStatusLabel status={product.status} />
            <span className="font-mono text-xs">{product.handle}</span>
          </span>
        }
        actions={
          product.status !== "failed" ? (
            <>
              <RerunDialog ids={[product.id]} />
              <SendBack product={product} />
              <Button disabled={product.status === "approved"} onClick={() => actions.approve([product.id])}>
                <Check data-icon="inline-start" />
                {product.status === "approved" ? "Approved" : "Approve"}
              </Button>
            </>
          ) : null
        }
      />

      {product.review_reason ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            product.status === "failed" ? "border-error/30 bg-error/10" : "border-warning/30 bg-warning/10",
          )}
        >
          <AlertTriangle className={cn("size-4 shrink-0", product.status === "failed" ? "text-error" : "text-warning")} />
          {product.review_reason}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SourcePanel product={product} highlight={highlight} />
        {product.status === "failed" ? (
          <Card className="py-4">
            <CardContent className="px-4 text-sm text-muted-foreground">No AI result was saved. Retry it from the import.</CardContent>
          </Card>
        ) : (
          <ResultPanel product={product} onClaim={showSource} />
        )}
      </div>
    </>
  );
}
