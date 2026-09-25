const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');

let win;
let client = null;
let botId = null;
let currentFilePath = null;

// ============================================================
// AUTO UPDATER SETUP
// ============================================================
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.transports.file.level = 'info';

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// ============================================================
// WINDOW
// ============================================================
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    backgroundColor: '#313338',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');

  win.webContents.on('console-message', (event) => {
    console.log(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });

  // 앱 뜨고 5초 후 첫 업데이트 체크
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => log.error('[update] check failed', err));
  }, 5000);

  // 1시간마다 재확인
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => log.error('[update] check failed', err));
  }, 60 * 60 * 1000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// AUTO UPDATE EVENTS
// ============================================================
autoUpdater.on('checking-for-update', () => {
  log.info('[update] checking...');
});

autoUpdater.on('update-available', (info) => {
  log.info('[update] available:', info.version);
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:available', { version: info.version });
  }
});

autoUpdater.on('update-not-available', () => {
  log.info('[update] not available');
});

autoUpdater.on('download-progress', (progress) => {
  log.info(`[update] ${progress.percent.toFixed(1)}%`);
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('[update] downloaded:', info.version);
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:downloaded', { version: info.version });
  }
});

autoUpdater.on('error', (err) => {
  log.error('[update] error:', err);
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(true, true);
});

ipcMain.handle('update:check', async () => {
  try {
    const res = await autoUpdater.checkForUpdates();
    return { ok: true, version: res && res.updateInfo && res.updateInfo.version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ============================================================
// LOGIN
// ============================================================
ipcMain.handle('bot:login', async (_e, token) => {
  if (client) { try { client.destroy(); } catch (e) {} client = null; }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration
    ]
  });

  client.on('error', err => console.error('[client error]', err));
  client.on('warn', info => console.warn('[client warn]', info));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('login timeout')), 20000);

    client.once(Events.ClientReady, async (c) => {
      clearTimeout(timeout);
      botId = c.user.id;
      console.log('[rat] logged in as', c.user.tag);

      const guilds = c.guilds.cache.map(g => ({
        id: g.id, name: g.name,
        icon: g.iconURL({ size: 64 }),
        memberCount: g.memberCount
      }));
      resolve({ ok: true, user: { id: c.user.id, tag: c.user.tag }, guilds });
    });

    client.once(Events.Error, (err) => {
      clearTimeout(timeout);
      console.error('[login error]', err);
      reject(new Error(err.message));
    });

    client.login(token).catch(err => {
      clearTimeout(timeout);
      console.error('[login fail]', err);
      reject(new Error(err.message));
    });
  });
});

ipcMain.handle('bot:logout', async () => {
  if (client) { try { client.destroy(); } catch (e) {} client = null; botId = null; }
  return true;
});

ipcMain.handle('bot:me', () => botId);

// ============================================================
// GUILD / CHANNEL / MEMBER
// ============================================================
ipcMain.handle('guild:channels', async (_e, guildId) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();
  return channels
    .filter(ch => ch && ch.isTextBased() && !ch.isThread())
    .map(ch => ({ id: ch.id, name: ch.name, type: ch.type, position: ch.rawPosition }))
    .sort((a, b) => a.position - b.position);
});

ipcMain.handle('guild:members', async (_e, guildId) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  try {
    await guild.members.fetch();
    console.log(`[rat] fetched ${guild.members.cache.size} members`);
  } catch (err) {
    console.error('[members fetch failed]', err);
    throw new Error('member fetch failed - check Server Members Intent');
  }
  return guild.members.cache.map(m => ({
    id: m.id,
    username: m.user.username,
    displayName: m.displayName,
    avatar: m.user.displayAvatarURL({ size: 64 }),
    bot: m.user.bot
  }));
});

ipcMain.handle('guild:botPerms', async (_e, guildId) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  const me = guild.members.me || await guild.members.fetch(client.user.id);
  const p = me.permissions;
  return {
    administrator: p.has(PermissionFlagsBits.Administrator),
    moderateMembers: p.has(PermissionFlagsBits.ModerateMembers),
    kickMembers: p.has(PermissionFlagsBits.KickMembers),
    banMembers: p.has(PermissionFlagsBits.BanMembers),
    highestRolePosition: me.roles.highest.position
  };
});

// ============================================================
// MESSAGES
// ============================================================
ipcMain.handle('channel:history', async (_e, channelId, limit = 50) => {
  if (!client) throw new Error('not logged in');
  const ch = await client.channels.fetch(channelId);
  const msgs = await ch.messages.fetch({ limit });
  return msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(serializeMessage);
});

ipcMain.handle('channel:send', async (_e, channelId, content) => {
  if (!client) throw new Error('not logged in');
  const ch = await client.channels.fetch(channelId);
  const sent = await ch.send(content);
  return serializeMessage(sent);
});

ipcMain.handle('file:pick', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  currentFilePath = res.filePaths[0];
  const buf = fs.readFileSync(currentFilePath);
  const ext = path.extname(currentFilePath).slice(1).toLowerCase();
  return {
    path: currentFilePath,
    name: path.basename(currentFilePath),
    dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`
  };
});

ipcMain.handle('file:send', async (_e, channelId, content) => {
  if (!client) throw new Error('not logged in');
  if (!currentFilePath) throw new Error('no file picked');
  const ch = await client.channels.fetch(channelId);
  const sent = await ch.send({ content: content || undefined, files: [currentFilePath] });
  currentFilePath = null;
  return serializeMessage(sent);
});

// ============================================================
// MODERATION
// ============================================================
ipcMain.handle('mod:timeout', async (_e, guildId, memberId, minutes, reason) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  let member;
  try { member = await guild.members.fetch(memberId); }
  catch (err) { throw new Error('member not found - Server Members Intent needed'); }

  console.log('[timeout]', { target: member.displayName, moderatable: member.moderatable });
  if (!member.moderatable) throw new Error('cannot timeout - role hierarchy or permission issue');

  await member.timeout(minutes * 60 * 1000, reason || 'timeout');
  return { ok: true };
});

ipcMain.handle('mod:kick', async (_e, guildId, memberId, reason) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  let member;
  try { member = await guild.members.fetch(memberId); }
  catch (err) { throw new Error('member not found - Server Members Intent needed'); }

  console.log('[kick]', { target: member.displayName, kickable: member.kickable });
  if (!member.kickable) throw new Error('cannot kick - role hierarchy or permission issue');

  await member.kick(reason || 'kicked');
  return { ok: true };
});

ipcMain.handle('mod:ban', async (_e, guildId, memberId, reason) => {
  if (!client) throw new Error('not logged in');
  const guild = await client.guilds.fetch(guildId);
  let member;
  try { member = await guild.members.fetch(memberId); }
  catch (err) { throw new Error('member not found - Server Members Intent needed'); }

  console.log('[ban]', { target: member.displayName, bannable: member.bannable });
  if (!member.bannable) throw new Error('cannot ban - role hierarchy or permission issue');

  await member.ban({ reason: reason || 'banned' });
  return { ok: true };
});

// ============================================================
// LIVE
// ============================================================
ipcMain.handle('bot:subscribe', async () => {
  if (!client) throw new Error('not logged in');
  client.removeAllListeners(Events.MessageCreate);
  client.on(Events.MessageCreate, (msg) => {
    if (!win || win.isDestroyed()) return;
    if (!msg.guild) return;
    win.webContents.send('message:new', {
      ...serializeMessage(msg),
      channelId: msg.channelId,
      guildId: msg.guildId
    });
  });
  return true;
});

// ============================================================
// HELPERS
// ============================================================
function serializeMessage(m) {
  return {
    id: m.id,
    author: (m.member && m.member.displayName) || m.author.username,
    authorUsername: m.author.username,
    authorId: m.author.id,
    avatar: m.author.displayAvatarURL({ size: 64 }),
    content: m.content,
    timestamp: m.createdTimestamp,
    channelId: m.channelId,
    guildId: m.guildId,
    attachments: [...m.attachments.values()].map(a => ({
      id: a.id, url: a.url, proxyURL: a.proxyURL,
      name: a.name, contentType: a.contentType,
      width: a.width, height: a.height, size: a.size
    }))
  };
}