import { randomInt } from "node:crypto";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "./_lib/auth";
import { getSupabaseAdmin } from "./_lib/supabase-admin";

export const runtime = "nodejs";

function assertAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    throw new Response(JSON.stringify({ error: "관리자 인증이 필요합니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function cleanText(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = 0, min = 0, max = 100000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

function shuffle(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

async function ensureSeason(db) {
  const { data: existing, error: findError } = await db
    .from("seasons")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await db
    .from("seasons")
    .insert({ name: "기본 시즌" })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id;
}

async function handleAdminAction(db, action, payload) {
  if (action === "getParticipants") {
    const gameSessionId = cleanText(payload.gameSessionId, 80);
    return db
      .from("participants")
      .select(
        `
        id,
        score,
        pending_score,
        coins,
        profiles ( nickname )
      `
      )
      .eq("game_session_id", gameSessionId)
      .order("score", { ascending: false });
  }

  if (action === "createGameSession") {
    const name = cleanText(payload.name, 80);
    if (!name) throw new Error("게임 이름을 입력해주세요.");

    const durationDays = cleanNumber(payload.durationDays, 7, 1, 365);
    const seasonId = await ensureSeason(db);
    return db
      .from("game_sessions")
      .insert({ season_id: seasonId, name, duration_days: durationDays })
      .select()
      .single();
  }

  if (action === "startGame") {
    const gameSessionId = cleanText(payload.gameSessionId, 80);
    const { data: parts, error: partsError } = await db
      .from("participants")
      .select("id")
      .eq("game_session_id", gameSessionId);

    if (partsError) throw partsError;
    if (!parts || parts.length < 2) {
      throw new Error("참가자가 2명 이상이어야 게임을 시작할 수 있습니다.");
    }

    const shuffled = shuffle(parts);
    const manittos = shuffled.map((participant, index) => ({
      game_session_id: gameSessionId,
      from_participant_id: participant.id,
      to_participant_id: shuffled[(index + 1) % shuffled.length].id
    }));

    await db.from("manittos").delete().eq("game_session_id", gameSessionId);

    const { error: manittoError } = await db.from("manittos").insert(manittos);
    if (manittoError) throw manittoError;

    return db
      .from("game_sessions")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", gameSessionId)
      .select()
      .single();
  }

  if (action === "endGame") {
    const gameSessionId = cleanText(payload.gameSessionId, 80);
    return db
      .from("game_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", gameSessionId)
      .select()
      .single();
  }

  if (action === "addMission") {
    const gameSessionId = cleanText(payload.gameSessionId, 80);
    const title = cleanText(payload.title, 120);
    if (!title) throw new Error("미션 제목을 입력해주세요.");

    const mission = {
      game_session_id: gameSessionId,
      title,
      description: cleanText(payload.description, 1000),
      score_reward: cleanNumber(payload.scoreReward, 0, 0, 100000),
      coin_reward: cleanNumber(payload.coinReward, 0, 0, 100000)
    };

    if (process.env.ADMIN_PROFILE_ID) {
      mission.created_by = process.env.ADMIN_PROFILE_ID;
    }

    return db
      .from("missions")
      .insert(mission)
      .select()
      .single();
  }

  if (action === "deleteMission") {
    const missionId = cleanText(payload.missionId, 80);
    return db.from("missions").update({ is_active: false }).eq("id", missionId);
  }

  throw new Error("지원하지 않는 관리자 작업입니다.");
}

export async function POST(request) {
  try {
    assertAdmin(request);
    const { action, payload = {} } = await request.json().catch(() => ({}));
    const result = await handleAdminAction(getSupabaseAdmin(), action, payload);

    if (result.error) throw result.error;
    return Response.json({ data: result.data ?? null, error: null });
  } catch (error) {
    if (error instanceof Response) return error;

    return Response.json(
      { data: null, error: { message: error.message || "관리자 작업 실패" } },
      { status: 400 }
    );
  }
}
