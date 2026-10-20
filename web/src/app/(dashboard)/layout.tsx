import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { ImportTicker } from "@/components/import-ticker";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <ImportTicker />
      <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:border">
        <AppTopbar />
        <div id="main" className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
