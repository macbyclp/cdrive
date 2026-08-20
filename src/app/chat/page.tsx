"use client";

import { Suspense } from "react";
import ChatScreen from "@/components/ChatScreen";

/** Kurum içi sohbet (BETA) — kanallar + birebir mesajlaşma, gerçek zamanlı (SSE). */
export default function ChatPage() {
  return (
    <Suspense>
      <ChatScreen />
    </Suspense>
  );
}
