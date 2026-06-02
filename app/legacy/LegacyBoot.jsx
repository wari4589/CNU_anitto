"use client";

import { useEffect } from "react";

let booted = false;

export default function LegacyBoot() {
  useEffect(() => {
    if (booted) return;
    booted = true;

    (async () => {
      await import("./supabase-client");
      await import("./app");
    })().catch((error) => {
      console.error("[MANITTO] boot failed", error);
      const target =
        document.getElementById("login-err") ||
        document.getElementById("admin-err");
      if (target) {
        target.textContent =
          "앱 초기화에 실패했습니다. 환경변수와 Supabase 설정을 확인해주세요.";
      }
    });
  }, []);

  return null;
}
