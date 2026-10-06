import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429, clientIp } from "@/lib/api-helpers";
import {
  UPDATE_BRANCH,
  UPDATE_REPO,
  UpdaterError,
  currentVersion,
  fetchCommitVerified,
  fetchLatest,
  isFullSha,
  requireVerifiedCommits,
  shortSha,
  updaterConfig,
  updaterFetch,
  type UpdaterStatus,
} from "@/lib/update";

// Her istekte gerçekten kontrol edilsin (önbelleğe alınmış statik yanıt olmasın).
export const dynamic = "force-dynamic";

/**
 * GET  → sürüm/güncelleme durumu (ADMIN). `?status=1` yalnız updater durumunu döner
 *        (güncelleme sürerken sık sorgulanır; GitHub'a gitmez). `?refresh=1` önbelleği atlar.
 * POST → güncellemeyi başlatır (ADMIN). Kodu çekme/derleme/yeniden başlatma updater sidecar'ındadır.
 */
export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");
    const url = new URL(req.url);
    const cfg = updaterConfig();

    let status: UpdaterStatus | null = null;
    let updaterError: string | null = null;
    if (cfg) {
      try {
        status = await updaterFetch<UpdaterStatus>("/status");
      } catch (e) {
        updaterError = e instanceof Error ? e.message : "Güncelleme servisine ulaşılamıyor";
      }
    }
    if (url.searchParams.get("status") === "1") {
      return NextResponse.json({ configured: !!cfg, status, updaterError });
    }

    const current = currentVersion();
    let latest = null;
    let latestError: string | null = null;
    try {
      latest = await fetchLatest(current.commit, url.searchParams.get("refresh") === "1");
    } catch (e) {
      latestError = e instanceof Error ? e.message : "Son sürüm bilgisi alınamadı";
    }
    return NextResponse.json({
      current,
      repo: UPDATE_REPO,
      branch: UPDATE_BRANCH,
      configured: !!cfg,
      status,
      updaterError,
      latest,
      latestError,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const limited = limitOr429("remote-update", admin.id, 5, 60_000);
    if (limited) return limited;
    if (!updaterConfig()) {
      throw new UpdaterError("Güncelleme servisi yapılandırılmamış (UPDATER_URL / UPDATER_TOKEN)");
    }

    // Yönetici panelde GÖRDÜĞÜ commit'i onaylar: updater "o an dalın ucunda ne varsa" değil, bu sha'yı kurar
    // (arada dala itilen bir commit sessizce kurulmaz). sha verilmezse (eski istemci) güncel uç kullanılır.
    const body = (await req.json().catch(() => ({}))) as { sha?: unknown };
    let sha: string;
    if (body.sha === undefined) {
      sha = (await fetchLatest(currentVersion().commit, true)).sha;
    } else if (isFullSha(body.sha)) {
      sha = body.sha;
    } else {
      return NextResponse.json({ error: "Geçersiz commit" }, { status: 400 });
    }

    if (requireVerifiedCommits() && !(await fetchCommitVerified(sha))) {
      return NextResponse.json(
        { error: "Bu commit GitHub'da imzalı (Verified) değil; UPDATE_REQUIRE_VERIFIED açıkken kurulamaz" },
        { status: 403 }
      );
    }

    const started = await updaterFetch<UpdaterStatus>(`/update?sha=${sha}`, { method: "POST", timeoutMs: 15_000 });
    await logAudit({
      userId: admin.id,
      action: "SETTINGS_UPDATE",
      targetType: "system",
      detail: `Uzaktan güncelleme başlatıldı (${shortSha(currentVersion().commit)} → ${shortSha(sha)}, ${UPDATE_REPO}@${UPDATE_BRANCH})`,
      ip: clientIp(req),
    });
    return NextResponse.json(started, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
