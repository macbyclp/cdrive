"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeUser } from "@/lib/types";

/**
 * /api/me'yi çeker; oturum yoksa veya sunucuda "revoke" edilmişse (ör.
 * hesap ayarlarından uzaktan kapatılmış bir oturum) kullanıcıyı otomatik
 * /login'e yönlendirir — sayfa süresiz boş kalmaz.
 */
export function useMe() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.push("/login");
          return;
        }
        setUser(d.user);
      });
  }, [router]);

  return { user, refresh };
}
