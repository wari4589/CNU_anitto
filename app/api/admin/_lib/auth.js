import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "manitto_admin";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 2;

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

function timingSafeStringEqual(left, right) {
  const a = hash(left);
  const b = hash(right);
  return timingSafeEqual(a, b);
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}

function sign(payload) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionToken() {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE * 1000;
  const payload = `${expiresAt}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token) {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (!timingSafeStringEqual(parts[2], expected)) return false;

  const expiresAt = Number(parts[0]);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
