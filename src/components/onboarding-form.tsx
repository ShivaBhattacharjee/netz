"use client";

import { Boxes } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createStore, type CreateStoreState } from "@/lib/stores/actions";
import { CURRENCIES } from "@/lib/stores/schema";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function OnboardingForm({ firstStore, userName }: { firstStore: boolean; userName: string }) {
  const [state, action, pending] = useActionState<CreateStoreState, FormData>(createStore, {});
  const [requestId] = useState(() => crypto.randomUUID());
  const errors = state.fieldErrors ?? {};
  const firstName = userName.split(" ")[0];

  return (
    <section className="flex w-full flex-col px-6 py-6 md:w-[32%] md:max-w-[560px] md:min-w-[380px] md:px-10">
      <div className="flex items-center gap-2.5 border-t border-border pt-8">
        <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
          <Boxes className="size-4" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">Catalog Forge</span>
      </div>

      <div className="flex flex-1 flex-col pb-16">
        <h1 className="mt-[12vh] text-2xl font-medium tracking-tight">
          {firstStore ? `Welcome, ${firstName}. Create your store` : "Create another store"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Imports, products and API keys belong to a store. You can add more stores later.
        </p>

        <form action={action} className="mt-10 flex flex-col gap-5" noValidate>
          <input type="hidden" name="request_id" value={requestId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Store name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={60}
              autoFocus
              autoComplete="organization"
              placeholder="Atelier Terra"
              defaultValue={state.values?.name}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            <FieldError id="name-error" message={errors.name} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="domain">
              Domain <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="domain"
              name="domain"
              inputMode="url"
              autoComplete="url"
              placeholder="atelierterra.shop"
              defaultValue={state.values?.domain}
              aria-invalid={!!errors.domain}
              aria-describedby={errors.domain ? "domain-error" : undefined}
            />
            <FieldError id="domain-error" message={errors.domain} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="currency">Default currency</Label>
            <Select name="currency" defaultValue={state.values?.currency || "EUR"}>
              <SelectTrigger id="currency" className="w-full" aria-invalid={!!errors.currency}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used for prices in supplier sheets that have no currency symbol.</p>
            <FieldError id="currency-error" message={errors.currency} />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create store"}
            </Button>
            {firstStore ? null : (
              <Button variant="ghost" asChild>
                <Link href="/imports">Cancel</Link>
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="border-t border-border" />
    </section>
  );
}
