"use client";

import { createContext, useContext } from "react";

export interface ActiveStore {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
}

const ActiveStoreContext = createContext<ActiveStore | null>(null);

export function ActiveStoreProvider({ store, children }: { store: ActiveStore; children: React.ReactNode }) {
  return <ActiveStoreContext.Provider value={store}>{children}</ActiveStoreContext.Provider>;
}

export function useActiveStore(): ActiveStore {
  const store = useContext(ActiveStoreContext);
  if (!store) throw new Error("useActiveStore must be used inside the dashboard layout");
  return store;
}
