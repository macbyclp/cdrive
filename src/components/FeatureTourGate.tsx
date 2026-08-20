"use client";

import { useState } from "react";
import type { MeUser } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";
import FeatureTour from "@/components/FeatureTour";

/**
 * TopBar'a gömülü — her kimliği doğrulanmış sayfada render edildiği için (bkz.
 * src/components/TopBar.tsx) hesabın nereden ilk giriş yaptığından bağımsız olarak
 * özellik turunu bir kereliğine otomatik gösterir. hasSeenFeatureTour true olan
 * (turu daha önce görmüş) kullanıcılarda hiçbir şey render etmez.
 */
export default function FeatureTourGate({ user }: { user: MeUser }) {
  const [dismissed, setDismissed] = useState(false);

  if (user.hasSeenFeatureTour || dismissed) return null;

  function close() {
    setDismissed(true);
    fetch(withBasePath("/api/account/feature-tour"), { method: "POST" }).catch(() => {});
  }

  return <FeatureTour user={user} onClose={close} />;
}
