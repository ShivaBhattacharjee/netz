"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Lang = "bash" | "ts" | "json" | "http";

export function CodeBlock({ code, lang }: { code: string; lang: Lang }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    import("shiki").then(({ codeToHtml }) =>
      codeToHtml(code, {
        lang: lang === "http" ? "http" : lang,
        themes: { light: "github-light", dark: "github-dark-default" },
        defaultColor: false,
      }).then((out) => alive && setHtml(out)),
    );
    return () => {
      alive = false;
    };
  }, [code, lang]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy code"
        className="absolute top-2 right-2 z-10"
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      {html ? (
        <div className="shiki-block overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed text-muted-foreground">{code}</pre>
      )}
    </div>
  );
}
