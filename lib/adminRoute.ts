/** 서버 전용. /api/admin/* 라우트가 같이 쓰는 응답 모양. */

export const fail = (error: string, status: number) => Response.json({ error }, { status });

/** 입력이 틀렸을 때. field 는 틀린 칸의 이름이다. */
export const badRequest = (field: string) => Response.json({ error: "bad_request", field }, { status: 400 });

/** 관리자 확인이 실패했을 때. 토큰이 없거나 틀리면 401, 관리자 표시가 없으면 403. */
export const authFailure = (error: "unauthorized" | "forbidden") => fail(error, error === "unauthorized" ? 401 : 403);

/** 서버 로그에 남길 오류 종류. 내용은 남기지 않는다. */
export const errName = (e: unknown) => (e instanceof Error ? e.name : "unknown");

/** 일정 문서의 출처가 ER API 면 관리자가 고치거나 지울 수 없다. */
export const LOCKED_SOURCE = "er-api";
