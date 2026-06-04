/* ═══════════════════════════════════════════════════════════
   MANITTO — app.js  (Supabase 연동 버전)

   supabase.js → window.ManittoDB 에서 API 호출
   스키마 테이블: profiles, participants, missions,
                 mission_completions, score_log, coin_log,
                 notifications, game_sessions, manittos
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── 앱 전역 상태 ─────────────────────────────────────────── */
const App = {
  session:     null,   // Supabase Session
  profile:     null,   // profiles row
  participant: null,   // participants row (현재 게임)
  gameSession: null,   // game_sessions row
  isAdmin:     false,
  theme:       localStorage.getItem('manitto-theme') || 'light',
  realtimeSubs: [],    // Realtime 구독 핸들 모음
};

/* ─── ICONS (미션용 이모지 풀) ─────────────────────────────── */
const MISSION_ICONS = ['🎯','📸','☕','📚','🎵','🌟','💪','🏃','🎨','🌿'];
const AVATAR_COLORS = ['#30d158','#5e5ce6','#ff9f0a','#ff375f','#00c7be','#bf5af2','#ff6b35','#34aadc'];
function avatarColor(str) {
  let h = 0;
  for (let c of (str || '?')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
async function initApp() {
  setupDeclarativeEvents();
  applyTheme(App.theme);
  setLoading(true);

  // 기존 세션 복원
  try {
    const session = await ManittoDB.getSession();
    if (session) {
      App.session = session;
      App.profile = await ManittoDB.getMyProfile();
      if (App.profile) {
        await loadGameContext();
        if (App.isAdmin) {
          enterAdminApp();
        } else {
          enterUserApp();
        }
        return;
      }
    }
  } catch (e) { /* 세션 없음 */ }

  setLoading(false);
  showScreen('screen-login');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}

/* ─── 게임 컨텍스트 로드 ────────────────────────────────────── */
async function loadGameContext() {
  const adminSession = await ManittoDB.apiGetAdminSession().catch(() => ({ data: null }));
  App.isAdmin = App.profile?.is_admin || adminSession.data?.ok || false;
  if (App.profile?.is_admin && !adminSession.data?.ok && App.session?.access_token) {
    const issued = await ManittoDB.apiAdminLogin(App.session.access_token);
    App.isAdmin = !issued.error;
  }
  App.gameSession = await ManittoDB.getActiveGameSession();
  if (App.gameSession && !App.isAdmin) {
    App.participant = await ManittoDB.getMyParticipant(App.gameSession.id);
    // 게임이 waiting 또는 active 상태이고 아직 participant 없으면 자동 참가
    if (!App.participant && (App.gameSession.status === 'waiting' || App.gameSession.status === 'active')) {
      const { data } = await ManittoDB.joinGame(App.gameSession.id);
      App.participant = data;
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function applyTheme(t) {
  App.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('manitto-theme', t);
  ['theme-icon', 'login-theme-icon'].forEach(id => {
    const icon = document.getElementById(id);
    if (icon) icon.className = t === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
  });
}
function toggleTheme() { applyTheme(App.theme === 'dark' ? 'light' : 'dark'); }

/* ═══════════════════════════════════════════════════════════
   SCREEN
═══════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.body.dataset.currentScreen = id;
}
function setLoading(on) {
  // 로그인 버튼 비활성화로 로딩 표현
  ['btn-login','btn-signup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = on; el.style.opacity = on ? '.6' : '1'; }
  });
}

/* ═══════════════════════════════════════════════════════════
   AUTH — 탭 전환
═══════════════════════════════════════════ */
const AUTH_TAB_ORDER = ['login', 'signup', 'admin'];
let _authTransitionTimer = null;

function switchAuthTab(tab) {
  const tabs = document.querySelector('.auth-tabs');
  const stage = document.getElementById('auth-form-stage');
  const current = document.querySelector('.auth-form.active');
  const next = document.getElementById(`form-${tab}`);
  if (!next) return;

  const currentTab = current?.id?.replace('form-', '') || stage?.dataset.active || 'login';
  const currentIndex = AUTH_TAB_ORDER.indexOf(currentTab);
  const nextIndex = AUTH_TAB_ORDER.indexOf(tab);
  const direction = nextIndex >= currentIndex ? 'forward' : 'back';

  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  tabs?.setAttribute('data-active', tab);
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

  if (current === next) {
    stage?.setAttribute('data-active', tab);
    clearAuthErrors();
    return;
  }

  clearTimeout(_authTransitionTimer);
  document.querySelectorAll('.auth-form.leaving').forEach(f => f.classList.remove('leaving'));

  const canAnimate = stage && current && stage.getClientRects().length > 0 && stage.offsetHeight > 0;
  if (canAnimate) {
    const currentHeight = Math.max(stage.offsetHeight, current?.scrollHeight || 0);
    const nextHeight = next.scrollHeight;
    stage.dataset.active = tab;
    stage.dataset.direction = direction;
    stage.style.height = `${currentHeight}px`;
    stage.offsetHeight;

    current?.classList.add('leaving');
    current?.classList.remove('active');
    next.classList.add('active');

    requestAnimationFrame(() => {
      stage.style.height = `${nextHeight}px`;
    });

    _authTransitionTimer = setTimeout(() => {
      document.querySelectorAll('.auth-form.leaving').forEach(f => f.classList.remove('leaving'));
      stage.style.height = '';
    }, 430);
  } else {
    stage?.setAttribute('data-active', tab);
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    next.classList.add('active');
  }

  clearAuthErrors();
}
function clearAuthErrors() {
  ['login-err','signup-err','admin-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}
function setAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

/* ─── 로그인 ─────────────────────────────────────────────── */
async function tryLogin() {
  const email = document.getElementById('l-email')?.value?.trim();
  const pw    = document.getElementById('l-pw')?.value;
  if (!email || !pw) { setAuthError('login-err', '이메일과 비밀번호를 입력해주세요.'); return; }

  setLoading(true);
  const { data, error } = await ManittoDB.apiLogin({ email, password: pw });
  setLoading(false);

  if (error) { setAuthError('login-err', error.message || '로그인에 실패했습니다.'); return; }

  App.session = data.session;
  App.profile = data.profile;
  await loadGameContext();
  if (App.isAdmin) {
    const adminSession = await ManittoDB.apiAdminLogin(App.session?.access_token);
    if (adminSession.error) {
      setAuthError('login-err', adminSession.error.message || '관리자 권한 확인에 실패했습니다.');
      await ManittoDB.apiLogout();
      return;
    }
    enterAdminApp();
    return;
  }
  enterUserApp();
}

/* ─── 회원가입 ───────────────────────────────────────────── */
async function trySignup() {
  const email    = document.getElementById('s-email')?.value?.trim();
  const realName = document.getElementById('s-name')?.value?.trim();
  const nickname = document.getElementById('s-nick')?.value?.trim();
  const pw       = document.getElementById('s-pw')?.value;

  if (!email || !realName || !nickname || !pw) {
    setAuthError('signup-err', '모든 항목을 입력해주세요.'); return;
  }
  if (pw.length < 6) {
    setAuthError('signup-err', '비밀번호는 6자 이상이어야 합니다.'); return;
  }

  setLoading(true);
  const { data, error } = await ManittoDB.apiSignup({ email, password: pw, realName, nickname });
  setLoading(false);

  if (error) { setAuthError('signup-err', error.message || '가입에 실패했습니다.'); return; }

  App.session = await ManittoDB.getSession();
  App.profile = data.profile;
  await loadGameContext();
  showToast('회원가입 완료! 환영합니다 🎉');
  enterUserApp();
}

/* ─── 관리자 로그인 ──────────────────────────────────────── */
async function tryAdminLogin() {
  const email = document.getElementById('a-email')?.value?.trim();
  const pw = document.getElementById('a-pw')?.value;
  if (!email || !pw) { setAuthError('admin-err', '관리자 이메일과 비밀번호를 입력해주세요.'); return; }

  setLoading(true);
  const { data, error } = await ManittoDB.apiLogin({ email, password: pw });
  if (error) {
    setLoading(false);
    setAuthError('admin-err', error.message || '관리자 로그인에 실패했습니다.');
    return;
  }

  const adminSession = await ManittoDB.apiAdminLogin(data.session?.access_token);
  setLoading(false);
  if (adminSession.error) {
    await ManittoDB.apiLogout();
    setAuthError('admin-err', adminSession.error.message || '관리자 권한이 없는 계정입니다.');
    return;
  }

  App.isAdmin = true;
  App.session = data.session;
  App.profile = data.profile || { real_name: '관리자', nickname: 'admin', is_admin: true };

  // Supabase 연결된 경우 게임 세션 로드 시도 (실패해도 UI 진입)
  try { App.gameSession = await ManittoDB.getActiveGameSession(); } catch (e) {}

  enterAdminApp();
}

/* ─── 로그아웃 ───────────────────────────────────────────── */
function confirmLogout() {
  openModal('confirm', {
    title: '로그아웃',
    desc: '정말 로그아웃 하시겠습니까?',
    btnText: '로그아웃', btnClass: 'danger',
    onConfirm: doLogout,
  });
}
function resetUserNavigation() {
  document.querySelectorAll('#screen-user .page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home')?.classList.add('active');
  document.querySelectorAll('#user-tabbar .tab-item').forEach(t => t.classList.remove('active'));
  document.querySelector('#user-tabbar .tab-item')?.classList.add('active');
}
function resetAdminNavigation() {
  document.querySelectorAll('#screen-admin .page').forEach(p => p.classList.remove('active'));
  document.getElementById('apage-dash')?.classList.add('active');
  document.querySelectorAll('#admin-tabbar .tab-item').forEach(t => t.classList.remove('active'));
  document.querySelector('#admin-tabbar .tab-item')?.classList.add('active');
}
function resetUiForLogout() {
  resetUserNavigation();
  resetAdminNavigation();
  closeNotifPanel();
  switchAuthTab('login');
}
async function doLogout() {
  // Realtime 구독 해제
  App.realtimeSubs.forEach(sub => ManittoDB.client.removeChannel(sub));
  App.realtimeSubs = [];

  await ManittoDB.apiLogout();
  App.session = App.profile = App.participant = App.gameSession = null;
  App.isAdmin = false;
  closeModal();
  resetUiForLogout();
  clearAuthErrors();
  setLoading(false);
  showScreen('screen-login');
}

/* ═══════════════════════════════════════════════════════════
   USER APP
═══════════════════════════════════════════ */
async function enterUserApp() {
  showScreen('screen-user');
  renderUserHome();

  // 탭별 데이터 로드
  await Promise.all([
    loadMissions(),
    loadRanking(),
  ]);
  loadNotifications();
  setupRealtime();
  setLoading(false);
}

/* ─── HOME ───────────────────────────────────────────────── */
function renderUserHome() {
  const p = App.participant;
  const profile = App.profile;
  if (!profile) return;

  setText('u-greeting', `안녕하세요, ${profile.real_name}님`);
  setText('h-name', profile.real_name);
  setText('h-score', p?.score ?? 0);
  setText('h-coin',  p?.coins ?? 0);

  // 남은 기간
  const gs = App.gameSession;
  if (gs?.started_at && gs?.duration_days) {
    const end  = new Date(gs.started_at);
    end.setDate(end.getDate() + gs.duration_days);
    const diff = Math.ceil((end - Date.now()) / 86400000);
    setText('h-timer', diff > 0 ? `D-${diff}` : '종료');
  } else {
    setText('h-timer', gs?.status === 'waiting' ? '대기 중' : 'D-?');
  }
}

/* ─── 내 미션 완료 현황 포함 홈 순위 ──────────────────────── */
async function refreshHomeStats() {
  if (!App.gameSession || !App.participant) return;
  // 최신 participant 정보 갱신
  App.participant = await ManittoDB.getMyParticipant(App.gameSession.id);

  // 내 순위 계산
  const { data: ranking } = await ManittoDB.getRanking(App.gameSession.id);
  const myRank = ranking?.findIndex(r => r.id === App.participant?.id);
  setText('h-rank', myRank !== undefined && myRank >= 0 ? `#${myRank + 1}` : '-');
  renderUserHome();
}

/* ═══════════════════════════════════════════════════════════
   MISSIONS
═══════════════════════════════════════════ */
let _missions = [];
let _missionFilter = 'active';

async function loadMissions() {
  const container = document.getElementById('mission-list-container');
  if (!container || !App.gameSession) return;

  renderMissionSkeleton(container);

  const { data, error } = await ManittoDB.getMissions(
    App.gameSession.id,
    App.participant?.id
  );

  if (error) {
    container.innerHTML = errorState('미션을 불러오지 못했습니다.');
    return;
  }

  _missions = data || [];
  renderMissions(_missionFilter);
}

function filterMissions(f, btn) {
  _missionFilter = f;
  btn.closest('.segment-ctrl').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMissions(f);
}

function updateMissionSummary() {
  const active = _missions.filter(m => !m.completed).length;
  const done = _missions.filter(m => m.completed).length;
  setText('mission-active-count', active);
  setText('mission-done-count', done);
  setText('mission-total-count', _missions.length);
}

function missionEmptyState(filter) {
  const title = filter === 'done' ? '완료한 미션이 없습니다' : '진행 중인 미션이 없습니다';
  const desc = filter === 'done'
    ? '아직 완료 처리된 미션이 없습니다.'
    : '새 미션이 열리면 이곳에 바로 표시됩니다.';

  return `
    <div class="mission-empty empty-state">
      <div class="empty-state-icon"><i class="ti ti-target-arrow"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-desc">${desc}</div>
    </div>`;
}

function renderMissions(filter = 'active') {
  const container = document.getElementById('mission-list-container');
  if (!container) return;

  updateMissionSummary();

  let list = _missions;
  if (filter === 'active') list = _missions.filter(m => !m.completed);
  if (filter === 'done')   list = _missions.filter(m => m.completed);

  if (!list.length) {
    container.innerHTML = missionEmptyState(filter);
    return;
  }

  container.innerHTML = '<div class="card" style="padding:0">' +
    list.map((m, i) => {
      const icon = MISSION_ICONS[i % MISSION_ICONS.length];
      const bg   = `rgba(${hexToRgb(AVATAR_COLORS[i % AVATAR_COLORS.length])},0.12)`;
      return `
      <div class="mission-item">
        <div class="mission-header">
          <div class="mission-icon" style="background:${bg}">${icon}</div>
          <div style="flex:1">
            <div class="mission-title">${esc(m.title)}</div>
            <div class="mission-desc">${esc(m.description || '')}</div>
          </div>
        </div>
        <div class="mission-rewards">
          <div class="reward-chip">🏅 +${m.score_reward}점</div>
          <div class="reward-chip">🪙 +${m.coin_reward}코인</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          ✨ 엔딩 크레딧에 선정될 수 있습니다.
        </div>
        ${m.completed
          ? `<button class="btn-complete done" disabled>완료됨 ✓</button>`
          : `<button class="btn-complete active" data-action="complete-mission" data-mission-id="${escAttr(m.id)}" data-title="${escAttr(m.title)}" data-score="${Number(m.score_reward) || 0}" data-coin="${Number(m.coin_reward) || 0}">완료하기</button>`
        }
      </div>`;
    }).join('') + '</div>';
}

function confirmCompleteMission(missionId, title, score, coin) {
  openModal('confirm', {
    title: '미션을 완료하셨나요?',
    desc:  `완료 시 즉시 <b>${coin}코인</b>이 지급되고,<br><b>${score}점</b>은 잠시 후 랭킹에 반영됩니다.`,
    extra: `
      <div style="margin-bottom:16px">
        <div class="field-label">인증 사진 (선택)</div>
        <div id="upload-preview" style="border:1px dashed var(--border2);border-radius:10px;padding:18px;text-align:center;color:var(--text3);font-size:13px;cursor:pointer" data-action="trigger-photo-input">
          <i class="ti ti-camera-plus" style="font-size:28px;display:block;margin-bottom:5px"></i>사진 추가 (선택사항)
        </div>
        <input type="file" id="photo-input" accept="image/*" style="display:none" data-onchange="previewPhoto(this)">
      </div>
      <div style="margin-bottom:16px">
        <div class="field-label">인증 설명 (선택)</div>
        <textarea class="field-textarea" id="mission-desc-input" rows="2" placeholder="미션 인증 설명을 남겨보세요..."></textarea>
      </div>`,
    btnText: '완료하기', btnClass: 'confirm',
    onConfirm: () => doCompleteMission(missionId, score, coin),
  });
}

function previewPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('upload-preview');
    if (preview) preview.innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:8px;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

async function doCompleteMission(missionId, score, coin) {
  if (!App.participant) { showToast('게임에 참가하지 않았습니다.'); return; }
  const descVal = document.getElementById('mission-desc-input')?.value?.trim() || null;

  showToast('⏳ 처리 중...');

  const { data, error } = await ManittoDB.completeMission({
    missionId,
    participantId: App.participant.id,
    gameSessionId: App.gameSession.id,
    description:   descVal,
    scoreReward:   score,
    coinReward:    coin,
  });

  if (error) { showToast('❌ ' + (error.message || '오류가 발생했습니다.')); return; }

  // 로컬 상태 즉시 갱신
  const m = _missions.find(m => m.id === missionId);
  if (m) m.completed = true;
  if (App.participant) {
    App.participant.coins = (App.participant.coins || 0) + coin;
    App.participant.pending_score = (App.participant.pending_score || 0) + score;
  }

  renderMissions(_missionFilter);
  renderUserHome();
  setText('m-coin', App.participant?.coins ?? 0);
  showToast(`🎉 완료! +${coin}코인 지급 / +${score}점 곧 반영`);

  // 홈 통계 백그라운드 갱신
  setTimeout(refreshHomeStats, 1000);
}

/* ═══════════════════════════════════════════════════════════
   RANKING
═══════════════════════════════════════════ */
async function loadRanking() {
  const el = document.getElementById('ranking-list');
  if (!el || !App.gameSession) return;

  el.innerHTML = skeletonRows(5);

  const { data, error } = await ManittoDB.getRanking(App.gameSession.id);
  if (error || !data) { el.innerHTML = errorState('랭킹을 불러오지 못했습니다.'); return; }

  renderRankingList(data);
  populateGuessSelects(data);
}

function renderRankingList(data) {
  const el = document.getElementById('ranking-list');
  if (!el) return;

  if (!data.length) { el.innerHTML = emptyState('아직 랭킹이 없습니다', '🏆'); return; }

  const medalClass = ['gold', 'silver', 'bronze'];
  const medals     = ['🥇', '🥈', '🥉'];

  el.innerHTML = data.map((p, i) => {
    const name  = p.profiles?.real_name || '참가자';
    const isMe  = p.id === App.participant?.id;
    const color = avatarColor(name);
    return `
    <div class="rank-item ${isMe ? 'me' : ''}">
      <div class="rank-num ${medalClass[i] || ''}">${medals[i] || i + 1}</div>
      <div class="rank-avatar" style="background:${color}">${name[0]}</div>
      <div class="rank-info">
        <div class="rank-name">${esc(name)}${isMe ? '<span class="rank-me-tag">← 나</span>' : ''}</div>
      </div>
      <div>
        <div class="rank-score">${p.score}점</div>
      </div>
    </div>`;
  }).join('');
}

function populateGuessSelects(data) {
  const target = document.getElementById('guess-target');
  const answer = document.getElementById('guess-answer');
  if (!target || !answer) return;

  const others = data.filter(p => p.id !== App.participant?.id);
  const opts = others.map(p => {
    const name = p.profiles?.real_name || '참가자';
    return `<option value="${p.id}">${esc(name)}</option>`;
  }).join('');

  target.innerHTML = '<option value="">대상 선택 (누구의 마니또인지)</option>' + opts;
  answer.innerHTML = '<option value="">마니또라고 생각하는 사람</option>' + opts;
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════ */
async function loadNotifications() {
  if (!App.participant) return;
  const { data } = await ManittoDB.getNotifications(App.participant.id);
  renderNotifBadge(data);
  renderHomeNotifs(data);
  renderNotifPanelList(data);
}

function renderNotifBadge(data) {
  const unread = (data || []).filter(n => !n.is_read).length;
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = unread ? 'block' : 'none';
  setText('h-notif-count', unread);
  const badge = document.getElementById('h-notif-badge');
  if (badge) badge.style.display = unread ? 'block' : 'none';
}

function renderHomeNotifs(data) {
  const el = document.getElementById('home-notif-list');
  if (!el) return;
  const list = (data || []).slice(0, 5);
  if (!list.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:14px">알림이 없습니다</div>';
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="notif-item">
      <div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
      <div class="list-info">
        <div class="notif-text">${esc(n.message || notifMessage(n.type))}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');
}

function notifMessage(type) {
  const map = {
    letter_received:            '✉️ 새로운 편지가 도착했습니다',
    deduction_success:          '🔍 추리에 성공했습니다!',
    deduction_fail:             '🔍 추리에 실패했습니다',
    share_request:              '🎬 편지 공유 요청이 들어왔습니다',
    share_approved:             '🎬 편지 공유가 승인되었습니다',
    share_rejected:             '🎬 편지 공유가 거절되었습니다',
    megaphone_like:             '👍 확성기에 좋아요가 달렸습니다',
    megaphone_dislike:          '👎 확성기에 싫어요가 달렸습니다',
    achievement_earned:         '🏆 새 업적을 획득했습니다!',
    mission_proposal_approved:  '✅ 미션 제안이 승인되었습니다',
    mission_proposal_rejected:  '❌ 미션 제안이 거절되었습니다',
  };
  return map[type] || '🔔 새 알림';
}

function renderNotifPanelList(data) {
  const el = document.getElementById('notif-panel-list');
  if (!el) return;
  el.innerHTML = (data || []).map(n => `
    <div class="notif-item">
      <div class="notif-dot read"></div>
      <div class="list-info">
        <div class="notif-text">${esc(n.message || notifMessage(n.type))}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join('') || '<div style="padding:24px;text-align:center;color:var(--text3)">알림이 없습니다</div>';
}

async function openNotifPanel() {
  document.getElementById('notif-panel')?.classList.add('open');
  document.getElementById('notif-overlay')?.classList.add('open');
  if (App.participant) {
    await ManittoDB.markNotificationsRead(App.participant.id);
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = 'none';
  }
}
function closeNotifPanel() {
  document.getElementById('notif-panel')?.classList.remove('open');
  document.getElementById('notif-overlay')?.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════
   REALTIME 구독
═══════════════════════════════════════════ */
function setupRealtime() {
  if (!App.participant || !App.gameSession) return;

  // 알림 구독
  const notifSub = ManittoDB.subscribeToNotifications(App.participant.id, (notif) => {
    showToast('🔔 ' + notifMessage(notif.type));
    loadNotifications();
  });
  App.realtimeSubs.push(notifSub);

  // 랭킹 변경 구독
  const rankSub = ManittoDB.subscribeToRanking(App.gameSession.id, () => {
    loadRanking();
    refreshHomeStats();
  });
  App.realtimeSubs.push(rankSub);
}

/* ═══════════════════════════════════════════════════════════
   ADMIN APP
═══════════════════════════════════════════ */
async function enterAdminApp() {
  showScreen('screen-admin');
  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminMissions(),
  ]);
  setLoading(false);
}

async function loadAdminStats() {
  const gs = App.gameSession;
  setText('a-stat-status', gs ? { waiting:'대기 중', active:'진행 중', ended:'종료됨' }[gs.status] || '-' : '없음');
  const statusEl = document.getElementById('a-stat-status');
  if (statusEl) statusEl.className = 'stat-val ' + (gs?.status === 'active' ? 'green' : '');

  const days = gs?.duration_days ?? '-';
  const started = gs?.started_at ? new Date(gs.started_at) : null;
  if (started && gs?.duration_days) {
    const end  = new Date(started);
    end.setDate(end.getDate() + gs.duration_days);
    const diff = Math.ceil((end - Date.now()) / 86400000);
    setText('a-stat-days', diff > 0 ? `D-${diff}` : '종료');
  } else {
    setText('a-stat-days', `${days}일`);
  }

  if (gs) {
    const { data: parts } = await ManittoDB.adminGetParticipants(gs.id);
    setText('a-stat-users', parts?.length ?? 0);
    setText('a-user-count', `${parts?.length ?? 0}명`);

    const { data: missions } = await ManittoDB.getMissions(gs.id, null);
    setText('a-stat-missions', missions?.length ?? 0);
  }
}

async function loadAdminUsers(filter = '') {
  const el = document.getElementById('admin-user-list');
  if (!el || !App.gameSession) return;

  el.innerHTML = skeletonRows(4);
  const { data, error } = await ManittoDB.adminGetParticipants(App.gameSession.id);
  if (error || !data) { el.innerHTML = errorState('참가자 목록을 불러오지 못했습니다.'); return; }

  const list = filter
    ? data.filter(p => p.profiles?.nickname?.includes(filter))
    : data;

  if (!list.length) { el.innerHTML = emptyState('참가자가 없습니다', '👤'); return; }

  el.innerHTML = list.map(p => {
    const nick  = p.profiles?.nickname || '(닉네임 없음)';
    const color = avatarColor(nick);
    return `
    <div class="list-item">
      <div class="list-avatar" style="background:${color}">${nick[0]}</div>
      <div class="list-info">
        <div class="list-name">${esc(nick)}</div>
        <div class="list-badges">
          <span class="badge badge-purple">🏅 ${p.score}점</span>
          <span class="badge badge-amber">🪙 ${p.coins}코인</span>
          <span class="badge badge-green">대기: ${p.pending_score || 0}점</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterUsers(val) { loadAdminUsers(val); }

async function loadAdminMissions() {
  const el = document.getElementById('admin-mission-list');
  if (!el || !App.gameSession) return;

  el.innerHTML = skeletonRows(3);
  const { data, error } = await ManittoDB.getMissions(App.gameSession.id, null);
  if (error || !data) { el.innerHTML = errorState('미션을 불러오지 못했습니다.'); return; }

  if (!data.length) { el.innerHTML = emptyState('등록된 미션이 없습니다', '🎯'); return; }

  el.innerHTML = data.map((m, i) => {
    const icon = MISSION_ICONS[i % MISSION_ICONS.length];
    return `
    <div class="card" style="padding:14px 16px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="font-size:24px">${icon}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">${esc(m.title)}</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${esc(m.description || '')}</div>
          <div style="display:flex;gap:6px">
            <span class="badge badge-purple">+${m.score_reward}점</span>
            <span class="badge badge-amber">+${m.coin_reward}코인</span>
            <span class="badge ${m.is_active ? 'badge-green' : 'badge-red'}">${m.is_active ? '활성' : '비활성'}</span>
          </div>
        </div>
        <button class="btn-chip danger" data-action="admin-delete-mission" data-mission-id="${escAttr(m.id)}">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function adminDeleteMission(missionId) {
  openModal('confirm', {
    title: '미션 비활성화',
    desc: '이 미션을 비활성화하시겠습니까?',
    btnText: '비활성화', btnClass: 'danger',
    onConfirm: async () => {
      const { error } = await ManittoDB.adminDeleteMission(missionId);
      if (error) { showToast('오류: ' + error.message); return; }
      showToast('미션이 비활성화되었습니다.');
      loadAdminMissions();
      loadAdminStats();
    },
  });
}

function handleToggle(type, el) {
  showToast(el.checked ? '활성화되었습니다' : '비활성화되었습니다');
}

async function adminAction(type) {
  const gs = App.gameSession;
  if (!gs && type !== 'create') {
    showToast('활성 게임 세션이 없습니다.');
    return;
  }

  const actions = {
    start: {
      title: '게임 시작 및 마니또 배정',
      desc: '모든 참가자를 랜덤 순환 구조로 배정합니다. 배정 후에는 변경이 불가합니다.',
      btnText: '배정 시작', btnClass: 'success',
      onConfirm: async () => {
        const { data, error } = await ManittoDB.adminStartGame(gs.id);
        if (error) { showToast('오류: ' + error.message); return; }
        App.gameSession = data;
        await loadAdminStats();
        showToast('마니또 배정 완료! 🎯');
      },
    },
    end: {
      title: '게임 종료 및 엔딩 크레딧',
      desc: '게임을 종료합니다. 마니또 관계가 공개됩니다.',
      btnText: '게임 종료', btnClass: 'danger',
      onConfirm: async () => {
        const { data, error } = await ManittoDB.adminEndGame(gs.id);
        if (error) { showToast('오류: ' + error.message); return; }
        App.gameSession = data;
        await loadAdminStats();
        showToast('게임이 종료되었습니다 🎬');
      },
    },
    ending: {
      title: '엔딩 크레딧 미리보기',
      desc: '엔딩 크레딧 연출을 미리 확인합니다.',
      btnText: '재생', btnClass: 'confirm',
      onConfirm: launchEnding,
    },
    create: {
      title: '새 게임 세션 생성',
      desc: '새 게임 세션을 생성합니다.',
      extra: `
        <div class="field-group"><label class="field-label">게임 이름</label>
          <input class="field-input" id="gs-name" placeholder="예: 2024 가을 마니또"></div>
        <div class="field-group"><label class="field-label">진행 기간 (일)</label>
          <input class="field-input" id="gs-days" type="number" placeholder="7" value="7"></div>`,
      btnText: '생성', btnClass: 'confirm',
      onConfirm: async () => {
        const name = document.getElementById('gs-name')?.value?.trim();
        const days = parseInt(document.getElementById('gs-days')?.value) || 7;
        if (!name) { showToast('게임 이름을 입력해주세요.'); return; }
        const { data, error } = await ManittoDB.adminCreateGameSession({ name, durationDays: days });
        if (error) { showToast('오류: ' + error.message); return; }
        App.gameSession = data;
        await loadAdminStats();
        showToast('게임 세션이 생성되었습니다 🎮');
      },
    },
  };

  const a = actions[type];
  if (!a) return;

  openModal('confirm', a);
}

function openAdminModal(type) {
  if (type === 'add-mission') {
    showModalRaw(`
      <div class="modal-title">새 미션 추가</div>
      <div class="field-group">
        <label class="field-label">미션 제목</label>
        <input class="field-input" id="nm-title" placeholder="미션 제목">
      </div>
      <div class="field-group">
        <label class="field-label">미션 설명</label>
        <textarea class="field-textarea" id="nm-desc" rows="2" placeholder="미션 설명"></textarea>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1" class="field-group">
          <label class="field-label">점수 보상</label>
          <input class="field-input" id="nm-score" type="number" placeholder="50" value="50">
        </div>
        <div style="flex:1" class="field-group">
          <label class="field-label">코인 보상</label>
          <input class="field-input" id="nm-coin" type="number" placeholder="30" value="30">
        </div>
      </div>
      <div class="modal-btns">
        <button class="modal-btn cancel" data-onclick="closeModal()">취소</button>
        <button class="modal-btn confirm" data-onclick="addAdminMission()">추가하기</button>
      </div>`);
  }
}

async function addAdminMission() {
  if (!App.gameSession) { showToast('활성 게임 세션이 없습니다.'); return; }
  const title = document.getElementById('nm-title')?.value?.trim();
  const desc  = document.getElementById('nm-desc')?.value?.trim();
  const score = parseInt(document.getElementById('nm-score')?.value) || 0;
  const coin  = parseInt(document.getElementById('nm-coin')?.value) || 0;
  if (!title) { showToast('제목을 입력해주세요.'); return; }

  const { data, error } = await ManittoDB.adminAddMission({
    gameSessionId: App.gameSession.id,
    title, description: desc, scoreReward: score, coinReward: coin,
  });
  if (error) { showToast('오류: ' + error.message); return; }

  closeModal();
  loadAdminMissions();
  loadAdminStats();
  showToast('미션이 추가되었습니다 🎯');
}

/* ═══════════════════════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════ */
function goPage(pageId, el) {
  document.querySelectorAll('#screen-user .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#user-tabbar .tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
  if (el) {
    el.classList.add('active');
  } else {
    const map = { 'page-home':0, 'page-missions':1, 'page-letters':2, 'page-rank':3, 'page-mega':4 };
    if (map[pageId] !== undefined) {
      document.querySelectorAll('#user-tabbar .tab-item')[map[pageId]]?.classList.add('active');
    }
  }
  // 해당 페이지 진입 시 데이터 갱신
  if (pageId === 'page-missions') loadMissions();
  if (pageId === 'page-rank')     loadRanking();
}

function goAdminPage(pageId, el) {
  document.querySelectorAll('#screen-admin .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#admin-tabbar .tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
  if (el) el.classList.add('active');
  if (pageId === 'apage-users')    loadAdminUsers();
  if (pageId === 'apage-missions') loadAdminMissions();
}

/* ═══════════════════════════════════════════════════════════
   ENDING CREDITS (로컬 연출 — DB 연결은 ending_credits 테이블 참조)
═══════════════════════════════════════════ */
let endingStep = 0;
const ENDING_PARTS = [
  renderEndingIntro,
  renderEndingPart1,
  renderEndingPart2,
  renderEndingPart3,
];

function launchEnding() {
  closeModal();
  endingStep = 0;
  generateStars();
  showScreen('screen-ending');
  renderEndingStep();
}
function generateStars() {
  const container = document.getElementById('ending-stars');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.style.cssText = `position:absolute;width:${Math.random()*2+1}px;height:${Math.random()*2+1}px;
      background:rgba(255,255,255,${Math.random()*.7+.2});border-radius:50%;
      left:${Math.random()*100}%;top:${Math.random()*100}%;
      animation:twinkle ${Math.random()*3+2}s ease-in-out infinite;animation-delay:${Math.random()*3}s`;
    container.appendChild(s);
  }
}
function renderEndingStep() {
  if (endingStep >= ENDING_PARTS.length) { closeEnding(); return; }
  ENDING_PARTS[endingStep]();
}
function nextEndingStep() { endingStep++; renderEndingStep(); }
function closeEnding() {
  document.getElementById('screen-ending')?.classList.remove('active');
  showScreen(App.isAdmin ? 'screen-admin' : 'screen-user');
}
function endingHTML(partLabel, title, subtitle, extra, nextLabel = '다음') {
  document.getElementById('ending-content').innerHTML = `
    <div style="animation:fadeUp .5s ease">
      <div class="ending-part-label">${partLabel}</div>
      <div class="ending-title">${title}</div>
      <div class="ending-subtitle">${subtitle}</div>
      ${extra}
      <button class="ending-btn" data-onclick="nextEndingStep()">
        ${nextLabel} <i class="ti ti-arrow-right"></i>
      </button>
    </div>`;
}
function renderEndingIntro() {
  endingHTML('MANITTO', '게임이 끝났습니다.', '함께한 모든 순간이 추억이 됩니다.',
    `<div style="font-size:60px;margin-bottom:32px;animation:fadeUp .6s .2s ease both">🎬</div>`,
    '엔딩 크레딧 시작');
}
function renderEndingPart1() {
  endingHTML('1부', '명장면 갤러리', '함께한 미션들의 특별한 순간', `
    <div style="margin:0 0 28px">
      ${(_missions.slice(0,2)).map((m,i) => `
        <div class="ending-card" style="animation-delay:${i*.12}s">
          <div class="ending-card-title">🎯 ${esc(m.title)}</div>
          <div class="ending-card-body">${esc(m.description || '')}</div>
        </div>`).join('') || '<div class="ending-card"><div class="ending-card-body">미션 데이터 없음</div></div>'}
    </div>`);
}
function renderEndingPart2() {
  const gs = App.gameSession;
  const status = gs?.status === 'ended' ? '공개됨' : '게임 종료 후 공개';
  endingHTML('2부', '마니또 관계', status, `
    <div style="font-size:50px;margin:20px 0 28px">🔓</div>`);
}
function renderEndingPart3() {
  const p = App.participant;
  endingHTML('7부', '나의 결과', '', `
    <div style="margin:0 0 28px">
      <div style="font-size:18px;color:rgba(255,255,255,.7);margin-bottom:8px">최종 점수</div>
      <div style="font-size:52px;font-weight:800;color:#fff;margin-bottom:28px">${p?.score ?? 0}점</div>
    </div>`, '종료');
}

/* ═══════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════ */
let _modalConfirmFn = null;

function openModal(type, opts = {}) {
  if (type === 'confirm') {
    _modalConfirmFn = opts.onConfirm;
    showModalRaw(`
      <div class="modal-title">${opts.title || ''}</div>
      <div class="modal-desc">${opts.desc || ''}</div>
      ${opts.extra || ''}
      <div class="modal-btns">
        <button class="modal-btn cancel" data-onclick="closeModal()">취소</button>
        <button class="modal-btn ${opts.btnClass || 'confirm'}" data-onclick="handleModalConfirm()">
          ${opts.btnText || '확인'}
        </button>
      </div>`);
  }
}

async function handleModalConfirm() {
  if (_modalConfirmFn) {
    await _modalConfirmFn();
    _modalConfirmFn = null;
  }
  closeModal();
}

function showModalRaw(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay')?.classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open');
  _modalConfirmFn = null;
}
function closeModalIfBg(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000)   return '방금';
  if (diff < 3600000) return `${Math.floor(diff/60000)}분 전`;
  if (diff < 86400000)return `${Math.floor(diff/3600000)}시간 전`;
  return `${Math.floor(diff/86400000)}일 전`;
}
function skeletonRows(n) {
  return Array(n).fill(0).map(() => `
    <div class="list-item">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--bg2);flex-shrink:0"></div>
      <div style="flex:1">
        <div style="height:14px;width:60%;background:var(--bg2);border-radius:4px;margin-bottom:6px"></div>
        <div style="height:12px;width:40%;background:var(--bg2);border-radius:4px"></div>
      </div>
    </div>`).join('');
}
function renderMissionSkeleton(container) {
  container.innerHTML = '<div class="card" style="padding:0">' + Array(3).fill(0).map(() => `
    <div class="mission-item">
      <div style="height:16px;width:50%;background:var(--bg2);border-radius:4px;margin-bottom:8px"></div>
      <div style="height:12px;width:80%;background:var(--bg2);border-radius:4px;margin-bottom:16px"></div>
      <div style="height:36px;background:var(--bg2);border-radius:10px"></div>
    </div>`).join('') + '</div>';
}
function emptyState(msg, icon = '📭') {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${msg}</div>
  </div>`;
}
function errorState(msg) {
  return `<div style="padding:32px;text-align:center;color:var(--red)">
    <i class="ti ti-alert-circle" style="font-size:32px;display:block;margin-bottom:8px"></i>
    <div style="font-size:14px">${msg}</div>
    <button class="btn-ghost-sm" style="margin-top:12px" data-onclick="location.reload()">새로고침</button>
  </div>`;
}

function setupDeclarativeEvents() {
  if (window.__manittoEventsBound) return;
  window.__manittoEventsBound = true;

  document.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-action], [data-onclick]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    if (action) {
      handleDataAction(action, event, actionEl);
      return;
    }

    runDeclarativeCommand(actionEl.dataset.onclick, event, actionEl);
  });

  document.addEventListener('keydown', event => {
    const command = event.target.dataset?.onkeydown;
    if (command) runDeclarativeCommand(command, event, event.target);
  });

  document.addEventListener('change', event => {
    const command = event.target.dataset?.onchange;
    if (command) runDeclarativeCommand(command, event, event.target);
  });

  document.addEventListener('input', event => {
    const command = event.target.dataset?.oninput;
    if (command) runDeclarativeCommand(command, event, event.target);
  });
}

function handleDataAction(action, event, el) {
  if (action === 'complete-mission') {
    confirmCompleteMission(
      el.dataset.missionId,
      el.dataset.title || '',
      Number(el.dataset.score) || 0,
      Number(el.dataset.coin) || 0
    );
    return;
  }

  if (action === 'trigger-photo-input') {
    document.getElementById('photo-input')?.click();
    return;
  }

  if (action === 'admin-delete-mission') {
    adminDeleteMission(el.dataset.missionId);
  }
}

function runDeclarativeCommand(command, event, el) {
  if (!command) return;

  if (command === 'tryLogin()') return tryLogin();
  if (command === 'trySignup()') return trySignup();
  if (command === 'tryAdminLogin()') return tryAdminLogin();
  if (command === 'confirmLogout()') return confirmLogout();
  if (command === 'openNotifPanel()') return openNotifPanel();
  if (command === 'closeNotifPanel()') return closeNotifPanel();
  if (command === 'toggleTheme()') return toggleTheme();
  if (command === 'closeEnding()') return closeEnding();
  if (command === 'closeModal()') return closeModal();
  if (command === 'handleModalConfirm()') return handleModalConfirm();
  if (command === 'addAdminMission()') return addAdminMission();
  if (command === 'launchEnding()') return launchEnding();
  if (command === 'nextEndingStep()') return nextEndingStep();
  if (command === 'location.reload()') return location.reload();
  if (command === 'previewPhoto(this)') return previewPhoto(el);
  if (command === 'closeModalIfBg(event)') return closeModalIfBg(event);

  if (command === 'tryGuess()') {
    if (typeof tryGuess === 'function') return tryGuess();
    return showToast('추리 기능은 준비 중입니다.');
  }

  const switchAuth = command.match(/^switchAuthTab\('([^']+)'\)$/);
  if (switchAuth) return switchAuthTab(switchAuth[1]);

  const goPageMatch = command.match(/^goPage\('([^']+)'(?:,this)?\)$/);
  if (goPageMatch) return goPage(goPageMatch[1], command.includes(',this') ? el : null);

  const goAdminPageMatch = command.match(/^goAdminPage\('([^']+)'(?:,this)?\)$/);
  if (goAdminPageMatch) return goAdminPage(goAdminPageMatch[1], command.includes(',this') ? el : null);

  const filterMissionMatch = command.match(/^filterMissions\('([^']+)',this\)$/);
  if (filterMissionMatch) return filterMissions(filterMissionMatch[1], el);

  const filterMegaMatch = command.match(/^filterMega\('([^']+)',this\)$/);
  if (filterMegaMatch) {
    if (typeof filterMega === 'function') return filterMega(filterMegaMatch[1], el);
    return showToast('확성기 필터 기능은 준비 중입니다.');
  }

  const openModalMatch = command.match(/^openModal\('([^']+)'\)$/);
  if (openModalMatch) return openModal(openModalMatch[1]);

  const adminActionMatch = command.match(/^adminAction\('([^']+)'\)$/);
  if (adminActionMatch) return adminAction(adminActionMatch[1]);

  const openAdminModalMatch = command.match(/^openAdminModal\('([^']+)'\)$/);
  if (openAdminModalMatch) return openAdminModal(openAdminModalMatch[1]);

  const handleToggleMatch = command.match(/^handleToggle\('([^']+)',this\)$/);
  if (handleToggleMatch) return handleToggle(handleToggleMatch[1], el);

  if (command === 'filterUsers(this.value)') return filterUsers(el.value);

  if (command === "if(event.key==='Enter')tryLogin()") {
    if (event.key === 'Enter') return tryLogin();
    return;
  }

  if (command === "if(event.key==='Enter')tryAdminLogin()") {
    if (event.key === 'Enter') return tryAdminLogin();
  }
}

// Star twinkle animation
const styleEl = document.createElement('style');
styleEl.textContent = `@keyframes twinkle{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}`;
document.head.appendChild(styleEl);
