import { FieldValue } from "firebase-admin/firestore";
import { LOCKED_SOURCE, authFailure, badRequest, errName, fail } from "@/lib/adminRoute";
import { verifyAdminRequest } from "@/lib/authToken";
import { parseAdminEvent } from "@/lib/calendar/eventInput";
import { getAdminDb } from "@/lib/firebaseAdmin";

type Context = { params: Promise<{ id: string }> };

/** Firestore 문서 id 로 쓸 수 있는 값인지. 빈 값, "."·"..", 빗금이 든 값, __로 감싼 값, 1500자를 넘는 값은 쓸 수 없다. */
const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 1500 && id !== "." && id !== ".." && !id.includes("/") && !/^__.*__$/.test(id);

/** 관리자가 공식 일정을 고친다. ER API 에서 온 일정(source "er-api")은 고칠 수 없다. */
export async function PATCH(req: Request, { params }: Context) {
  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return authFailure(admin.error);

  const { id } = await params;
  if (!validId(id)) return badRequest("id");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("body");
  }
  const parsed = parseAdminEvent(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const ref = getAdminDb().collection("events").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("not_found", 404);
    if (snap.data()?.source === LOCKED_SOURCE) return fail("locked", 409);
    await ref.update({ ...parsed.value, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("admin event update failed", errName(e));
    return fail("server_error", 500);
  }
}

/** 관리자가 공식 일정을 지운다. ER API 에서 온 일정은 지울 수 없다. */
export async function DELETE(req: Request, { params }: Context) {
  const admin = await verifyAdminRequest(req);
  if (!admin.ok) return authFailure(admin.error);

  const { id } = await params;
  if (!validId(id)) return badRequest("id");

  try {
    const ref = getAdminDb().collection("events").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("not_found", 404);
    if (snap.data()?.source === LOCKED_SOURCE) return fail("locked", 409);
    await ref.delete();
    return Response.json({ ok: true });
  } catch (e) {
    console.error("admin event delete failed", errName(e));
    return fail("server_error", 500);
  }
}
