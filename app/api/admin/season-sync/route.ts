import { FieldValue } from "firebase-admin/firestore";
import { authFailure, errName, fail } from "@/lib/adminRoute";
import { verifyAdminRequest } from "@/lib/authToken";
import { fetchSeasons, type SeasonRow } from "@/lib/er/client";
import { seasonEventDocs } from "@/lib/er/seasons";
import { getAdminDb } from "@/lib/firebaseAdmin";

/** ER API 의 시즌 표를 읽어 행마다 events/season-{seasonID} 를 덮어쓴다. 관리자만 부를 수 있다. */
export async function POST(req: Request) {
  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return authFailure(admin.error);

  let rows: SeasonRow[];
  try {
    rows = await fetchSeasons();
  } catch (e) {
    console.error("season sync fetch failed", errName(e));
    return fail("er_api_failed", 502);
  }

  try {
    const events = getAdminDb().collection("events");
    const docs = seasonEventDocs(rows);
    await Promise.all(docs.map(({ id, ...data }) => events.doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() })));
    return Response.json({ synced: docs.length });
  } catch (e) {
    console.error("season sync write failed", errName(e));
    return fail("server_error", 500);
  }
}
