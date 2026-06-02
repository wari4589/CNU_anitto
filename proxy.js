import { NextResponse } from "next/server";

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildCsp(nonce) {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:"],
    [
      "connect-src",
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      ...(isDev ? ["http://localhost:*", "ws://localhost:*"] : [])
    ],
    ["worker-src", "'self'", "blob:"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"]
  ];

  if (!isDev) directives.push(["upgrade-insecure-requests"]);

  return directives.map((directive) => directive.join(" ")).join("; ");
}

export function proxy(request) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders }
  });

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
