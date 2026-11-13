import { FieldValue } from "firebase-admin/firestore";
import { authFailure, badRequest, errName, fail } from "@/lib/adminRoute";
import { verifyAdminRequest } from "@/lib/authToken";
import { parseAdminEvent } from "@/lib/calendar/eventInput";
import { getAdminDb } from "@/lib/firebaseAdmin";

/** 관리자가 공식 일정을 더한다. 관리자 확인이 본문 검사보다 먼저다. */
export async function POST(req: Request) {
  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return authFailure(admin.error);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("body");
  }
  const parsed = parseAdminEvent(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const ref = await getAdminDb()
      .collection("events")
      .add({ ...parsed.value, source: "admin", updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ id: ref.id });
  } catch (e) {
    console.error("admin event create failed", errName(e));
    return fail("server_error", 500);
  }
}
