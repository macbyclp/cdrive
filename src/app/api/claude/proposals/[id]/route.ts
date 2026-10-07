import { NextResponse } from "next/server";
import { z } from "zod";
import mime from "mime-types";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertQuota, canAccessFile, canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromBuffer, saveNewFileVersion } from "@/lib/file-versions";
import { extractSearchText } from "@/lib/text-extract";
import { logAudit } from "@/lib/audit";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { readFile } from "@/lib/storage";
import { errorResponse } from "@/lib/api-helpers";
import { readableText } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Başkasının önerisi: varlığı bile sızdırılmadan 404 (userId koşulu).
async function ownProposal(id: string, userId: string) {
  return prisma.claudeProposal.findFirst({ where: { id, userId } });
}

/** Öneri ayrıntısı + (düzenleme ise) mevcut metin — panelde fark göstermek için. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const p = await ownProposal(id, user.id);
    if (!p) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });

    let oldText: string | null = null;
    let stale = false;
    if (p.kind === "edit" && p.fileId) {
      const file = await prisma.file.findUnique({ where: { id: p.fileId }, include: { currentVersion: true } });
      if (file?.currentVersion) {
        stale = file.currentVersion.id !== p.baseVersionId;
        const buf = await readFile(file.currentVersion.storageKey).catch(() => null);
        oldText = buf ? await readableText(buf, file.mimeType, file.name) : null;
      }
    }
    const cap = (s: string | null) => (s && s.length > 400_000 ? s.slice(0, 400_000) : s);
    return NextResponse.json({
      id: p.id,
      kind: p.kind,
      name: p.name,
      summary: p.summary,
      status: p.status,
      content: cap(p.content),
      oldText: cap(oldText),
      stale,
      createdAt: p.createdAt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const decideSchema = z.object({ action: z.enum(["apply", "reject"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action } = decideSchema.parse(await req.json());
    const p = await ownProposal(id, user.id);
    if (!p) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });

    // Çift uygulamayı/yarışı önlemek için durum atomik olarak "talep edilir".
    const claimed = await prisma.claudeProposal.updateMany({
      where: { id: p.id, userId: user.id, status: "PENDING" },
      data: { status: action === "apply" ? "APPLIED" : "REJECTED", decidedAt: new Date() },
    });
    if (claimed.count === 0) return NextResponse.json({ error: "Bu öneri zaten sonuçlandırılmış" }, { status: 409 });
    if (action === "reject") return NextResponse.json({ ok: true, status: "REJECTED" });

    const revert = () =>
      prisma.claudeProposal.update({ where: { id: p.id }, data: { status: "PENDING", decidedAt: null } }).catch(() => {});
    try {
      const buffer = Buffer.from(p.content, "utf-8");
      if (p.kind === "edit") {
        const file = p.fileId ? await prisma.file.findUnique({ where: { id: p.fileId } }) : null;
        if (!file || file.deletedAt) {
          await revert();
          return NextResponse.json({ error: "Dosya artık yok" }, { status: 404 });
        }
        // Yetki UYGULAMA anında yeniden doğrulanır (öneriden sonra izin kaldırılmış olabilir).
        if (!(await canAccessFile(user, file.id, "EDIT"))) {
          await revert();
          return NextResponse.json({ error: "Bu dosyayı düzenleme yetkiniz yok" }, { status: 403 });
        }
        if (file.currentVersionId !== p.baseVersionId) {
          await revert();
          return NextResponse.json(
            { error: "Dosya öneriden sonra değişmiş; öneri artık geçerli değil. Claude'dan yeniden isteyin." },
            { status: 409 }
          );
        }
        await assertFilePolicy(file.name, BigInt(buffer.byteLength));
        const { file: updated } = await saveNewFileVersion(file, buffer, user.id, {
          mimeType: file.mimeType,
          auditDetailPrefix: "Claude önerisi — ",
        });
        return NextResponse.json({ ok: true, status: "APPLIED", fileId: updated.id });
      }

      // create
      if (p.folderId && !(await canAccessFolder(user, p.folderId, "EDIT"))) {
        await revert();
        return NextResponse.json({ error: "Bu klasörde dosya oluşturma yetkiniz yok" }, { status: 403 });
      }
      const dot = p.name.lastIndexOf(".");
      const stem = dot > 0 ? p.name.slice(0, dot) : p.name;
      const ext = dot > 0 ? p.name.slice(dot) : "";
      let name = p.name;
      for (let n = 2; await prisma.file.findFirst({ where: { folderId: p.folderId, name, deletedAt: null } }); n++) {
        name = `${stem} (${n})${ext}`;
      }
      await assertFilePolicy(name, BigInt(buffer.byteLength));
      await assertQuota(user, BigInt(buffer.byteLength));
      const mimeType = mime.lookup(name) || "text/plain";
      const created = await createFileFromBuffer({
        name,
        mimeType,
        folderId: p.folderId,
        ownerId: user.id,
        buffer,
        searchText: await extractSearchText(buffer, mimeType),
      });
      await notifyIfQuotaWarning(user.id);
      await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: created.id, detail: `${name} (Claude önerisi)` });
      return NextResponse.json({ ok: true, status: "APPLIED", fileId: created.id, name });
    } catch (e) {
      await revert();
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
