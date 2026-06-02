import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  verifyAdminSessionToken
} from "../_lib/auth";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

export const runtime = "nodejs";

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getClientKey(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function isRateLimited(key) {
  const now = Date.now();
  const current = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  attempts.set(key, current);
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request) {
  const key = getClientKey(request);
  if (isRateLimited(key)) {
    return Response.json(
      { error: "잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const { accessToken } = await request.json().catch(() => ({}));
  if (!accessToken || typeof accessToken !== "string") {
    return Response.json(
      { error: "관리자 계정 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const db = getSupabaseAdmin();
  const { data: userData, error: userError } = await db.auth.getUser(accessToken);
  const user = userData?.user;

  if (userError || !user) {
    return Response.json(
      { error: "관리자 계정 확인에 실패했습니다." },
      { status: 401 }
    );
  }

  const allowedEmails = getAdminEmails();
  const emailAllowed =
    !!user.email && allowedEmails.includes(user.email.toLowerCase());

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return Response.json(
      { error: "관리자 권한 확인에 실패했습니다." },
      { status: 401 }
    );
  }

  if (!emailAllowed && profile?.is_admin !== true) {
    return Response.json(
      { error: "관리자 권한이 없는 계정입니다." },
      { status: 403 }
    );
  }

  const response = Response.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${createAdminSessionToken()}; Path=/; Max-Age=${ADMIN_SESSION_MAX_AGE}; HttpOnly; SameSite=Strict${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );

  return response;
}

export async function GET(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  return Response.json({ ok: verifyAdminSessionToken(token) });
}
