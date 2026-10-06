// Tek dosyalı multipart yüklemeyi BELLEĞE ALMADAN ayrıştırıp diske akıtır.
// `req.formData()` tüm gövdeyi (ve dosyayı ikinci kez) bellekte tutar; 1 GB'lık konteynerde yüzlerce
// MB'lık bir yükleme OOM ile süreci düşürürdü. Burada dosya parçası doğrudan depolamaya akar, bellekte
// yalnız küçük tamponlar durur.
import Busboy from "busboy";
import { Readable } from "stream";
import { writeStream, deleteFile } from "@/lib/storage";

export class UploadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Dosya izin verilen en büyük boyutu aştı (policy ya da UPLOAD_MAX_BYTES). */
export class UploadTooLargeError extends UploadError {
  constructor(public fileName: string) {
    super("Dosya izin verilen boyut sınırını aşıyor", 413);
  }
}

export type StreamedUpload = {
  /** Dosya dışındaki metin alanları (ör. folderId). */
  fields: Record<string, string>;
  /** Diske yazılmış dosya; yoksa null. Çağıran sahibidir (kullanmazsa `deleteFile` ile silmeli). */
  file: { name: string; mimeType: string; storageKey: string; size: number } | null;
};

export async function parseSingleFileUpload(req: Request, maxBytes: number): Promise<StreamedUpload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data/i.test(contentType) || !req.body) {
    throw new UploadError("Dosya bulunamadı");
  }

  return new Promise<StreamedUpload>((resolve, reject) => {
    let bb: Busboy.Busboy;
    try {
      // defParamCharset: tarayıcılar dosya adını UTF-8 gönderir (varsayılan latin1 Türkçe harfleri bozar).
      bb = Busboy({
        headers: { "content-type": contentType },
        defParamCharset: "utf8",
        limits: { files: 1, fileSize: maxBytes, fields: 20, fieldSize: 8 * 1024, parts: 40 },
      });
    } catch {
      return reject(new UploadError("Geçersiz yükleme isteği"));
    }

    const fields: Record<string, string> = {};
    let fileInfo: { name: string; mimeType: string } | null = null;
    let writing: Promise<{ key: string; size: number }> | null = null;
    let truncated = false;
    let settled = false;

    const fail = async (err: Error) => {
      if (settled) return;
      settled = true;
      // Yarım kalan dosyayı temizle.
      if (writing) {
        try {
          const { key } = await writing;
          await deleteFile(key).catch(() => {});
        } catch {
          /* writeStream başarısızlıkta kendi kısmi dosyasını siler */
        }
      }
      reject(err);
    };

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (name, stream, info) => {
      if (name !== "file" || writing) {
        stream.resume();
        return;
      }
      fileInfo = { name: info.filename, mimeType: info.mimeType };
      stream.on("limit", () => {
        truncated = true;
      });
      writing = writeStream(stream);
      writing.catch(() => {}); // hata 'close' / fail yolunda ele alınır; işlenmemiş reddedilme olmasın
    });

    bb.on("error", () => void fail(new UploadError("Yükleme isteği bozuk veya yarıda kesildi")));

    bb.on("close", async () => {
      if (settled) return;
      try {
        if (!writing || !fileInfo) {
          settled = true;
          return resolve({ fields, file: null });
        }
        const { key, size } = await writing;
        if (truncated) {
          await deleteFile(key).catch(() => {});
          settled = true;
          return reject(new UploadTooLargeError(fileInfo.name));
        }
        settled = true;
        resolve({ fields, file: { ...fileInfo, storageKey: key, size } });
      } catch (e) {
        void fail(e instanceof Error ? e : new Error(String(e)));
      }
    });

    const source = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on("error", () => void fail(new UploadError("Yükleme isteği bozuk veya yarıda kesildi")));
    source.pipe(bb);
  });
}
