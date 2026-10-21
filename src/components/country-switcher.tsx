"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries, countryFor } from "@/lib/locale";

const languageName = { en: "English", de: "German", fr: "French" };

export function CountrySwitcher({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = countryFor(value);
  const select = (code: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("country", code);
    params.delete("page");
    router.push(`${pathname}?${params}`);
  };
  return (
    <Select value={value} onValueChange={select}>
      <SelectTrigger className="h-9 gap-2 border-input bg-background/60 pl-3" aria-label="Country and language">
        <span className="text-muted-foreground">Viewing as</span>
        <SelectValue>
          <span className="font-medium">{current.name}</span>
          <span className="text-muted-foreground"> · {languageName[current.locale]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" position="popper" className="w-60">
        {countries.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="flex w-40 items-center justify-between gap-4">
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">{languageName[c.locale]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
