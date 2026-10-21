/**
 * host-controller.js — Standalone Unattended Host Agent Controller
 * -----------------------------------------------------------------
 * Manages unattended host lifecycle:
 *  - Persistent host identity & secure PIN storage
 *  - Automated Nostr relay connection & background liveness
 *  - Zero-touch WebRTC handshake & 60 FPS desktop streaming
 *  - Input forwarding to native OS bridge (ws://127.0.0.1:9999)
 */

import { NostrCrypto } from './nostr-crypto.js';
import { NostrTransport } from './nostr-transport.js';
import { PeerSession } from './webrtc-core.js';
import { DiagnosticLogger } from './diagnostic-logger.js';

DiagnosticLogger.installConsoleInterceptor();

const STORAGE_HOST_PRIV = 'p2p-host-privkey';
const STORAGE_HOST_PUB = 'p2p-host-pubkey';
const STORAGE_HOST_NAME = 'p2p-host-name';
const STORAGE_HOST_PIN = 'p2p-host-pin';
const STORAGE_HOST_WHITELIST = 'p2p-host-authorized-clients';
const STORAGE_HOST_WHITELIST_ENABLED = 'p2p-host-whitelist-enabled';
const STORAGE_BRIDGE_TOKEN = 'p2p_bridge_token';

// Password complexity rules: 8–24 chars, min 1 uppercase, min 1 lowercase, min 1 digit, min 1 special char
function generateSecurePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*+-_=';

  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)]
  ];

  const allChars = upper + lower + digits + special;
  for (let i = pwd.length; i < length; i++) {
    pwd.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

function validatePasswordComplexity(pwd) {
  if (!pwd || typeof pwd !== 'string') {
    return { valid: false, error: 'Password cannot be empty.' };
  }
  if (pwd.length < 8) {
    return { valid: false, error: `Password too short (${pwd.length}/8 min characters).` };
  }
  if (pwd.length > 24) {
    return { valid: false, error: `Password too long (${pwd.length}/24 max characters).` };
  }
  if (!/[A-Z]/.test(pwd)) {
    return { valid: false, error: 'Must include at least 1 uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(pwd)) {
    return { valid: false, error: 'Must include at least 1 lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, error: 'Must include at least 1 number (0-9).' };
  }
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    return { valid: false, error: 'Must include at least 1 special character (!@#$%^&*...).' };
  }
  return { valid: true };
}

// DOM elements
const dom = {
  hostStatusBadge: document.getElementById('host-status-badge'),
  hostStatusText: document.getElementById('host-status-text'),
  hostNameInput: document.getElementById('host-name-input'),
  hostPinInput: document.getElementById('host-pin-input'),
  pinStatusBadge: document.getElementById('pin-status-badge'),
  btnTogglePinVisibility: document.getElementById('btn-toggle-pin-visibility'),
  btnGeneratePin: document.getElementById('btn-generate-pin'),
  btnCopyPin: document.getElementById('btn-copy-pin'),
  pinValidationMsg: document.getElementById('pin-validation-msg'),
  hostBridgePill: document.getElementById('host-bridge-pill'),
  btnRecheckBridge: document.getElementById('btn-recheck-bridge'),
  hostQrCanvas: document.getElementById('host-qr-canvas'),
  hostPubkeyBox: document.getElementById('host-pubkey-box'),
  btnCopyPairingToken: document.getElementById('btn-copy-pairing-token'),
  btnScrollTop: document.getElementById('btn-scroll-top'),
  btnToggleCapture: document.getElementById('btn-toggle-capture'),
  captureStatusBadge: document.getElementById('capture-status-badge'),
  hostScreenVideo: document.getElementById('host-screen-video'),
  hostScreenPlaceholder: document.getElementById('host-screen-placeholder'),
  hostConnectedPeer: document.getElementById('host-connected-peer'),
  hostStreamRes: document.getElementById('host-stream-res'),
  hostStreamAudio: document.getElementById('host-stream-audio'),
  hostPubkeyDisplay: document.getElementById('host-pubkey-display'),
  hostWhitelistToggle: document.getElementById('host-whitelist-toggle'),
  whitelistCountBadge: document.getElementById('whitelist-count-badge'),
  newAuthPubkey: document.getElementById('new-auth-pubkey'),
  newAuthName: document.getElementById('new-auth-name'),
  btnAddAuthClient: document.getElementById('btn-add-auth-client'),
  authorizedClientsList: document.getElementById('authorized-clients-list'),
  modalStartCapturePrompt: document.getElementById('modal-start-capture-prompt'),
  btnModalStartCapture: document.getElementById('btn-modal-start-capture'),
  btnModalDismissCapture: document.getElementById('btn-modal-dismiss-capture'),
};

let hostIdentity = null;
let hostStream = null;
let activeSession = null;
let bridgeWs = null;
let bridgeConnected = false;

// ── 1. Host Identity & Security Config ──────────────────────────────
async function initHostIdentity() {
  // Use dedicated Nostr identity for the Host (p2p-host-privkey / p2p-host-pubkey).
  // Having distinct identities for Host and Client avoids relay echo loops, session clobbering,
  // and maintains a clean authorization whitelist model.
  let priv = localStorage.getItem(STORAGE_HOST_PRIV);
  let pub = localStorage.getItem(STORAGE_HOST_PUB);
  const clientPub = localStorage.getItem('nostr-pubkey');

  if (!priv || !pub || (clientPub && pub.toLowerCase() === clientPub.toLowerCase())) {
    const kp = await NostrCrypto.generateKeypair();
    priv = kp.privateKey;
    pub = kp.publicKey;
    localStorage.setItem(STORAGE_HOST_PRIV, priv);
    localStorage.setItem(STORAGE_HOST_PUB, pub);
  }

  hostIdentity = { privateKey: priv, publicKey: pub };
  if (dom.hostPubkeyDisplay) {
    dom.hostPubkeyDisplay.textContent = `${pub.slice(0, 8)}…${pub.slice(-6)}`;
    dom.hostPubkeyDisplay.title = pub;
  }
  if (dom.hostPubkeyBox) {
    dom.hostPubkeyBox.textContent = pub;
  }

  // Device Name
  const savedName = localStorage.getItem(STORAGE_HOST_NAME) || `Host-${pub.slice(0, 6)}`;
  dom.hostNameInput.value = savedName;
  dom.hostNameInput.addEventListener('change', () => {
    localStorage.setItem(STORAGE_HOST_NAME, dom.hostNameInput.value.trim());
    renderPairingQR();
  });

  // Access Password / PIN initialization with complexity rules
  let savedPin = localStorage.getItem(STORAGE_HOST_PIN);
  const validity = validatePasswordComplexity(savedPin);
  if (!validity.valid) {
    // Generate fresh readable random password meeting complexity rules
    savedPin = generateSecurePassword(12);
    localStorage.setItem(STORAGE_HOST_PIN, savedPin);
  }
  dom.hostPinInput.value = savedPin;
  updatePinValidationUI(savedPin);

  function updatePinValidationUI(val) {
    const res = validatePasswordComplexity(val);
    if (!dom.pinValidationMsg) return res.valid;
    if (res.valid) {
      dom.pinValidationMsg.textContent = '✓ Strong password (meets complexity rules)';
      dom.pinValidationMsg.style.color = 'var(--c-primary)';
      dom.hostPinInput.style.borderColor = 'var(--c-primary)';
    } else {
      dom.pinValidationMsg.textContent = `⚠️ ${res.error}`;
      dom.pinValidationMsg.style.color = 'var(--c-danger, #ef4444)';
      dom.hostPinInput.style.borderColor = 'var(--c-danger, #ef4444)';
    }
    return res.valid;
  }

  let pinSaveTimer = null;
  function triggerPinSavedAnimation() {
    if (!dom.pinStatusBadge) return;
    dom.pinStatusBadge.textContent = 'Saved ✓';
    dom.pinStatusBadge.className = 'badge badge--connected pin-saved-active';
    dom.pinStatusBadge.style.display = 'inline-block';
    clearTimeout(pinSaveTimer);
    pinSaveTimer = setTimeout(() => {
      dom.pinStatusBadge.className = 'badge badge--connected';
      dom.pinStatusBadge.style.display = 'none';
    }, 2200);
  }

  dom.btnGeneratePin?.addEventListener('click', () => {
    const newPwd = generateSecurePassword(12);
    dom.hostPinInput.value = newPwd;
    dom.hostPinInput.type = 'text';
    localStorage.setItem(STORAGE_HOST_PIN, newPwd);
    updatePinValidationUI(newPwd);
    triggerPinSavedAnimation();
  });

  dom.btnCopyPin?.addEventListener('click', () => {
    const pwd = dom.hostPinInput.value;
    if (pwd) {
      navigator.clipboard.writeText(pwd).then(() => {
        const orig = dom.btnCopyPin.textContent;
        dom.btnCopyPin.textContent = 'Copied! ✓';
        setTimeout(() => { dom.btnCopyPin.textContent = orig; }, 2000);
      });
    }
  });

  dom.hostPinInput.addEventListener('input', () => {
    const val = dom.hostPinInput.value.trim();
    const isValid = updatePinValidationUI(val);
    if (!isValid) return; // Do not save invalid password until it satisfies rules
    if (dom.pinStatusBadge) {
      dom.pinStatusBadge.textContent = 'Saving...';
      dom.pinStatusBadge.className = 'badge badge--idle';
      dom.pinStatusBadge.style.display = 'inline-block';
    }
    clearTimeout(pinSaveTimer);
    pinSaveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_HOST_PIN, val);
      triggerPinSavedAnimation();
    }, 350);
  });

  dom.hostPinInput.addEventListener('change', () => {
    const val = dom.hostPinInput.value.trim();
    if (updatePinValidationUI(val)) {
      clearTimeout(pinSaveTimer);
      localStorage.setItem(STORAGE_HOST_PIN, val);
      triggerPinSavedAnimation();
    }
  });

  dom.btnTogglePinVisibility?.addEventListener('click', () => {
    const isPass = dom.hostPinInput.type === 'password';
    dom.hostPinInput.type = isPass ? 'text' : 'password';
    dom.btnTogglePinVisibility.innerHTML = isPass ?
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` :
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  renderPairingQR();
  updateCaptureUI(false);

  // If ?autostart=1 is present, highlight the capture button so the user sees it immediately
  if (window.location.search.includes('autostart=1')) {
    if (!isHostStreamLive()) {
      dom.btnToggleCapture?.classList.add('pulse-highlight');
    }
  }
}

function getPairingToken() {
  return hostIdentity?.publicKey || '';
}

function renderPairingQR() {
  if (!hostIdentity || !window.QRCode || !dom.hostQrCanvas) return;
  QRCode.toCanvas(dom.hostQrCanvas, hostIdentity.publicKey, {
    width: 140,
    margin: 2,
    color: { dark: '#000', light: '#fff' }
  }, () => {});
}

// ── 2. Authorized Clients Whitelist ────────────────────────────────
function loadAuthorizedClients() {
  try { return JSON.parse(localStorage.getItem(STORAGE_HOST_WHITELIST)) || []; }
  catch { return []; }
}

function saveAuthorizedClients(list) {
  localStorage.setItem(STORAGE_HOST_WHITELIST, JSON.stringify(list));
  updateWhitelistFilter();
  renderAuthorizedClients();
}

function isWhitelistEnforced() {
  const val = localStorage.getItem(STORAGE_HOST_WHITELIST_ENABLED);
  // Default to true (enforced) if not explicitly set
  if (val === null) return true;
  return val === 'true';
}

function setWhitelistEnforced(enabled) {
  localStorage.setItem(STORAGE_HOST_WHITELIST_ENABLED, enabled ? 'true' : 'false');
  updateWhitelistFilter();
  renderAuthorizedClients();
}

function addAuthorizedClient(pubkey, name) {
  let cleanPubkey = (pubkey || '').trim().toLowerCase();
  if (cleanPubkey.startsWith('p2p-client:') || cleanPubkey.startsWith('p2p-host:')) {
    const parts = cleanPubkey.split(':');
    cleanPubkey = parts[1] || '';
    if (!name && parts[2]) name = decodeURIComponent(parts[2]);
  }
  if (!/^[0-9a-f]{64}$/.test(cleanPubkey)) {
    alert('Invalid public key. Must be 64 hexadecimal characters.');
    return false;
  }
  const clients = loadAuthorizedClients();
  const existing = clients.find(c => c.pubkey === cleanPubkey);
  if (existing) {
    existing.name = name || existing.name;
  } else {
    clients.push({
      pubkey: cleanPubkey,
      name: name || `Client-${cleanPubkey.slice(0, 6)}`,
      addedAt: Date.now()
    });
  }
  saveAuthorizedClients(clients);
  return true;
}

function removeAuthorizedClient(pubkey) {
  const clients = loadAuthorizedClients().filter(c => c.pubkey !== pubkey.toLowerCase());
  saveAuthorizedClients(clients);
}

function isClientAuthorized(pubkey) {
  if (!isWhitelistEnforced()) return true;
  const clients = loadAuthorizedClients();
  // If whitelist is enabled and empty, block all incoming connections!
  if (clients.length === 0) return false;
  const clean = (pubkey || '').toLowerCase();
  return clients.some(c => c.pubkey === clean);
}

function updateWhitelistFilter() {
  const enforced = isWhitelistEnforced();
  if (dom.hostWhitelistToggle) {
    dom.hostWhitelistToggle.checked = enforced;
  }

  if (enforced) {
    // Drop Nostr events from unauthorized senders BEFORE decryption!
    NostrTransport.setEventFilter((senderPubKey) => {
      const clean = (senderPubKey || '').toLowerCase();
      const clients = loadAuthorizedClients();
      if (clients.length === 0) {
        console.warn(`[Host Security] Dropped Nostr event from ${clean.slice(0, 8)}…: Whitelist is active and empty (0 authorized clients). All incoming events blocked.`);
        return false;
      }
      const allowed = clients.some(c => c.pubkey === clean);
      if (!allowed) {
        console.warn(`[Host Security] Dropped Nostr event from unauthorized client ${clean.slice(0, 8)}… without decryption (Whitelist enforced)`);
      }
      return allowed;
    });
  } else {
    NostrTransport.setEventFilter(null);
  }
}

function renderAuthorizedClients() {
  if (!dom.authorizedClientsList) return;
  const clients = loadAuthorizedClients();
  const enforced = isWhitelistEnforced();

  if (dom.whitelistCountBadge) {
    if (!enforced) {
      dom.whitelistCountBadge.className = 'badge badge--idle';
      dom.whitelistCountBadge.textContent = 'Disabled';
    } else if (clients.length === 0) {
      dom.whitelistCountBadge.className = 'badge badge--failed';
      dom.whitelistCountBadge.textContent = 'Active (0 Authorized — All Blocked)';
    } else {
      dom.whitelistCountBadge.className = 'badge badge--connected';
      dom.whitelistCountBadge.textContent = `${clients.length} Authorized`;
    }
  }

  if (clients.length === 0) {
    dom.authorizedClientsList.innerHTML = enforced ? `
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px; color: var(--c-text); font-size: 0.78rem; line-height: 1.5;">
        <strong style="color: #ef4444; display: block; margin-bottom: 4px;">⚠️ Whitelist is active and empty — All connections blocked</strong>
        To allow your phone or remote computer to connect, copy its <strong>Client ID</strong> from the client app (under <em>Add Remote Computer</em>) and paste it into the field above to authorize it.
      </div>
    ` : `
      <div class="auth-client-empty">
        No authorized clients added yet.<br>
        Add your client Nostr public key above to lock down access.
      </div>`;
    return;
  }

  dom.authorizedClientsList.innerHTML = clients.map(c => `
    <div class="auth-client-item" data-pubkey="${escapeHtml(c.pubkey)}">
      <div class="auth-client-meta">
        <div class="auth-client-name">
          <span>📱</span>
          <span>${escapeHtml(c.name)}</span>
        </div>
        <div class="auth-client-pubkey" title="${escapeHtml(c.pubkey)}">
          ${escapeHtml(c.pubkey.slice(0, 10))}…${escapeHtml(c.pubkey.slice(-8))}
        </div>
      </div>
      <div class="auth-client-actions">
        <button class="auth-client-btn-del" data-pubkey="${escapeHtml(c.pubkey)}" title="Remove authorization">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  dom.authorizedClientsList.querySelectorAll('.auth-client-btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const pubkey = btn.dataset.pubkey;
      if (confirm('Revoke access for this client?')) {
        removeAuthorizedClient(pubkey);
      }
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ── 2. Local OS Bridge Connection (ws://127.0.0.1:9999 / wss://:9998) ─
let bridgeConnectGeneration = 0;
let bridgeReconnectTimer = null;
let bridgeReconnectDelay = 2000;

function clearBridgeReconnectTimer() {
  if (bridgeReconnectTimer) {
    clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = null;
  }
}

function scheduleBridgeReconnect(immediate = false) {
  clearBridgeReconnectTimer();
  const delay = immediate ? 50 : bridgeReconnectDelay;
  bridgeReconnectTimer = setTimeout(() => {
    bridgeReconnectTimer = null;
    console.log(`[Host Bridge] Auto-reconnecting to OS bridge (delay: ${delay}ms)...`);
    connectBridge(false);
  }, delay);
  if (!immediate) {
    bridgeReconnectDelay = Math.min(Math.round(bridgeReconnectDelay * 1.5), 15000);
  }
}

function broadcastBridgeStatus(active) {
  if (activeSession && typeof activeSession.sendInput === 'function') {
    try {
      activeSession.sendInput({
        t: 'host_status',
        bridgeActive: !!active,
        hasVideo: isHostStreamLive(),
        warning: active ? null : 'Host OS Bridge disconnected — input control paused (view-only).'
      });
    } catch {}
  }
}

function getCandidateBridgeUrls() {
  const isHttps = window.location.protocol === 'https:';
  const h = window.location.hostname || '';
  const isPrivateIp = /^(127\.0\.0\.1|localhost|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(h);

  const urls = [];
  // 1. Direct local plain WS (primary default across all platforms)
  urls.push('ws://127.0.0.1:9999');
  urls.push('ws://localhost:9999');

  // 2. Secure WSS if running in HTTPS context and certs exist
  if (isHttps) {
    urls.push('wss://127.0.0.1:9998');
    urls.push('wss://localhost:9998');
  }

  // 3. LAN IP if running on local network dev server
  if (isPrivateIp && h !== '127.0.0.1' && h !== 'localhost') {
    urls.push(`ws://${h}:9999`);
    if (isHttps) urls.push(`wss://${h}:9998`);
  }

  return [...new Set(urls)];
}

function connectBridge(force = false) {
  if (force) {
    clearBridgeReconnectTimer();
    bridgeReconnectDelay = 2000;
  }
  if (!force && bridgeWs && bridgeWs.readyState === WebSocket.OPEN) return;

  const currentGen = ++bridgeConnectGeneration;

  // Cleanly close any pending or existing socket from older runs
  if (bridgeWs) {
    try {
      bridgeWs.onopen = null;
      bridgeWs.onmessage = null;
      bridgeWs.onclose = null;
      bridgeWs.onerror = null;
      bridgeWs.close();
    } catch {}
    bridgeWs = null;
  }
  bridgeConnected = false;

  if (dom.hostBridgePill) {
    dom.hostBridgePill.className = 'badge badge--idle';
    dom.hostBridgePill.textContent = 'Connecting...';
  }

  const urlsToTry = getCandidateBridgeUrls();
  let attemptIdx = 0;

  function tryNext() {
    if (currentGen !== bridgeConnectGeneration) return;

    if (attemptIdx >= urlsToTry.length) {
      bridgeConnected = false;
      bridgeWs = null;
      broadcastBridgeStatus(false);
      if (dom.hostBridgePill) {
        dom.hostBridgePill.className = 'badge badge--failed';
        dom.hostBridgePill.textContent = 'Not Running (run bridge.py)';
      }
      document.getElementById('bridge-setup-details')?.setAttribute('open', '');
      scheduleBridgeReconnect();
      return;
    }

    const currentUrl = urlsToTry[attemptIdx++];
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const advance = () => {
      if (!settled) {
        settled = true;
        cleanup();
        tryNext();
      }
    };

    try {
      console.log(`[Host Bridge] Attempting connection to: ${currentUrl}`);
      const ws = new WebSocket(currentUrl);

      // Fast connection timeout: loopback connections succeed in < 5ms.
      // If still connecting after 1200ms, abort and try next candidate.
      timer = setTimeout(() => {
        if (currentGen !== bridgeConnectGeneration) return;
        if (!settled && ws.readyState === WebSocket.CONNECTING) {
          console.warn(`[Host Bridge] Connection timeout (1.2s) for ${currentUrl}, trying next candidate...`);
          try { ws.close(); } catch {}
          advance();
        }
      }, 1200);

      ws.onopen = () => {
        if (currentGen !== bridgeConnectGeneration) {
          try { ws.close(); } catch {}
          return;
        }
        settled = true;
        cleanup();
        clearBridgeReconnectTimer();
        bridgeReconnectDelay = 2000;
        bridgeWs = ws;
        bridgeConnected = true;
        console.log(`[Host Bridge] Successfully connected to: ${currentUrl}`);
        if (dom.hostBridgePill) {
          dom.hostBridgePill.className = 'badge badge--connected';
          dom.hostBridgePill.textContent = 'Active';
        }
        document.getElementById('bridge-setup-details')?.removeAttribute('open');
        broadcastBridgeStatus(true);
      };

      ws.onmessage = (evt) => {
        if (currentGen !== bridgeConnectGeneration) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.t === 'connected' || msg.t === 'auth_ok') {
            bridgeConnected = true;
            clearBridgeReconnectTimer();
            bridgeReconnectDelay = 2000;
            if (dom.hostBridgePill) {
              dom.hostBridgePill.className = 'badge badge--connected';
              dom.hostBridgePill.textContent = 'Active';
            }
            document.getElementById('bridge-setup-details')?.removeAttribute('open');
            broadcastBridgeStatus(true);
          }
          if (activeSession && (msg.t === 'clipboard' || msg.t === 'clipboard_ack' || msg.t === 'monitors')) {
            try { activeSession.sendInput(msg); } catch {}
          }
        } catch {}
      };

      ws.onclose = () => {
        if (currentGen !== bridgeConnectGeneration) return;
        cleanup();
        if (bridgeWs === ws && bridgeConnected) {
          // The winning active socket was disconnected
          bridgeConnected = false;
          bridgeWs = null;
          broadcastBridgeStatus(false);
          if (dom.hostBridgePill) {
            dom.hostBridgePill.className = 'badge badge--idle';
            dom.hostBridgePill.textContent = 'Disconnected (auto-reconnecting...)';
          }
          scheduleBridgeReconnect();
        } else if (!bridgeConnected) {
          // Probe failed, advance to next candidate
          advance();
        }
      };

      ws.onerror = () => {
        // ws.onclose will fire after onerror; timeout covers hanging states
      };
    } catch {
      advance();
    }
  }

  tryNext();
}

// ── 3. Desktop Screen Capture ───────────────────────────────────────
function updateCaptureUI(active, width = 0, height = 0, hasAudio = false) {
  if (dom.captureStatusBadge) {
    dom.captureStatusBadge.className = 'badge ' + (active ? 'badge--connected' : 'badge--idle');
    dom.captureStatusBadge.textContent = active ? '🟢 Active (Ready for Unattended Access)' : '🔴 Inactive (Click Start)';
  }
  if (dom.btnToggleCapture) {
    dom.btnToggleCapture.textContent = active ? 'Stop Capture' : 'Start Desktop Capture';
    dom.btnToggleCapture.className = 'btn btn--small ' + (active ? 'btn--outline' : 'btn--primary');
  }
  if (dom.hostScreenPlaceholder) {
    dom.hostScreenPlaceholder.classList.toggle('hidden', active);
    dom.hostScreenPlaceholder.style.display = active ? 'none' : 'flex';
  }
  if (dom.hostScreenVideo) {
    dom.hostScreenVideo.style.display = active ? 'block' : 'none';
  }
  if (dom.hostStreamRes) {
    dom.hostStreamRes.textContent = active ? `${width} x ${height}` : '0 x 0';
  }
  if (dom.hostStreamAudio) {
    dom.hostStreamAudio.textContent = active ? (hasAudio ? '🟢 Shared (Stereo)' : '⚪ No Audio Track') : '⚪ Inactive';
    dom.hostStreamAudio.style.color = (active && hasAudio) ? 'var(--c-primary)' : 'var(--c-text-dim)';
  }
}

function isHostStreamLive() {
  if (!hostStream || !hostStream.active) return false;
  const tracks = hostStream.getVideoTracks();
  return tracks.length > 0 && tracks[0].readyState === 'live';
}

function showStartCaptureModal() {
  if (dom.modalStartCapturePrompt) {
    dom.modalStartCapturePrompt.classList.remove('hidden');
    dom.modalStartCapturePrompt.style.display = 'flex';
  }
}

function hideStartCaptureModal() {
  if (dom.modalStartCapturePrompt) {
    dom.modalStartCapturePrompt.classList.add('hidden');
    dom.modalStartCapturePrompt.style.display = 'none';
  }
}

function isUserCancellation(err) {
  if (!err) return false;
  return err.name === 'NotAllowedError' || err.name === 'AbortError';
}

let captureInProgress = false;
let captureActionLock = false;

async function stopDesktopCapture() {
  if (captureActionLock) return;
  captureActionLock = true;
  setTimeout(() => { captureActionLock = false; }, 600);

  console.log('[Host] Stopping desktop capture');
  if (hostStream) {
    try {
      for (const t of hostStream.getTracks()) {
        try { t.stop(); } catch {}
      }
    } catch {}
    hostStream = null;
  }
  if (dom.hostScreenVideo) {
    dom.hostScreenVideo.srcObject = null;
    dom.hostScreenVideo.style.display = 'none';
  }
  updateCaptureUI(false);
  hideStartCaptureModal(); // NEVER show capture prompt when stopping!

  if (activeSession) {
    try {
      activeSession.removeMedia({ stopTracks: false });
      activeSession.sendInput({
        t: 'host_status',
        warning: 'Host desktop capture was stopped. Click "Start Desktop Capture" on the host computer.'
      });
    } catch {}
  }
}

async function ensureDesktopCapture() {
  if (isHostStreamLive()) {
    console.log('[Host] Reusing existing active desktop capture stream');
    hideStartCaptureModal();
    return hostStream;
  }

  if (captureInProgress) {
    console.warn('[Host] Desktop capture already in progress, ignoring duplicate call');
    return null;
  }
  captureInProgress = true;

  try {
    let stream = null;
    const displayMediaOptions = {
      video: {
        displaySurface: 'monitor',
        frameRate: { ideal: 60, max: 60 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false
      },
      systemAudio: 'include',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude'
    };

    try {
      stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    } catch (err1) {
      // If user clicked Cancel, immediately exit! DO NOT prompt again!
      if (isUserCancellation(err1)) {
        console.log('[Host] User cancelled screen selection dialog');
        return null;
      }
      console.warn('[Host] Advanced displayMedia options failed, trying audio fallback:', err1);
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (err2) {
        if (isUserCancellation(err2)) {
          console.log('[Host] User cancelled fallback screen selection dialog');
          return null;
        }
        console.warn('[Host] Audio+Video capture failed, trying video-only:', err2);
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } catch (err3) {
          if (isUserCancellation(err3)) {
            console.log('[Host] User cancelled video-only screen selection dialog');
            return null;
          }
          throw err3;
        }
      }
    }

    if (!stream) {
      return null;
    }

    hostStream = stream;
    const track = stream.getVideoTracks()[0];
    if (track && 'contentHint' in track) {
      track.contentHint = 'detail';
    }
    const audioTracks = stream.getAudioTracks();
    const hasAudio = audioTracks.length > 0;
    console.log(`[Host] Capture live. Video: ${track ? track.label : 'none'}, Audio: ${hasAudio ? audioTracks[0].label : 'none'}`);

    dom.hostScreenVideo.srcObject = stream;
    dom.hostScreenVideo.style.display = 'block';
    const settings = track ? track.getSettings() : {};
    updateCaptureUI(true, settings.width || 1920, settings.height || 1080, hasAudio);
    dom.btnToggleCapture?.classList.remove('pulse-highlight');
    hideStartCaptureModal();

    // If a remote session is already connected, push the stream immediately!
    if (activeSession) {
      try {
        activeSession.addLocalStream(stream);
        activeSession.sendInput({ t: 'host_status', warning: '' });
        console.log('[Host] Attached stream (video + audio) to active remote session');
      } catch (e) {
        console.warn('[Host] Error attaching stream to active session:', e);
      }
    }

    track.onended = () => {
      console.log('[Host] User stopped desktop capture via browser UI');
      stopDesktopCapture();
    };

    if (hasAudio) {
      audioTracks[0].onended = () => {
        console.log('[Host] System audio capture ended');
        if (dom.hostStreamAudio) {
          dom.hostStreamAudio.textContent = '⚪ Audio Ended';
          dom.hostStreamAudio.style.color = 'var(--c-text-dim)';
        }
      };
    }

    return stream;
  } catch (err) {
    if (isUserCancellation(err)) {
      console.log('[Host] User cancelled desktop capture');
      return null;
    }
    console.error('[Host] Desktop capture failed:', err);
    throw err;
  } finally {
    captureInProgress = false;
  }
}

// ── 4. Unattended Signaling & Auto-Accept ───────────────────────────
async function initSignaling() {
  updateWhitelistFilter();

  NostrTransport.init(hostIdentity.privateKey, hostIdentity.publicKey, {
    onLog: (msg) => console.log('[Host Nostr]', msg),
    onRelayStatus: (url, state) => console.log(`[Host Relay] ${url} -> ${state}`)
  });

  // Check for ?relay=ws://... URL parameter for instant local mock relay testing
  try {
    const params = new URLSearchParams(window.location.search);
    const relayParam = params.get('relay');
    const relayOnly = params.get('relay-only') === '1' || params.get('relay-only') === 'true';
    if (relayParam && (relayParam.startsWith('ws://') || relayParam.startsWith('wss://'))) {
      const cleanRelay = relayParam.trim();
      if (relayOnly) {
        localStorage.setItem('nostr-relays', JSON.stringify([cleanRelay]));
      } else {
        NostrTransport.addRelay(cleanRelay);
      }
      console.log('[Host Mock Relay] Configured relay from URL:', cleanRelay, relayOnly ? '(exclusive)' : '');
    }
  } catch { }

  await NostrTransport.connect();

  // Listen for connection signals from client
  NostrTransport.subscribeSignals(async (signal) => {
    const { type, session: sessionId, data, senderPubKey } = signal;

    if (type === 'host_ping') {
      console.log(`[Host] Received reachability ping from ${senderPubKey.slice(0, 8)}...`);
      const authorized = isClientAuthorized(senderPubKey);
      if (!authorized) {
        try {
          await NostrTransport.sendSignal(senderPubKey, {
            type: 'host_pong',
            session: sessionId,
            data: {
              status: 'blocked',
              reason: isWhitelistEnforced() && loadAuthorizedClients().length === 0
                ? 'Host whitelist is active and empty (all connections blocked).'
                : 'Client ID is not in host authorized clients list.'
            }
          });
        } catch (e) {
          console.warn('[Host] Failed to send blocked host_pong:', e);
        }
        return;
      }

      const currentPin = localStorage.getItem(STORAGE_HOST_PIN) || dom.hostPinInput?.value?.trim() || '';
      const streamActive = isHostStreamLive();
      const hostDeviceName = dom.hostNameInput?.value?.trim() || localStorage.getItem(STORAGE_HOST_NAME) || 'Host Device';

      try {
        await NostrTransport.sendSignal(senderPubKey, {
          type: 'host_pong',
          session: sessionId,
          data: {
            status: 'ready',
            name: hostDeviceName,
            streamActive,
            bridgeLive: bridgeConnected,
            pinRequired: !!currentPin
          }
        });
        console.log(`[Host] Sent host_pong response to ${senderPubKey.slice(0, 8)}...`);
      } catch (err) {
        console.warn('[Host] Failed to send host_pong response:', err);
      }
      return;
    }

    if (type === 'unattended_offer') {
      console.log(`[Host] Incoming connection request from ${senderPubKey.slice(0, 8)}...`);

      // Verify Client Whitelist (if enforced)
      if (!isClientAuthorized(senderPubKey)) {
        const clients = loadAuthorizedClients();
        const reason = (isWhitelistEnforced() && clients.length === 0)
          ? 'Host whitelist is active and empty. Please add your Client ID to the host authorized clients list.'
          : 'Unauthorized client public key';
        console.warn(`[Host Security] Blocked connection from ${senderPubKey.slice(0, 8)}... (${reason})`);
        try {
          await NostrTransport.sendSignal(senderPubKey, {
            type: 'close',
            session: sessionId,
            data: reason
          });
        } catch {}
        return;
      }

      try {
        // Decompress signal
        const decompressed = decompressSignal(data);
        const { sdp, candidates, pin } = decompressed;

        // Verify Password / PIN dynamically
        const currentPin = localStorage.getItem(STORAGE_HOST_PIN) || dom.hostPinInput?.value?.trim() || '';
        if (currentPin && pin !== currentPin) {
          console.warn('[Host] Rejected connection: Invalid Password / PIN');
          try {
            await NostrTransport.sendSignal(senderPubKey, {
              type: 'close',
              session: sessionId,
              data: 'Invalid host password / PIN'
            });
          } catch {}
          return;
        }

        // Reject if host desktop capture is not active
        if (!isHostStreamLive()) {
          const reason = 'Host desktop capture is inactive. Click "Start Desktop Capture" on the host computer.';
          console.warn(`[Host Security] Blocked unattended connection from ${senderPubKey.slice(0, 8)}… (${reason})`);
          try {
            await NostrTransport.sendSignal(senderPubKey, {
              type: 'close',
              session: sessionId,
              data: reason
            });
          } catch {}
          return;
        }

        const stream = hostStream;

        // Create PeerSession joiner (keep persistent hostStream alive across sessions)
        if (activeSession) {
          try { activeSession.close({ stopTracks: false }); } catch {}
        }

        const peerSession = PeerSession.create({
          dontStopTracksOnClose: true,
          onLog: (m) => console.log('[Host P2P]', m),
          onInputEvent: (evt) => {
            if (evt.t === 'session_ended') {
              console.log('[Host] Remote controller finished session');
              dom.hostConnectedPeer.textContent = 'None';
              dom.hostStatusBadge.className = 'host-status-badge badge--connected';
              dom.hostStatusText.textContent = isHostStreamLive() ? 'Online & Streaming (Ready)' : 'Online & Listening';
              if (activeSession) {
                try { activeSession.close({ stopTracks: false }); } catch {}
                activeSession = null;
              }
              return;
            }
            if (evt.t === 'control_request') {
              // Immediately grant control to authorized client
              peerSession.sendInput({ t: 'control_granted' });
              return;
            }
            if (evt.t === 'set_quality') {
              const preset = evt.preset;
              let bitrate = 8_000_000;
              let fps = 60;
              if (preset === 'crisp') {
                bitrate = 15_000_000;
                fps = 30;
              } else if (preset === 'balanced') {
                bitrate = 8_000_000;
                fps = 60;
              } else if (preset === 'low') {
                bitrate = 2_000_000;
                fps = 30;
              }
              if (peerSession?.setVideoQuality) {
                peerSession.setVideoQuality(bitrate, fps);
              }
              peerSession.sendInput({ t: 'quality_ack', preset, bitrate, fps });
              return;
            }
            if (evt.t === 'clipboard') {
              const text = evt.text || '';
              if (bridgeConnected && bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
                try { bridgeWs.send(JSON.stringify({ t: 'clipboard', text })); } catch {}
              } else if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).catch(() => {});
              }
              peerSession.sendInput({ t: 'clipboard_ack', status: 'ok' });
              return;
            }
            if (evt.t === 'get_clipboard') {
              if (bridgeConnected && bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
                try { bridgeWs.send(JSON.stringify({ t: 'get_clipboard' })); } catch {}
              } else if (navigator.clipboard?.readText) {
                navigator.clipboard.readText().then(text => {
                  peerSession.sendInput({ t: 'clipboard', text });
                }).catch(() => {
                  peerSession.sendInput({ t: 'clipboard', text: '' });
                });
              }
              return;
            }
            if (evt.t === 'get_monitors') {
              if (bridgeConnected && bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
                try { bridgeWs.send(JSON.stringify({ t: 'get_monitors' })); } catch {}
              } else {
                peerSession.sendInput({ t: 'monitors', monitors: [{ id: 1, name: 'Main Display' }] });
              }
              return;
            }
            if (evt.t === 'reselect_screen') {
              if (dom.btnToggleCapture) {
                startDesktopCapture(true);
              }
              return;
            }
            if (evt.t === 'control_request') {
              if (!bridgeConnected || !bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) {
                connectBridge(false);
              }
              peerSession.sendInput({
                t: 'control_granted',
                hostName: dom.hostNameInput?.value?.trim() || 'Remote Host',
                hasVideo: isHostStreamLive(),
                bridgeActive: bridgeConnected
              });
              return;
            }
            if (bridgeConnected && bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
              try { bridgeWs.send(JSON.stringify(evt)); } catch {}
            } else {
              if (!bridgeConnected && !bridgeReconnectTimer) {
                scheduleBridgeReconnect(true);
              }
            }
          },
          onCallEnded: () => {
            console.log('[Host] Remote controller ended call');
            dom.hostConnectedPeer.textContent = 'None';
            dom.hostStatusBadge.className = 'host-status-badge badge--connected';
            dom.hostStatusText.textContent = isHostStreamLive() ? 'Online & Streaming (Ready)' : 'Online & Listening';
            if (activeSession) {
              try { activeSession.close({ stopTracks: false }); } catch {}
              activeSession = null;
            }
          },
          onChannelOpen: () => {
            console.log('[Host] P2P Connected with remote controller!');

            // Proactively ensure bridge is connected or connecting
            if (!bridgeConnected || !bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) {
              console.log('[Host] Remote client connected while bridge disconnected; attempting immediate bridge reconnect...');
              connectBridge(false);
            }

            // Automatically grant control to the authorized client!
            peerSession.sendInput({
              t: 'control_granted',
              hostName: dom.hostNameInput?.value?.trim() || 'Remote Host',
              hasVideo: isHostStreamLive(),
              bridgeActive: bridgeConnected
            });

            // If screen capture is not active, alert the controller
            if (!isHostStreamLive()) {
              peerSession.sendInput({
                t: 'host_status',
                bridgeActive: bridgeConnected,
                hasVideo: false,
                warning: 'Host screen capture is not active. Click "Start Desktop Capture" on the host computer.'
              });
            } else {
              peerSession.sendInput({
                t: 'host_status',
                bridgeActive: bridgeConnected,
                hasVideo: true,
                warning: !bridgeConnected ? 'Host OS Bridge is disconnected — input control is paused (view-only).' : ''
              });
            }

            const clients = loadAuthorizedClients();
            const auth = clients.find(c => c.pubkey === senderPubKey.toLowerCase());
            const peerLabel = auth ? `${auth.name} (${senderPubKey.slice(0, 6)}…)` : `${senderPubKey.slice(0, 8)}…`;
            dom.hostConnectedPeer.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = peerLabel;
            dom.hostConnectedPeer.appendChild(span);
            if (!auth) {
              const btnAuth = document.createElement('button');
              btnAuth.className = 'btn btn--small btn--primary';
              btnAuth.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:0.7rem;';
              btnAuth.textContent = '+ Authorize Client';
              btnAuth.onclick = () => {
                const name = prompt('Nickname for this authorized client:', 'My Client');
                if (name !== null) {
                  addAuthorizedClient(senderPubKey, name);
                  btnAuth.remove();
                  span.textContent = `${name || 'Client'} (${senderPubKey.slice(0, 6)}…)`;
                }
              };
              dom.hostConnectedPeer.appendChild(btnAuth);
            }
            dom.hostStatusBadge.className = 'host-status-badge badge--connected';
            dom.hostStatusText.textContent = 'Active Remote Session';
          },
          onChannelClose: () => {
            console.log('[Host] Controller disconnected');
            dom.hostConnectedPeer.textContent = 'None';
            dom.hostStatusBadge.className = 'host-status-badge badge--connected';
            dom.hostStatusText.textContent = isHostStreamLive() ? 'Online & Streaming (Ready)' : 'Online & Listening';
          }
        });

        activeSession = peerSession;

        // Accept offer and attach desktop stream directly to the offer's transceivers
        const answer = await peerSession.acceptOffer(sdp, { stream });
        if (candidates && candidates.length) {
          await peerSession.addIceCandidates(candidates);
        }

        // Gather local candidates (1.5s)
        await new Promise(r => setTimeout(r, 1500));
        const localCandidates = peerSession.getLocalCandidates();

        // Send answer
        const answerData = compressSignal({
          sdp: { type: answer.type, sdp: answer.sdp },
          candidates: localCandidates.map(c => ({
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex
          }))
        });

        await NostrTransport.sendSignal(senderPubKey, {
          type: 'unattended_answer',
          session: sessionId,
          data: answerData
        });

        console.log('[Host] Sent auto-accept answer to controller');
      } catch (err) {
        console.error('[Host] Failed to auto-accept session:', err);
      }
    }
  });

  // Keepalive heartbeat
  setInterval(() => {
    NostrTransport.ensureConnected();
  }, 20000);
}

function compressSignal(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const compressed = window.pako.deflate(bytes, { level: 9 });
  const binary = String.fromCharCode.apply(null, compressed);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decompressSignal(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const decompressed = window.pako.inflate(bytes);
  return JSON.parse(new TextDecoder().decode(decompressed));
}

// ── 5. Event Listeners ──────────────────────────────────────────────
dom.btnToggleCapture?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (captureActionLock) return;

  // If capture is currently live or hostStream exists or button says "Stop", ONLY STOP!
  // NEVER prompt for capture when user is trying to stop!
  if (isHostStreamLive() || hostStream !== null || (dom.btnToggleCapture.textContent && dom.btnToggleCapture.textContent.includes('Stop'))) {
    await stopDesktopCapture();
    return;
  }

  // Otherwise, user clicked to START capture
  captureActionLock = true;
  setTimeout(() => { captureActionLock = false; }, 600);
  try {
    const stream = await ensureDesktopCapture();
    if (!stream) {
      console.log('[Host] User cancelled screen capture selection');
      return;
    }
  } catch (err) {
    if (isUserCancellation(err)) {
      console.log('[Host] User cancelled screen capture selection');
      return;
    }
    console.error('[Host] Capture error:', err);
    alert('Capture could not start:\n' + (err.message || err) + '\n\nIf running on macOS, please verify Screen Recording permission is enabled in:\nSystem Settings > Privacy & Security > Screen Recording (for Google Chrome and Terminal).');
  }
});

dom.btnCopyPairingToken?.addEventListener('click', () => {
  const token = hostIdentity?.publicKey || '';
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    dom.btnCopyPairingToken.textContent = 'Copied! ✓';
    setTimeout(() => { dom.btnCopyPairingToken.textContent = 'Copy Host Public Key'; }, 2000);
  });
});

document.getElementById('btn-copy-connect-link')?.addEventListener('click', () => {
  const token = hostIdentity?.publicKey || '';
  if (!token) return;
  const pin = localStorage.getItem(STORAGE_HOST_PIN) || dom.hostPinInput?.value?.trim() || '';
  const clientUrl = window.location.href.replace(/host\.html.*$/, 'index.html');
  const link = `${clientUrl}?remoteHost=${token}${pin ? '#pin=' + encodeURIComponent(pin) : ''}`;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('btn-copy-connect-link');
    if (btn) {
      btn.textContent = 'Link Copied! ✓';
      setTimeout(() => { btn.textContent = '🔗 Copy 1-Click Connect Link'; }, 2000);
    }
  });
});

dom.btnRecheckBridge?.addEventListener('click', () => {
  connectBridge(true);
});

document.getElementById('btn-copy-curl-bridge')?.addEventListener('click', () => {
  const code = document.getElementById('cmd-curl-bridge')?.textContent?.trim();
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-curl-bridge');
      if (btn) {
        btn.textContent = 'Copied! ✓';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      }
    });
  }
});

document.getElementById('btn-copy-ps-bridge')?.addEventListener('click', () => {
  const code = document.getElementById('cmd-ps-bridge')?.textContent?.trim();
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-ps-bridge');
      if (btn) {
        btn.textContent = 'Copied! ✓';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      }
    });
  }
});

// ── Background Service Guide Interactions ────────────────────────────
const btnToggleServiceCard = document.getElementById('btn-toggle-service-card');
const serviceGuideBody = document.getElementById('service-guide-body');
const linkShowServiceGuide = document.getElementById('link-show-service-guide');

btnToggleServiceCard?.addEventListener('click', () => {
  if (!serviceGuideBody) return;
  const isHidden = serviceGuideBody.classList.toggle('hidden');
  btnToggleServiceCard.textContent = isHidden ? 'Show Guide ▾' : 'Hide Guide ▴';
});

linkShowServiceGuide?.addEventListener('click', (e) => {
  e.preventDefault();
  if (serviceGuideBody) {
    serviceGuideBody.classList.remove('hidden');
    if (btnToggleServiceCard) btnToggleServiceCard.textContent = 'Hide Guide ▴';
  }
  document.getElementById('service-guide-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Floating Scroll-to-Top Button
window.addEventListener('scroll', () => {
  if (dom.btnScrollTop) {
    if (window.scrollY > 250) {
      dom.btnScrollTop.style.display = 'inline-flex';
    } else {
      dom.btnScrollTop.style.display = 'none';
    }
  }
});
dom.btnScrollTop?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelectorAll('[data-service-tab]').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    const targetOs = tabBtn.dataset.serviceTab;
    document.querySelectorAll('[data-service-tab]').forEach(btn => btn.classList.remove('active'));
    tabBtn.classList.add('active');

    document.querySelectorAll('.service-tab-pane').forEach(pane => {
      pane.classList.add('hidden');
    });
    const targetPane = document.getElementById(`service-tab-${targetOs}`);
    if (targetPane) targetPane.classList.remove('hidden');
  });
});

document.querySelectorAll('.btn-copy-code').forEach(btn => {
  btn.addEventListener('click', () => {
    const code = btn.dataset.code;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied! ✓';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    }
  });
});

dom.hostWhitelistToggle?.addEventListener('change', () => {
  setWhitelistEnforced(dom.hostWhitelistToggle.checked);
});

dom.btnAddAuthClient?.addEventListener('click', () => {
  const pk = dom.newAuthPubkey?.value.trim();
  const name = dom.newAuthName?.value.trim();
  if (!pk) {
    alert('Please enter a 64-character hex Nostr public key.');
    return;
  }
  const success = addAuthorizedClient(pk, name);
  if (success) {
    dom.newAuthPubkey.value = '';
    dom.newAuthName.value = '';
  }
});

// Modal Start Capture listeners
dom.btnModalStartCapture?.addEventListener('click', async () => {
  hideStartCaptureModal();
  try {
    await ensureDesktopCapture();
  } catch (err) {
    console.warn('[Host] Screen capture cancelled or failed from modal prompt:', err);
  }
});

dom.btnModalDismissCapture?.addEventListener('click', () => {
  hideStartCaptureModal();
  try {
    sessionStorage.setItem('p2p_host_capture_dismissed', '1');
  } catch {}
});

dom.hostScreenPlaceholder?.addEventListener('click', async () => {
  if (captureActionLock) return;
  if (!isHostStreamLive()) {
    try {
      await ensureDesktopCapture();
    } catch (err) {
      if (!isUserCancellation(err)) {
        console.warn('[Host] Screen capture cancelled or failed from placeholder click:', err);
      }
    }
  }
});

// Host Log Package Download Listener
document.getElementById('btn-host-download-logpkg')?.addEventListener('click', async () => {
  try {
    showToast('Generating host diagnostic package…');
    const pkg = await DiagnosticLogger.generateLogPackage({
      session: hostSession,
      relayList: NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : [],
      extra: {
        role: 'host',
        bridgeConnected: isBridgeConnected(),
        streamLive: isHostStreamLive(),
        whitelistEnabled: isWhitelistEnabled()
      }
    });
    DiagnosticLogger.downloadLogPackage(pkg, `p2p-host-diagnostic-${Date.now()}.json`);
    showToast('Host diagnostic package downloaded! 📥');
  } catch (e) {
    showToast('Failed to export diagnostics: ' + e.message);
  }
});

// Auto-init on load
(async () => {
  try {
    await initHostIdentity();
    updateWhitelistFilter();
    renderAuthorizedClients();
    connectBridge();
    await initSignaling();

    // Prompt user to start desktop capture immediately with entire screen, unless already live or explicitly dismissed
    const alreadyDismissed = sessionStorage.getItem('p2p_host_capture_dismissed') === '1';
    if (!isHostStreamLive() && !alreadyDismissed) {
      showStartCaptureModal();
    }
  } catch (err) {
    console.error('[HostController] Initialization error:', err);
    if (dom.hostPubkeyDisplay) {
      dom.hostPubkeyDisplay.textContent = 'Error loading ID';
      dom.hostPubkeyDisplay.title = err?.message || String(err);
    }
    if (dom.hostStatusBadge) {
      dom.hostStatusBadge.className = 'badge badge--failed';
    }
    if (dom.hostStatusText) {
      dom.hostStatusText.textContent = 'Init Failed: ' + (err?.message || err);
    }
  }
})();
