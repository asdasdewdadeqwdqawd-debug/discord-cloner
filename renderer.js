const state = {
  me: null,
  guilds: [],
  currentGuild: null,
  currentChannel: null,
  members: [],
  botPerms: null,
  pendingFile: null
};
const $ = (id) => document.getElementById(id);

let toastTimer = null;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('active');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('active'), 3000);
}

// ============================================================
// LOGIN
// ============================================================
$('loginBtn').onclick = doLogin;
$('token').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const token = $('token').value.trim();
  if (!token) return;
  $('error').textContent = 'connecting…';
  $('loginBtn').disabled = true;
  try {
    const res = await window.rat.login(token);
    state.guilds = res.guilds;
    state.me = res.user;
    enterApp();
  } catch (e) {
    console.error('[login]', e);
    $('error').textContent = e.message;
  } finally {
    $('loginBtn').disabled = false;
  }
}

function enterApp() {
  $('login').style.display = 'none';
  $('app').classList.add('active');
  const [name, tag] = state.me.tag.split('#');
  $('me-name').textContent = name;
  $('me-tag').textContent = '#' + (tag || '0000');
  renderGuilds();
  window.rat.subscribe();
}

// ============================================================
// LOGOUT
// ============================================================
$('logout-btn').onclick = async () => {
  await window.rat.logout();
  state.guilds = []; state.me = null;
  state.currentGuild = null; state.currentChannel = null;
  state.members = []; state.botPerms = null; state.pendingFile = null;
  $('guilds').innerHTML = '';
  $('channel-list').innerHTML = '';
  $('guild-name').textContent = '—';
  $('chat-title').textContent = 'select a channel';
  $('messages').innerHTML = '';
  $('msg-input').disabled = true;
  $('msg-input').value = '';
  $('token').value = '';
  $('error').textContent = '';
  $('perm-warning').classList.remove('active');
  $('file-preview').classList.remove('active');
  $('app').classList.remove('active');
  $('login').style.display = 'flex';
};

// ============================================================
// GUILDS
// ============================================================
function renderGuilds() {
  const el = $('guilds');
  el.innerHTML = '';
  state.guilds.forEach(g => {
    const d = document.createElement('div');
    d.className = 'guild';
    d.title = g.name;
    if (g.icon) {
      const img = document.createElement('img');
      img.src = g.icon;
      d.appendChild(img);
    } else {
      d.textContent = g.name.slice(0, 2).toUpperCase();
    }
    d.onclick = () => selectGuild(g);
    el.appendChild(d);
  });
}

async function selectGuild(g) {
  state.currentGuild = g;
  document.querySelectorAll('.guild').forEach(x => x.classList.remove('active'));
  [...document.querySelectorAll('.guild')].find(x => x.title === g.name)?.classList.add('active');

  $('guild-name').textContent = g.name;
  $('chat-title').textContent = 'select a channel';
  $('messages').innerHTML = '';
  $('msg-input').disabled = true;
  $('perm-warning').classList.remove('active');

  const [chans, members, perms] = await Promise.all([
    window.rat.getChannels(g.id).catch(e => { console.error('[channels]', e); return []; }),
    window.rat.getMembers(g.id).catch(e => { console.error('[members]', e); toast(e.message, true); return []; }),
    window.rat.getBotPerms(g.id).catch(e => { console.error('[perms]', e); return null; })
  ]);

  state.members = members;
  state.botPerms = perms;

  if (perms) {
    const missing = [];
    if (!perms.moderateMembers) missing.push('Moderate Members');
    if (!perms.kickMembers) missing.push('Kick Members');
    if (!perms.banMembers) missing.push('Ban Members');
    if (missing.length && !perms.administrator) {
      $('perm-warning').textContent = '⚠ 봇 권한 부족: ' + missing.join(', ');
      $('perm-warning').classList.add('active');
    }
  }

  const list = $('channel-list');
  list.innerHTML = '';
  chans.forEach(ch => {
    const d = document.createElement('div');
    d.className = 'channel';
    d.dataset.id = ch.id;
    const hash = document.createElement('span');
    hash.className = 'hash'; hash.textContent = '#';
    const nm = document.createElement('span');
    nm.textContent = ch.name;
    d.appendChild(hash); d.appendChild(nm);
    d.onclick = () => selectChannel(ch);
    list.appendChild(d);
  });
}

// ============================================================
// CHANNELS
// ============================================================
async function selectChannel(ch) {
  state.currentChannel = ch;
  document.querySelectorAll('.channel').forEach(x => x.classList.remove('active'));
  [...document.querySelectorAll('.channel')].find(x => x.dataset.id === ch.id)?.classList.add('active');

  $('chat-title').textContent = ch.name;
  $('msg-input').disabled = false;
  $('msg-input').placeholder = 'Message #' + ch.name;
  $('msg-input').focus();

  const msgs = await window.rat.getHistory(ch.id);
  const box = $('messages');
  box.innerHTML = '';
  msgs.forEach(m => box.appendChild(renderMsg(m)));
  box.scrollTop = box.scrollHeight;
}

// ============================================================
// MESSAGES
// ============================================================
function renderMsg(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.dataset.authorId = m.authorId || '';
  wrap.dataset.author = m.author || '';

  const img = document.createElement('img');
  img.className = 'avatar';
  img.src = m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const body = document.createElement('div');
  body.className = 'body';

  const head = document.createElement('div');
  head.className = 'head';
  const a = document.createElement('span');
  a.className = 'author'; a.textContent = m.author;
  const t = document.createElement('span');
  t.className = 'time'; t.textContent = formatTime(m.timestamp);
  head.appendChild(a); head.appendChild(t);

  body.appendChild(head);

  if (m.content) {
    const txt = document.createElement('div');
    txt.className = 'text';
    txt.textContent = m.content;
    body.appendChild(txt);
  }

  (m.attachments || []).forEach(att => {
    if (att.contentType && att.contentType.startsWith('image/')) {
      const w = document.createElement('div');
      w.className = 'attachment';
      const im = document.createElement('img');
      im.src = att.url; im.loading = 'lazy';
      im.onclick = () => openViewer(att.url);
      w.appendChild(im);
      body.appendChild(w);
    } else {
      const link = document.createElement('div');
      link.className = 'attachment file-link';
      link.textContent = '📎 ' + att.name;
      link.onclick = () => window.open(att.url);
      body.appendChild(link);
    }
  });

  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMessageMenu(e.clientX, e.clientY, m);
  });

  wrap.appendChild(img);
  wrap.appendChild(body);
  return wrap;
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return 'Today at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function appendMsg(m) {
  const box = $('messages');
  box.appendChild(renderMsg(m));
  box.scrollTop = box.scrollHeight;
}

// ============================================================
// SEND
// ============================================================
$('msg-input').addEventListener('keydown', async (e) => {
  if (e.key === 'Escape' && state.pendingFile) { cancelFile(); return; }
  if (e.key !== 'Enter' || e.shiftKey) return;
  const content = e.target.value.trim();
  if ((!content && !state.pendingFile) || !state.currentChannel) return;
  e.target.value = '';

  try {
    if (state.pendingFile) {
      const sent = await window.rat.sendFile(state.currentChannel.id, content);
      appendMsg(sent);
      cancelFile();
    } else {
      const sent = await window.rat.send(state.currentChannel.id, content);
      appendMsg(sent);
    }
  } catch (err) {
    console.error('[send]', err);
    toast('전송 실패: ' + err.message, true);
  }
});

// ============================================================
// FILE
// ============================================================
$('attach-btn').onclick = async () => {
  if (!state.currentChannel) return toast('채널 먼저 선택', true);
  const f = await window.rat.pickFile();
  if (!f) return;
  state.pendingFile = f;
  $('fp-img').src = f.dataUrl;
  $('fp-name').textContent = f.name;
  $('file-preview').classList.add('active');
  $('msg-input').focus();
};

function cancelFile() {
  state.pendingFile = null;
  $('file-preview').classList.remove('active');
  $('fp-img').src = '';
  $('fp-name').textContent = '';
}
$('fp-cancel').onclick = cancelFile;

// ============================================================
// LIVE
// ============================================================
window.rat.onMessage((m) => {
  if (!state.currentChannel || m.channelId !== state.currentChannel.id) return;
  appendMsg(m);
});

// ============================================================
// CONTEXT MENU
// ============================================================
const ctx = $('ctx');
let ctxData = null;

function openMessageMenu(x, y, m) {
  ctxData = m;
  const isMine = state.me && m.authorId === state.me.id;
  const member = state.members.find(mm => mm.id === m.authorId);
  const isBot = member && member.bot;

  const items = [];
  items.push({ label: 'Copy Text', action: () => navigator.clipboard.writeText(m.content || '') });
  items.push({ label: 'Copy Author ID', action: () => navigator.clipboard.writeText(m.authorId) });
  if (m.attachments && m.attachments.length) {
    items.push({ label: 'Copy Image URL', action: () => navigator.clipboard.writeText(m.attachments[0].url) });
  }
  items.push({ sep: true });

  if (!isMine && !isBot) {
    items.push({ label: 'Timeout 5 minutes', danger: true, action: () => modAction('timeout', 5) });
    items.push({ label: 'Timeout 1 hour', danger: true, action: () => modAction('timeout', 60) });
    items.push({ label: 'Timeout 24 hours', danger: true, action: () => modAction('timeout', 1440) });
    items.push({ sep: true });
    items.push({ label: 'Kick ' + m.author, danger: true, action: () => modAction('kick') });
    items.push({ label: 'Ban ' + m.author, danger: true, action: () => modAction('ban') });
  } else if (isBot) {
    items.push({ label: '(봇은 대상 아님)', disabled: true });
  } else if (isMine) {
    items.push({ label: '(내 메시지)', disabled: true });
  }

  renderCtx(x, y, items);
}

function openGeneralMenu(x, y) {
  renderCtx(x, y, [
    { label: 'Reload Channel', action: () => state.currentChannel && selectChannel(state.currentChannel) },
    { label: 'Reconnect Members', action: async () => {
      if (!state.currentGuild) return;
      state.members = await window.rat.getMembers(state.currentGuild.id).catch(e => { toast(e.message, true); return []; });
      toast('멤버 ' + state.members.length + '명 로드');
    }},
    { label: 'Check for Updates', action: async () => {
      const r = await window.rat.checkUpdate();
      toast(r.ok ? '업데이트 확인: ' + (r.version || 'latest') : '확인 실패: ' + r.error, !r.ok);
    }},
    { sep: true },
    { label: 'Logout', danger: true, action: () => $('logout-btn').click() }
  ]);
}

function renderCtx(x, y, items) {
  ctx.innerHTML = '';
  items.forEach(it => {
    if (it.sep) {
      const s = document.createElement('div');
      s.className = 'ctx-sep';
      ctx.appendChild(s);
      return;
    }
    const d = document.createElement('div');
    d.className = 'ctx-item' + (it.danger ? ' danger' : '');
    d.textContent = it.label;
    if (it.disabled) {
      d.setAttribute('disabled', '');
    } else {
      d.onclick = () => { closeCtx(); it.action(); };
    }
    ctx.appendChild(d);
  });
  ctx.style.left = x + 'px';
  ctx.style.top = y + 'px';
  ctx.classList.add('active');

  requestAnimationFrame(() => {
    const r = ctx.getBoundingClientRect();
    if (r.right > innerWidth) ctx.style.left = (x - r.width) + 'px';
    if (r.bottom > innerHeight) ctx.style.top = (y - r.height) + 'px';
  });
}

function closeCtx() { ctx.classList.remove('active'); ctxData = null; }

document.addEventListener('click', closeCtx);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.msg')) return;
  e.preventDefault();
  openGeneralMenu(e.clientX, e.clientY);
});

// ============================================================
// MODERATION
// ============================================================
async function modAction(type, minutes) {
  if (!ctxData || !state.currentGuild) return;
  const memberId = ctxData.authorId;
  const guildId = state.currentGuild.id;
  const targetName = ctxData.author;

  const reason = prompt(targetName + ' 에게 ' + type + ' — 사유?', '');
  if (reason === null) return;

  try {
    let res;
    if (type === 'timeout') res = await window.rat.timeout(guildId, memberId, minutes, reason);
    if (type === 'kick')    res = await window.rat.kick(guildId, memberId, reason);
    if (type === 'ban')     res = await window.rat.ban(guildId, memberId, reason);
    console.log('[mod]', type, res);
    toast(type + ' 성공: ' + targetName);
  } catch (e) {
    console.error('[mod error]', e);
    toast(type + ' 실패: ' + e.message, true);
    alert(type + ' 실패\n\n' + e.message);
  }
}

// ============================================================
// IMAGE VIEWER
// ============================================================
const viewer = $('viewer');
const viewerImg = $('viewer-img');
function openViewer(url) {
  viewerImg.src = url;
  viewer.classList.add('active');
}
viewer.onclick = (e) => {
  if (e.target === viewer || e.target.classList.contains('close')) {
    viewer.classList.remove('active');
    viewerImg.src = '';
  }
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (viewer.classList.contains('active')) {
      viewer.classList.remove('active'); viewerImg.src = '';
    }
    closeCtx();
  }
});

// ============================================================
// AUTO UPDATE UI
// ============================================================
const updateBar = document.createElement('div');
updateBar.id = 'update-bar';
updateBar.style.cssText = `
  position: fixed; bottom: 20px; left: 20px; right: 20px;
  background: #5865f2; color: #fff; padding: 12px 16px;
  border-radius: 8px; font-size: 14px; font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); display: none;
  align-items: center; justify-content: space-between; gap: 12px;
  z-index: 4000; animation: slideUp .3s ease;
`;
updateBar.innerHTML = `
  <span id="update-text">업데이트 확인 중...</span>
  <div style="display:flex; align-items:center;">
    <button id="update-install-btn" style="
      background: #fff; color: #5865f2; border: none;
      padding: 6px 12px; border-radius: 4px; cursor: pointer;
      font-weight: 600; display: none; margin-right: 8px;
    ">재시작 후 적용</button>
    <button id="update-close-btn" style="
      background: transparent; color: #fff; border: none;
      font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1;
    ">×</button>
  </div>
`;
document.body.appendChild(updateBar);

function showUpdateBar(text, showInstall = false) {
  $('update-text').textContent = text;
  $('update-install-btn').style.display = showInstall ? 'inline-block' : 'none';
  updateBar.style.display = 'flex';
}

$('update-close-btn').onclick = () => { updateBar.style.display = 'none'; };

$('update-install-btn').onclick = async () => {
  await window.rat.installUpdate();
};

window.rat.onUpdateAvailable((d) => {
  showUpdateBar('🔄 새 버전 ' + d.version + ' 다운로드 중...');
});

window.rat.onUpdateProgress((p) => {
  $('update-text').textContent = '🔄 다운로드 ' + p.percent.toFixed(1) + '% (' +
    (p.transferred / 1024 / 1024).toFixed(1) + 'MB / ' +
    (p.total / 1024 / 1024).toFixed(1) + 'MB)';
});

window.rat.onUpdateDownloaded((d) => {
  showUpdateBar('✅ 새 버전 ' + d.version + ' 준비 완료!', true);
});