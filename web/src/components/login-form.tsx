"use client";

import { Boxes } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-6" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path fill="#4CAF50" d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24A11.91 11.91 0 0 1 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.52 5.03C9.5 39.56 16.23 44 24 44z" />
      <path fill="#1976D2" d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92z" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <section className="flex w-full flex-col px-6 py-6 md:w-[32%] md:max-w-[560px] md:min-w-[380px] md:px-10">
      <div className="flex items-center gap-2.5 border-t border-border pt-8">
        <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
          <Boxes className="size-4" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">Catalog Forge</span>
      </div>

      <div className="flex flex-1 flex-col pb-16">
        <h1 className="mt-[12vh] text-2xl font-medium tracking-tight">Sign in to Catalog Forge</h1>

        <div className="mt-[22vh] grid grid-cols-[8rem_minmax(0,1fr)] gap-x-6">
          <span className="flex h-14 items-center border-t border-border text-sm">Sign in with</span>
          <button
            type="button"
            aria-label="Sign in with Google"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              router.push("/imports");
            }}
            className="flex h-14 items-center justify-center border-t border-foreground/80 bg-muted/50 transition-colors outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
          >
            <GoogleIcon />
          </button>
        </div>
      </div>

      <div className="border-t border-border" />
    </section>
  );
}
