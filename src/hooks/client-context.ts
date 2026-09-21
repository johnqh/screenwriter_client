import { createContext, createElement, useContext, type ReactNode } from "react";
import type { ScreenwriterClient } from "../network/screenwriter-client";

const ClientContext = createContext<ScreenwriterClient | null>(null);

/** Provide one `ScreenwriterClient` to every hook below (place inside `QueryClientProvider`). */
export function ScreenwriterClientProvider(props: { client: ScreenwriterClient; children?: ReactNode }) {
  return createElement(ClientContext.Provider, { value: props.client }, props.children);
}

export function useScreenwriterClient(): ScreenwriterClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("useScreenwriterClient: wrap the tree in <ScreenwriterClientProvider>");
  return c;
}
