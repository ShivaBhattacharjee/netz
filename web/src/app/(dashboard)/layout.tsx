import { cookies } from "next/headers";
import { ActiveStoreProvider } from "@/components/active-store";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { ImportTicker } from "@/components/import-ticker";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { requireStore } from "@/lib/auth/session";
import { env } from "@/server/env";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, stores, active } = await requireStore();
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <ActiveStoreProvider store={{ id: active.id, name: active.name, slug: active.slug, domain: active.domain }}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          stores={stores}
          activeStoreId={active.id}
          user={{ name: user.name, email: user.email, image: user.image }}
        />
        <ImportTicker storeId={active.id} />
        <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:border">
          <AppTopbar />
          {env().AI_MODE === "mock" ? (
            <div role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm md:px-8">
              Demo mode: products are built without AI. Set GEMINI_API_KEY in .env and restart the app and the worker to use Gemini.
            </div>
          ) : null}
          <div id="main" className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </SidebarInset>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </ActiveStoreProvider>
  );
}
