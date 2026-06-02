/* ═══════════════════════════════════════════════════════════
   MANITTO — Supabase client for Next.js

   Public Supabase values come from NEXT_PUBLIC_* env vars.
   Admin-only writes are proxied through /api/admin with an HttpOnly cookie.
═══════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

// ── 설정 ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[ManittoDB] NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 없습니다.');
}

// ── 클라이언트 초기화 ────────────────────────────────────────
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

async function adminRequest(action, payload = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { data: null, error: body.error || { message: '관리자 작업에 실패했습니다.' } };
  }
  return body;
}

/* ═══════════════════════════════════════════════════════════
   AUTH — 회원가입 / 로그인 / 로그아웃
═══════════════════════════════════════════ */

/**
 * 회원가입
 * 1. Supabase Auth 계정 생성
 * 2. profiles 테이블 INSERT (real_name, nickname)
 * @returns {{ data, error }}
 */
async function apiSignup({ email, password, realName, nickname }) {
  // 닉네임 중복 체크
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();

  if (existing) {
    return { data: null, error: { message: '이미 사용 중인 닉네임입니다.' } };
  }

  // Auth 계정 생성 (이메일+비밀번호)
  const { data: authData, error: authErr } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { real_name: realName, nickname }, // user_metadata (빠른 접근용)
    },
  });
  if (authErr) return { data: null, error: authErr };

  const userId = authData.user?.id;
  if (!userId) return { data: null, error: { message: '사용자 ID를 가져올 수 없습니다.' } };

  // profiles INSERT
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .insert({ id: userId, real_name: realName, nickname })
    .select()
    .single();

  if (profileErr) return { data: null, error: profileErr };

  return { data: { user: authData.user, profile }, error: null };
}

/**
 * 로그인 (이메일 + 비밀번호)
 * @returns {{ data: { session, profile }, error }}
 */
async function apiLogin({ email, password }) {
  const { data: authData, error: authErr } = await db.auth.signInWithPassword({ email, password });
  if (authErr) return { data: null, error: authErr };

  const profile = await getMyProfile();
  return { data: { session: authData.session, profile }, error: null };
}

/**
 * 로그아웃
 */
async function apiLogout() {
  await db.auth.signOut();
  await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
}

/**
 * 서버 관리자 세션 생성 (Supabase access token 검증 후 HttpOnly cookie 발급)
 */
async function apiAdminLogin(accessToken) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { data: null, error: { message: body.error || '관리자 로그인에 실패했습니다.' } };
  }

  return { data: body, error: null };
}

async function apiGetAdminSession() {
  const res = await fetch('/api/admin/login');
  const body = await res.json().catch(() => ({}));
  return { data: body, error: res.ok ? null : body.error };
}

/**
 * 현재 로그인된 세션 가져오기
 */
async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

/**
 * 내 프로필 가져오기
 */
async function getMyProfile() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
}

/* ═══════════════════════════════════════════════════════════
   GAME SESSION — 활성 게임 조회
═══════════════════════════════════════════ */

/**
 * 현재 활성(active) 또는 가장 최근 게임 세션 가져오기
 */
async function getActiveGameSession() {
  // active 상태 우선
  let { data } = await db
    .from('game_sessions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 없으면 waiting 상태도 허용
  if (!data) {
    const { data: waiting } = await db
      .from('game_sessions')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    data = waiting;
  }

  return data;
}

/**
 * 특정 게임에서 내 participant 레코드 가져오기
 */
async function getMyParticipant(gameSessionId) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from('participants')
    .select('*')
    .eq('game_session_id', gameSessionId)
    .eq('profile_id', user.id)
    .maybeSingle();
  return data;
}

/**
 * 게임 참가 등록 (아직 참가 안 한 경우)
 */
async function joinGame(gameSessionId) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { data: null, error: { message: '로그인이 필요합니다.' } };

  const existing = await getMyParticipant(gameSessionId);
  if (existing) return { data: existing, error: null };

  const { data, error } = await db
    .from('participants')
    .insert({ game_session_id: gameSessionId, profile_id: user.id, score: 0, coins: 100 })
    .select()
    .single();
  return { data, error };
}

/* ═══════════════════════════════════════════════════════════
   PARTICIPANTS — 랭킹용 참가자 목록
═══════════════════════════════════════════ */

/**
 * 게임 내 모든 참가자 (점수 + 실명) 가져오기 (랭킹용)
 * profiles 테이블과 JOIN — 닉네임은 앱 레이어에서 필터링
 */
async function getParticipantsWithProfiles(gameSessionId) {
  const { data, error } = await db
    .from('participants')
    .select(`
      id,
      score,
      coins,
      profile_id,
      profiles ( real_name )
    `)
    .eq('game_session_id', gameSessionId)
    .order('score', { ascending: false });

  return { data, error };
}

/* ═══════════════════════════════════════════════════════════
   MISSIONS — 미션 목록 / 완료
═══════════════════════════════════════════ */

/**
 * 특정 게임의 활성 미션 목록 (내 완료 여부 포함)
 */
async function getMissions(gameSessionId, participantId) {
  // 미션 목록
  const { data: missions, error } = await db
    .from('missions')
    .select('*')
    .eq('game_session_id', gameSessionId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return { data: null, error };

  // 내가 완료한 미션 ID 목록
  let completedIds = new Set();
  if (participantId) {
    const { data: completions } = await db
      .from('mission_completions')
      .select('mission_id')
      .eq('participant_id', participantId);
    completions?.forEach(c => completedIds.add(c.mission_id));
  }

  const result = missions.map(m => ({ ...m, completed: completedIds.has(m.id) }));
  return { data: result, error: null };
}

/**
 * 미션 완료 처리
 * 1. mission_completions INSERT
 * 2. participants.score / coins UPDATE
 * 3. score_log / coin_log INSERT
 * 4. notifications INSERT
 */
async function completeMission({ missionId, participantId, gameSessionId, photoUrl, description, scoreReward, coinReward }) {
  // 중복 완료 방지
  const { data: existing } = await db
    .from('mission_completions')
    .select('id')
    .eq('mission_id', missionId)
    .eq('participant_id', participantId)
    .maybeSingle();

  if (existing) return { data: null, error: { message: '이미 완료한 미션입니다.' } };

  // 랜덤 지연 시각 계산 (10분 ~ 3시간)
  const delayMin = 10 + Math.floor(Math.random() * 170); // 10~180분
  const reflectAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();

  // mission_completions INSERT
  const { data: completion, error: compErr } = await db
    .from('mission_completions')
    .insert({
      mission_id:           missionId,
      participant_id:       participantId,
      photo_url:            photoUrl || null,
      description:          description || null,
      score_given:          scoreReward,
      coins_given:          coinReward,
      score_pending_until:  reflectAt,
      is_score_reflected:   false,
    })
    .select()
    .single();

  if (compErr) return { data: null, error: compErr };

  // 코인 즉시 지급, 점수는 pending_score에 적립
  const { error: updateErr } = await db.rpc('add_coins_and_pending_score', {
    p_participant_id: participantId,
    p_coins:          coinReward,
    p_pending_score:  scoreReward,
  }).catch(() => ({ error: null })); // RPC 없을 경우 fallback

  // RPC 없으면 직접 UPDATE (fallback)
  if (updateErr || true) {
    // pending_score 적립 + coins 지급
    const { data: cur } = await db
      .from('participants')
      .select('coins, pending_score')
      .eq('id', participantId)
      .single();

    await db
      .from('participants')
      .update({
        coins:         (cur?.coins || 0) + coinReward,
        pending_score: (cur?.pending_score || 0) + scoreReward,
      })
      .eq('id', participantId);
  }

  // score_log 기록
  await db.from('score_log').insert({
    participant_id: participantId,
    delta:          scoreReward,
    reason:         'mission_complete',
    ref_id:         missionId,
    is_pending:     true,
    reflect_at:     reflectAt,
  });

  // coin_log 기록
  await db.from('coin_log').insert({
    participant_id: participantId,
    delta:          coinReward,
    reason:         'mission_complete',
    ref_id:         missionId,
  });

  return { data: completion, error: null };
}

/* ═══════════════════════════════════════════════════════════
   RANKING — 랭킹 목록
═══════════════════════════════════════════ */

/**
 * 반영된 점수(score) 기준 랭킹 목록
 * 랜덤 지연이 완료된 pending_score → score 반영 먼저 시도
 */
async function getRanking(gameSessionId) {
  // 만료된 pending 점수 반영 (클라이언트에서 트리거)
  await reflectPendingScores(gameSessionId);

  const { data, error } = await db
    .from('participants')
    .select(`
      id,
      score,
      coins,
      profiles ( real_name )
    `)
    .eq('game_session_id', gameSessionId)
    .order('score', { ascending: false });

  return { data, error };
}

/**
 * 만료된 pending 점수를 실제 score에 반영
 * (실제로는 Supabase Edge Function / cron으로 처리하는 것이 이상적)
 */
async function reflectPendingScores(gameSessionId) {
  try {
    const now = new Date().toISOString();

    // 이 게임의 참가자 ID 목록
    const { data: parts } = await db
      .from('participants')
      .select('id, score, pending_score')
      .eq('game_session_id', gameSessionId)
      .gt('pending_score', 0);

    if (!parts?.length) return;

    for (const p of parts) {
      // 이 참가자의 만료된 score_log 합산
      const { data: logs } = await db
        .from('score_log')
        .select('id, delta')
        .eq('participant_id', p.id)
        .eq('is_pending', true)
        .lte('reflect_at', now);

      if (!logs?.length) continue;

      const delta = logs.reduce((sum, l) => sum + l.delta, 0);
      const logIds = logs.map(l => l.id);

      // score 반영 + pending_score 차감
      await db
        .from('participants')
        .update({
          score:         p.score + delta,
          pending_score: Math.max((p.pending_score || 0) - delta, 0),
        })
        .eq('id', p.id);

      // score_log is_pending = false 처리
      await db
        .from('score_log')
        .update({ is_pending: false })
        .in('id', logIds);
    }
  } catch (e) {
    // silent fail — 다음 호출에서 재시도
  }
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS — 알림
═══════════════════════════════════════════ */

/**
 * 내 알림 목록 (최근 20개)
 */
async function getNotifications(participantId) {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('participant_id', participantId)
    .order('created_at', { ascending: false })
    .limit(20);
  return { data, error };
}

/**
 * 알림 읽음 처리
 */
async function markNotificationsRead(participantId) {
  await db
    .from('notifications')
    .update({ is_read: true })
    .eq('participant_id', participantId)
    .eq('is_read', false);
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — 게임 세션 관리 (is_admin = true 계정만)
═══════════════════════════════════════════ */

/**
 * 새 게임 세션 생성
 */
async function adminCreateGameSession({ name, durationDays }) {
  return adminRequest('createGameSession', { name, durationDays });
}

/**
 * 게임 시작 (status: waiting → active) + 마니또 랜덤 배정
 */
async function adminStartGame(gameSessionId) {
  return adminRequest('startGame', { gameSessionId });
}

/**
 * 게임 종료 (status → ended)
 */
async function adminEndGame(gameSessionId) {
  return adminRequest('endGame', { gameSessionId });
}

/**
 * 관리자용 미션 추가
 */
async function adminAddMission({ gameSessionId, title, description, scoreReward, coinReward }) {
  return adminRequest('addMission', {
    gameSessionId,
    title,
    description,
    scoreReward,
    coinReward,
  });
}

/**
 * 관리자용 미션 삭제
 */
async function adminDeleteMission(missionId) {
  return adminRequest('deleteMission', { missionId });
}

/**
 * 관리자용 참가자 목록 (닉네임 + 점수 + 코인)
 * ⚠️ 실명은 표시하지 않음 (스키마 정책)
 */
async function adminGetParticipants(gameSessionId) {
  return adminRequest('getParticipants', { gameSessionId });
}

/* ═══════════════════════════════════════════════════════════
   REALTIME — 실시간 구독
═══════════════════════════════════════════ */

/**
 * 내 알림 실시간 구독
 */
function subscribeToNotifications(participantId, onNotif) {
  return db
    .channel(`notifs:${participantId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `participant_id=eq.${participantId}` },
      payload => onNotif(payload.new)
    )
    .subscribe();
}

/**
 * 랭킹 실시간 구독
 */
function subscribeToRanking(gameSessionId, onChange) {
  return db
    .channel(`ranking:${gameSessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_session_id=eq.${gameSessionId}` },
      () => onChange()
    )
    .subscribe();
}

/* ═══════════════════════════════════════════════════════════
   EXPORT — 전역 노출
═══════════════════════════════════════════ */
window.ManittoDB = {
  // Auth
  apiSignup,
  apiLogin,
  apiLogout,
  apiAdminLogin,
  apiGetAdminSession,
  getSession,
  getMyProfile,

  // Game
  getActiveGameSession,
  getMyParticipant,
  joinGame,

  // Participants
  getParticipantsWithProfiles,

  // Missions
  getMissions,
  completeMission,

  // Ranking
  getRanking,

  // Notifications
  getNotifications,
  markNotificationsRead,

  // Admin
  adminCreateGameSession,
  adminStartGame,
  adminEndGame,
  adminAddMission,
  adminDeleteMission,
  adminGetParticipants,

  // Realtime
  subscribeToNotifications,
  subscribeToRanking,

  // Direct client (고급 사용)
  client: db,
};
