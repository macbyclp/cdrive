import { NextResponse } from "next/server";
import { getOrgName } from "@/lib/org";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Kimlik doğrulama GEREKTİRMEZ (bilerek) — Footer, giriş yapılmamış /login ve
 * /forgot-password gibi sayfalarda da render edildiği için kurum adına ihtiyaç duyar.
 * Sadece kurum adını (hassas olmayan bir görünürlük ayarı) döner, başka hiçbir veri yok.
 */
export async function GET() {
  try {
    const orgName = await getOrgName();
    return NextResponse.json({ orgName });
  } catch (err) {
    return errorResponse(err);
  }
}
