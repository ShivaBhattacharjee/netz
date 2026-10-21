"use client";

import {
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Package,
  Plus,
  Server,
  Store as StoreIcon,
  Upload,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth/client";
import { useImports, useProducts } from "@/lib/data/store";
import { switchStore } from "@/lib/stores/actions";
import { cn } from "@/lib/utils";

interface Leaf {
  href: string;
  label: string;
  meta?: string;
}

function TreeLinks({ items, pathname }: { items: Leaf[]; pathname: string }) {
  return (
    <ul className="relative ml-[15px] flex flex-col pt-0.5 group-data-[collapsible=icon]:hidden">
      {items.map((item, i) => {
        const active = pathname === item.href;
        const last = i === items.length - 1;
        return (
          <li key={item.href} className="relative py-0.5 pl-4">
            <span aria-hidden className="absolute top-0 left-0 h-1/2 w-3 rounded-bl-md border-b border-l border-sidebar-foreground/20" />
            {!last ? <span aria-hidden className="absolute top-1/2 bottom-0 left-0 border-l border-sidebar-foreground/20" /> : null}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 min-w-0 items-center gap-2 px-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.meta ? <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{item.meta}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavItem({ href, label, icon: Icon, active, badge }: { href: string; label: string; icon: LucideIcon; active: boolean; badge?: number }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link href={href}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

function NavTree({ label, icon: Icon, active, items, pathname }: { label: string; icon: LucideIcon; active: boolean; items: Leaf[]; pathname: string }) {
  return (
    <Collapsible asChild defaultOpen={active} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} isActive={active && !items.some((i) => i.href === pathname)}>
            <Icon />
            <span>{label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <TreeLinks items={items} pathname={pathname} />
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export interface SidebarStore {
  id: string;
  name: string;
  domain: string | null;
  slug: string;
}

export interface SidebarUser {
  name: string;
  email: string;
  image?: string | null;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

function StoreSwitcher({ stores, activeStoreId }: { stores: SidebarStore[]; activeStoreId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const store = stores.find((s) => s.id === activeStoreId) ?? stores[0];

  const select = (id: string) => {
    if (id === activeStoreId) return;
    startTransition(async () => {
      const result = await switchStore(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" disabled={pending}>
              <span className="flex aspect-square size-8 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
                <Boxes className="size-4" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{store.name}</span>
                <span className="truncate text-xs text-muted-foreground">{store.domain ?? store.slug}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Stores</DropdownMenuLabel>
            {stores.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => select(s.id)}>
                <StoreIcon />
                <span className="flex-1 truncate">{s.name}</span>
                {s.id === store.id ? <Check /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <Plus />
                Add store
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({ user }: { user: SidebarUser }) {
  const router = useRouter();

  const logout = () =>
    signOut({
      fetchOptions: {
        onSuccess: () => {
          router.replace("/login");
          router.refresh();
        },
        onError: () => {
          toast.error("Could not sign out, please try again.");
        },
      },
    });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-none">
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="rounded-none text-xs">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings/api">
                <KeyRound />
                API keys
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({
  stores,
  activeStoreId,
  user,
}: {
  stores: SidebarStore[];
  activeStoreId: string;
  user: SidebarUser;
}) {
  const pathname = usePathname();
  const imports = useImports();
  const review = useProducts().filter((p) => p.status === "needs_review").length;
  const running = imports.filter((j) => j.status === "processing" || j.status === "paused" || j.status === "queued");

  const importLeaves: Leaf[] = [
    { href: "/imports", label: "All imports" },
    ...running.map((j) => ({
      href: `/imports/${j.id}`,
      label: j.file_name,
      meta: j.status === "paused" ? "Paused" : `${Math.floor(((j.total_rows - j.counts.pending) / Math.max(1, j.total_rows)) * 100)}%`,
    })),
  ];

  const analyticsLeaves: Leaf[] = [
    { href: "/metrics", label: "Overview" },
    { href: "/evaluations", label: "Evaluations" },
    { href: "/experiments", label: "Experiments" },
  ];

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <StoreSwitcher stores={stores} activeStoreId={activeStoreId} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Catalog</SidebarGroupLabel>
          <SidebarMenu>
            <NavTree label="Imports" icon={Upload} active={pathname.startsWith("/imports")} items={importLeaves} pathname={pathname} />
            <NavItem href="/products" label="Products" icon={Package} active={pathname.startsWith("/products")} badge={review} />
            <NavTree
              label="Analytics"
              icon={BarChart3}
              active={["/metrics", "/evaluations", "/experiments"].some((p) => pathname.startsWith(p))}
              items={analyticsLeaves}
              pathname={pathname}
            />
            <NavItem href="/store" label="Storefront preview" icon={StoreIcon} active={false} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem href="/queue" label="Queue & workers" icon={Server} active={pathname.startsWith("/queue")} />
            <NavItem href="/settings/webhooks" label="Webhooks" icon={Webhook} active={pathname.startsWith("/settings/webhooks")} />
            <NavItem href="/settings/api" label="API keys" icon={KeyRound} active={pathname.startsWith("/settings/api")} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
