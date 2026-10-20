"use client";

import { Code2, KeyRound, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiKeys } from "@/lib/data/platform";
import { formatDateTime } from "@/lib/format";
import { CodeBlock } from "./code-block";
import { PageHeader, Panel } from "./common";

const snippets = {
  curl: `curl https://api.catalogforge.app/v1/imports \\
  -H "Authorization: Bearer $CATALOGFORGE_KEY" \\
  -H "Idempotency-Key: spring-2026-v3" \\
  -F sheet=@spring-supplier-2026.xlsx \\
  -F photos=@photos.zip \\
  -F webhook_url=https://example.com/hooks/catalog`,
  node: `const form = new FormData();
form.append("sheet", await fs.openAsBlob("spring-supplier-2026.xlsx"));
form.append("photos", await fs.openAsBlob("photos.zip"));

const res = await fetch("https://api.catalogforge.app/v1/imports", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.CATALOGFORGE_KEY}\`,
    "Idempotency-Key": "spring-2026-v3",
  },
  body: form,
});
const { id, status } = await res.json(); // 202 Accepted, status "queued"`,
  response: `HTTP/1.1 202 Accepted
{
  "id": "imp_8f2k1",
  "status": "queued",
  "rows": null,
  "links": {
    "self": "/v1/imports/imp_8f2k1",
    "stream": "/v1/imports/imp_8f2k1/stream",
    "products": "/v1/products?import_id=imp_8f2k1"
  }
}`,
};

const snippetLang = { curl: "bash", node: "ts", response: "http" } as const;

const endpoints = [
  ["POST", "/v1/imports", "Upload a sheet and photos, returns 202"],
  ["GET", "/v1/imports/:id", "Import status and row counts"],
  ["GET", "/v1/imports/:id/stream", "Server-sent progress events"],
  ["GET", "/v1/products", "List products, filter by status or import"],
  ["PATCH", "/v1/products/:id", "Edit fields, marks them as manual"],
  ["POST", "/v1/products/approve", "Bulk approve"],
  ["GET", "/v1/exports/shopify", "Shopify product CSV"],
];

export function ApiKeysView() {
  const [keys, setKeys] = useState(apiKeys);

  return (
    <>
      <PageHeader
        title="API keys"
        meta="Programmatic imports for ERPs and supplier feeds. Keys are scoped to this store."
        actions={
          <Button
            onClick={() => {
              const key = { id: `key_${Date.now()}`, name: "New key", prefix: "cf_live_n3W9", scopes: ["imports:write"], created_at: new Date().toISOString(), last_used_at: null };
              setKeys((k) => [key, ...k]);
              toast.success("Key created", { description: "Copy it now, it is shown only once." });
            }}
          >
            <Plus data-icon="inline-start" />
            Create key
          </Button>
        }
      />

      <Panel title="Keys" icon={KeyRound} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Name</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Key</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Scopes</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Last used</th>
                <th scope="col" className="h-9 w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}••••••••</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {s}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
                  <td className="px-2 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${k.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => setKeys((all) => all.filter((x) => x.id !== k.id))}>
                          <Trash2 />
                          Revoke
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div id="docs" className="grid gap-4 lg:grid-cols-5">
        <Panel title="Quick start" icon={Code2} className="lg:col-span-3" bodyClassName="p-0">
          <Tabs defaultValue="curl" className="gap-0">
            <div className="border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="node">Node.js</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
              </TabsList>
            </div>
            {(Object.keys(snippets) as (keyof typeof snippets)[]).map((k) => (
              <TabsContent key={k} value={k}>
                <CodeBlock code={snippets[k]} lang={snippetLang[k]} />
              </TabsContent>
            ))}
          </Tabs>
        </Panel>
        <Panel title="Endpoints" icon={Code2} className="lg:col-span-2" bodyClassName="p-0">
          <ul className="divide-y">
            {endpoints.map(([method, path, desc]) => (
              <li key={path + method} className="flex flex-col gap-0.5 px-4 py-2.5">
                <span className="flex items-center gap-2 font-mono text-xs">
                  <span className="w-12 text-muted-foreground">{method}</span>
                  {path}
                </span>
                <span className="pl-14 text-xs text-muted-foreground">{desc}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
