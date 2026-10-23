/**
 * support-controller.js — AI Support Agent Bridge & Live Desk Controller
 *
 * Connects to Nostr relays under the dedicated AI Support Agent identity.
 * Ingests incoming encrypted diagnostic packages (kind 24133), relays them
 * to the local Python Diagnostic Engine, renders tickets, and transmits
 * automated diagnostic replies back to remote users.
 */

'use strict';

import { NostrTransport } from './nostr-transport.js';
import { NostrCrypto } from './nostr-crypto.js';
import { NostrSignaling } from './nostr-signaling.js';

const STORAGE_KEY_SUPPORT_PRIV = 'p2p-support-privkey';
const STORAGE_KEY_SUPPORT_PUB = 'p2p-support-pubkey';
const STORAGE_KEY_SUPPORT_WHITELIST_ENABLED = 'p2p-support-whitelist-enabled';
const STORAGE_KEY_SUPPORT_WHITELIST = 'p2p-support-authorized-clients';
const LOCAL_PYTHON_INGEST_URL = 'http://127.0.0.1:9998/api/logpkg';
const LOCAL_PYTHON_CHAT_URL = 'http://127.0.0.1:9998/api/chat';
const LOCAL_PYTHON_SCREENSHOT_URL = 'http://127.0.0.1:9998/api/screenshot';
const LOCAL_PYTHON_WHITELIST_URL = 'http://127.0.0.1:9998/api/whitelist';

export const SupportController = (() => {
  let identity = null;
  const tickets = [];
  const screenshotBuffers = new Map();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const dom = {
    statusBadge: document.getElementById('support-status'),
    pubkeyDisplay: document.getElementById('support-pubkey-display'),
    btnCopyPubkey: document.getElementById('btn-copy-support-pubkey'),
    relayList: document.getElementById('relay-status-list'),
    whitelistToggle: document.getElementById('support-whitelist-toggle'),
    whitelistBadge: document.getElementById('support-whitelist-badge'),
    newClientPubkey: document.getElementById('new-support-client-pubkey'),
    newClientName: document.getElementById('new-support-client-name'),
    btnAddClient: document.getElementById('btn-add-support-client'),
    clientsList: document.getElementById('support-authorized-clients-list'),
    ticketsContainer: document.getElementById('tickets-container'),
    ticketCount: document.getElementById('ticket-count'),
    terminal: document.getElementById('support-terminal'),
  };

  function log(msg, level = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${msg}`;
    if (dom.terminal) {
      dom.terminal.innerHTML += `\n${line}`;
      dom.terminal.scrollTop = dom.terminal.scrollHeight;
    }
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(msg);
  }

  /**
   * Load identity: first try local support-identity.json via fetch, then localStorage.
   */
  async function loadSupportIdentity() {
    try {
      const resp = await fetch('support-agent/support-identity.json');
      if (resp.ok) {
        const data = await resp.json();
        if (data.privateKey && data.publicKey) {
          identity = { privateKey: data.privateKey, publicKey: data.publicKey };
          localStorage.setItem(STORAGE_KEY_SUPPORT_PRIV, data.privateKey);
          localStorage.setItem(STORAGE_KEY_SUPPORT_PUB, data.publicKey);
          log('Loaded Support Agent identity from support-identity.json', 'info');
          return identity;
        }
      }
    } catch { }

    // Fallback to localStorage
    const priv = localStorage.getItem(STORAGE_KEY_SUPPORT_PRIV);
    const pub = localStorage.getItem(STORAGE_KEY_SUPPORT_PUB);
    if (priv && pub && priv.length === 64 && pub.length === 64) {
      identity = { privateKey: priv, publicKey: pub };
      log('Loaded Support Agent identity from localStorage', 'info');
      return identity;
    }

    // Generate new if missing
    log('Generating fresh Support Agent keypair…', 'info');
    identity = await NostrCrypto.generateKeypair();
    localStorage.setItem(STORAGE_KEY_SUPPORT_PRIV, identity.privateKey);
    localStorage.setItem(STORAGE_KEY_SUPPORT_PUB, identity.publicKey);
    return identity;
  }

  function renderRelayStates() {
    if (!dom.relayList) return;
    const states = NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : [];
    dom.relayList.innerHTML = states.map(r => {
      const isConn = r.state === 'connected';
      const cls = isConn ? 'support-badge' : 'support-badge support-badge--offline';
      return `<span class="${cls}">${isConn ? '●' : '○'} ${r.url}</span>`;
    }).join(' ');

    const hasConn = states.some(r => r.state === 'connected');
    if (dom.statusBadge) {
      if (hasConn) {
        dom.statusBadge.textContent = '● Online (Relays Active)';
        dom.statusBadge.className = 'support-badge';
      } else {
        dom.statusBadge.textContent = '○ Disconnected';
        dom.statusBadge.className = 'support-badge support-badge--offline';
      }
    }
  }

  // ── Whitelist & Flooding Protection ────────────────────────────────
  function loadAuthorizedClients() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_SUPPORT_WHITELIST)) || [];
    } catch {
      return [];
    }
  }

  function isWhitelistEnforced() {
    const val = localStorage.getItem(STORAGE_KEY_SUPPORT_WHITELIST_ENABLED);
    if (val === null) return true;
    return val === 'true';
  }

  function isClientAuthorized(pubkey) {
    if (!isWhitelistEnforced()) return true;
    const clean = (pubkey || '').trim().toLowerCase();
    if (!clean) return false;
    const clients = loadAuthorizedClients();
    if (clients.length === 0) return false;
    return clients.some(c => {
      const cpk = (c.pubkey || '').toLowerCase();
      return cpk === clean || clean.startsWith(cpk) || cpk.startsWith(clean);
    });
  }

  function updateEventFilter() {
    if (isWhitelistEnforced()) {
      NostrTransport.setEventFilter((senderPubKey) => isClientAuthorized(senderPubKey));
      log(`🛡️ Whitelist active: ${loadAuthorizedClients().length} authorized client(s)`, 'info');
    } else {
      NostrTransport.setEventFilter(null);
      log('🛡️ Whitelist disabled: open access mode', 'warn');
    }
  }

  async function syncWhitelistWithBackend() {
    try {
      const resp = await fetch(LOCAL_PYTHON_WHITELIST_URL);
      if (resp.ok) {
        const data = await resp.json();
        if (typeof data.enabled === 'boolean') {
          localStorage.setItem(STORAGE_KEY_SUPPORT_WHITELIST_ENABLED, data.enabled ? 'true' : 'false');
        }
        if (Array.isArray(data.clients)) {
          localStorage.setItem(STORAGE_KEY_SUPPORT_WHITELIST, JSON.stringify(data.clients));
        }
      }
    } catch {}
    updateEventFilter();
    renderWhitelistUI();
  }

  async function setWhitelistEnforced(enabled) {
    localStorage.setItem(STORAGE_KEY_SUPPORT_WHITELIST_ENABLED, enabled ? 'true' : 'false');
    try {
      await fetch(LOCAL_PYTHON_WHITELIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, clients: loadAuthorizedClients() })
      });
    } catch {}
    updateEventFilter();
    renderWhitelistUI();
  }

  async function addAuthorizedClient(pubkey, name = '') {
    let clean = (pubkey || '').trim().toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(clean)) {
      alert('Invalid client public key. Must be hexadecimal characters (16-64 chars).');
      return false;
    }
    const clients = loadAuthorizedClients();
    const existing = clients.find(c => c.pubkey === clean);
    if (existing) {
      if (name) existing.name = name;
    } else {
      clients.push({
        pubkey: clean,
        name: name || `Client-${clean.slice(0, 6)}`,
        addedAt: Date.now()
      });
    }
    localStorage.setItem(STORAGE_KEY_SUPPORT_WHITELIST, JSON.stringify(clients));
    try {
      await fetch(LOCAL_PYTHON_WHITELIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: isWhitelistEnforced(), clients })
      });
    } catch {}
    updateEventFilter();
    renderWhitelistUI();
    return true;
  }

  async function removeAuthorizedClient(pubkey) {
    const clients = loadAuthorizedClients().filter(c => c.pubkey !== pubkey.toLowerCase());
    localStorage.setItem(STORAGE_KEY_SUPPORT_WHITELIST, JSON.stringify(clients));
    try {
      await fetch(LOCAL_PYTHON_WHITELIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: isWhitelistEnforced(), clients })
      });
    } catch {}
    updateEventFilter();
    renderWhitelistUI();
  }

  function renderWhitelistUI() {
    if (!dom.clientsList) return;
    const enforced = isWhitelistEnforced();
    const clients = loadAuthorizedClients();

    if (dom.whitelistToggle) {
      dom.whitelistToggle.checked = enforced;
    }
    if (dom.whitelistBadge) {
      if (enforced) {
        dom.whitelistBadge.textContent = `${clients.length} Authorized Client${clients.length !== 1 ? 's' : ''}`;
        dom.whitelistBadge.className = 'support-badge';
      } else {
        dom.whitelistBadge.textContent = 'Open Access (Disabled)';
        dom.whitelistBadge.className = 'support-badge support-badge--offline';
      }
    }

    if (clients.length === 0) {
      dom.clientsList.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--c-text-dim); font-size: 0.75rem; border: 1px dashed var(--c-border); border-radius: var(--radius);">
        ${enforced ? '⚠️ Whitelist is empty — all incoming telemetry blocked.' : 'No clients explicitly whitelisted (open access active).'}
      </div>`;
      return;
    }

    dom.clientsList.innerHTML = clients.map(c => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(0,0,0,0.15); border: 1px solid var(--c-border); border-radius: var(--radius); font-size: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
          <span style="font-weight: 600; color: var(--c-primary);">${escapeHtml(c.name)}</span>
          <code style="font-family: var(--mono); color: var(--c-text-dim); font-size: 0.7rem;">${c.pubkey.slice(0, 8)}…${c.pubkey.slice(-6)}</code>
        </div>
        <button type="button" class="btn btn--small btn--outline" style="color: var(--c-danger); border-color: rgba(241,92,107,0.3); padding: 2px 8px; font-size: 0.7rem;" data-pubkey="${c.pubkey}">Remove</button>
      </div>
    `).join('');

    dom.clientsList.querySelectorAll('button[data-pubkey]').forEach(btn => {
      btn.onclick = () => removeAuthorizedClient(btn.dataset.pubkey);
    });
  }

  function renderTicketCard(ticket) {
    const { id, senderPubKey, analysis, ts } = ticket;
    const card = document.createElement('div');
    card.className = 'ticket-card';
    const status = analysis?.overallStatus || 'UNKNOWN';
    const statusClass = `ticket-status--${status}`;
    const timeStr = new Date(ts).toLocaleTimeString();
    const shortPk = senderPubKey ? `${senderPubKey.slice(0, 8)}…${senderPubKey.slice(-6)}` : 'Unknown User';

    const rootCausesHtml = (analysis?.rootCauses || ['None identified'])
      .map(rc => `<li style="margin-bottom: 4px; color: var(--c-danger);">❌ ${rc}</li>`).join('');

    const recsHtml = (analysis?.recommendations || ['None'])
      .map(r => `<li style="margin-bottom: 4px; color: var(--c-primary);">👉 ${r}</li>`).join('');

    card.innerHTML = `
      <div class="ticket-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: 0.85rem;">Ticket from ${shortPk}</span>
          <span style="font-size: 0.7rem; color: var(--c-text-dim);">${timeStr}</span>
        </div>
        <span class="ticket-status ${statusClass}">${status}</span>
      </div>
      <div style="font-size: 0.75rem; margin-bottom: 8px;">
        <strong>Root Causes:</strong>
        <ul style="margin: 4px 0 8px 18px; padding: 0;">${rootCausesHtml}</ul>
      </div>
      <div style="font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: var(--radius);">
        <strong>Suggestions for Developer:</strong>
        <ul style="margin: 4px 0 0 18px; padding: 0;">${recsHtml}</ul>
      </div>
      <div style="font-size: 0.68rem; color: var(--c-text-dim); margin-top: 8px; display: flex; justify-content: space-between;">
        <span>🔒 Advisory Mode: Developer Review Required</span>
        <span>ID: ${id}</span>
      </div>
    `;

    if (tickets.length === 1 && dom.ticketsContainer) {
      dom.ticketsContainer.innerHTML = '';
    }
    dom.ticketsContainer?.prepend(card);
    if (dom.ticketCount) {
      dom.ticketCount.textContent = `${tickets.length} ticket${tickets.length > 1 ? 's' : ''} received`;
    }
  }

  /**
   * Handle incoming encrypted diagnostic signals from remote user over Nostr.
   */
  async function handleDiagnosticSignal(signal) {
    const { type, data, senderPubKey } = signal;

    if (!isClientAuthorized(senderPubKey)) {
      log(`🛡️ Dropped diagnostic signal from unauthorized sender ${senderPubKey.slice(0, 8)}…`, 'warn');
      return;
    }

    if (type === 'diagnostic_screenshot') {
      const sessionId = signal.session || ('ss-' + senderPubKey);
      const totalChunks = signal.totalChunks || 1;
      const chunkIndex = signal.chunkIndex || 0;

      log(`📸 Diagnostic screenshot chunk ${chunkIndex + 1}/${totalChunks} from ${senderPubKey.slice(0, 8)}…`, 'info');

      // Periodic purge of old buffers older than 2 minutes
      const now = Date.now();
      for (const [k, v] of screenshotBuffers) {
        if (now - v.ts > 120000) screenshotBuffers.delete(k);
      }

      if (!screenshotBuffers.has(sessionId)) {
        screenshotBuffers.set(sessionId, {
          chunks: new Array(totalChunks),
          received: 0,
          total: totalChunks,
          fileName: signal.fileName || 'screenshot.jpg',
          fileSize: signal.fileSize || 0,
          senderPubKey,
          ts: now
        });
      }

      const buffer = screenshotBuffers.get(sessionId);
      if (!buffer.chunks[chunkIndex]) {
        buffer.chunks[chunkIndex] = signal.data;
        buffer.received++;
      }

      if (buffer.received < buffer.total) {
        return; // wait for remaining chunks
      }

      // All chunks assembled!
      screenshotBuffers.delete(sessionId);
      let imgData = buffer.chunks.join('');

      // If data is pako-compressed (legacy clients), inflate it
      if (imgData.length > 0 && !imgData.startsWith('data:')) {
        try {
          let b64 = imgData.replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4 !== 0) b64 += '=';
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const decompressed = pako.inflate(bytes);
          imgData = new TextDecoder().decode(decompressed);
        } catch {}
      }

      if (imgData) {
        try {
          await fetch(LOCAL_PYTHON_SCREENSHOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderPubKey: buffer.senderPubKey, data: imgData }),
          });
          log(`✅ Screenshot saved to diagnostics-inbox/ from ${buffer.senderPubKey.slice(0, 8)}…`, 'info');
        } catch (e) {
          log(`Failed to forward screenshot to port 9998: ${e.message}`, 'warn');
        }

        renderScreenshotTicketCard({
          id: 'ss-' + Date.now().toString(36),
          senderPubKey: buffer.senderPubKey,
          fileName: buffer.fileName,
          fileSize: buffer.fileSize,
          imgUrl: imgData,
          ts: Date.now()
        });

        // Send confirmation receipt over Nostr back to remote user
        NostrTransport.sendMessage(buffer.senderPubKey, {
          id: 'ack-ss-' + Date.now(),
          text: `🤖 [AI Support Agent] Screenshot received: "${buffer.fileName}"! Our developer can now inspect it.`,
        }).catch(() => {});
      }
      return;
    }

    if (type === 'user_comment') {
      log(`💬 User comment received from ${senderPubKey.slice(0, 8)}: "${signal.text}"`, 'info');
      try {
        await fetch(LOCAL_PYTHON_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderPubKey, text: signal.text }),
        });
        log(`✅ User comment saved to diagnostics-inbox/ from ${senderPubKey.slice(0, 8)}…`, 'info');
      } catch (e) {
        log(`Failed to forward comment to port 9998: ${e.message}`, 'warn');
      }
      return;
    }

    if (type !== 'diagnostic_logpkg') return;

    log(`📥 Incoming diagnostic log package received from ${senderPubKey.slice(0, 8)}…`, 'info');

    let pkg;
    try {
      // Decode compressed data
      let b64 = data.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const decompressed = pako.inflate(bytes);
      const jsonStr = new TextDecoder().decode(decompressed);
      pkg = JSON.parse(jsonStr);
    } catch (parseErr) {
      log(`Failed to decompress logpkg: ${parseErr.message}`, 'error');
      return;
    }

    // Forward to local Python Diagnostic Engine
    let analysis = null;
    try {
      const resp = await fetch(LOCAL_PYTHON_INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg),
      });
      if (resp.ok) {
        const result = await resp.json();
        analysis = result.analysis;
        log(`✅ Logpkg processed by local AI agent. Status: ${analysis?.overallStatus}`, 'info');
      }
    } catch (engineErr) {
      log(`Local Python engine not reachable on 9998: ${engineErr.message}`, 'warn');
    }

    // Fallback client-side analysis if Python engine is not currently running
    if (!analysis) {
      const isBridgeDown = pkg.meta?.hostBridgeActive === false;
      const rootCauses = [];
      const recs = [];
      if (isBridgeDown) {
        rootCauses.push('Host OS Bridge (bridge.py) is disconnected on port 9999 (session is View-Only).');
        recs.push('Run python3 remote-desktop-host/bridge.py on the host computer to restore input control.');
      }
      if (pkg.webrtc?.connectionState === 'failed') {
        rootCauses.push('WebRTC connection state is "failed". Symmetric NAT or enterprise firewall blocking direct P2P.');
        recs.push('Configure a TURN server under Settings > Custom ICE Servers.');
      }
      if (rootCauses.length === 0) {
        rootCauses.push('Communication parameters and signaling telemetry appear normal.');
        recs.push('Keep browser tab active to maintain WebRTC ICE consent freshness.');
      }
      analysis = {
        overallStatus: rootCauses.some(rc => rc.includes('failed') || rc.includes('disconnected')) ? 'WARNING' : 'HEALTHY',
        rootCauses,
        recommendations: recs,
      };
    }

    const ticket = {
      id: 'tkt-' + Date.now().toString(36),
      senderPubKey,
      pkg,
      analysis,
      ts: Date.now(),
    };
    tickets.push(ticket);
    renderTicketCard(ticket);

    // Send automated helpful diagnosis reply back to the remote user over Nostr
    try {
      const rootCausesText = (analysis.rootCauses || []).map(rc => `• ${rc}`).join('\n') || 'None';
      const recsText = (analysis.recommendations || []).map(r => `• ${r}`).join('\n') || 'Communication parameters appear normal.';
      const replyMessage = `🤖 [AI Diagnostic Analysis]\nStatus: ${analysis.overallStatus}\n\nFindings:\n${rootCausesText}\n\nRecommendations:\n${recsText}\n\n(Advisory Mode: Our developer has received these diagnostic recommendations).`;

      await NostrTransport.sendMessage(senderPubKey, {
        id: 'reply-' + Date.now(),
        text: replyMessage,
      });
      log(`📤 Diagnostic advisory reply sent to user ${senderPubKey.slice(0, 8)}…`, 'info');
    } catch (replyErr) {
      log(`Failed to send reply to user: ${replyErr.message}`, 'warn');
    }
  }

  function renderChatTicketCard(chatTicket) {
    const { id, senderPubKey, userText, botReply, clarification, suggestions, ts } = chatTicket;
    const card = document.createElement('div');
    card.className = 'ticket-card';
    const timeStr = new Date(ts).toLocaleTimeString();
    const shortPk = senderPubKey ? `${senderPubKey.slice(0, 8)}…${senderPubKey.slice(-6)}` : 'Unknown User';

    const suggestionsHtml = (suggestions || ['Inspect connection state and logs'])
      .map(s => `<li style="margin-bottom: 4px; color: var(--c-primary);">👉 ${escapeHtml(s)}</li>`).join('');

    card.innerHTML = `
      <div class="ticket-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: 0.85rem;">💬 User Chat from ${shortPk}</span>
          <span style="font-size: 0.7rem; color: var(--c-text-dim);">${timeStr}</span>
        </div>
        <span class="ticket-status ticket-status--HEALTHY">ACTIVE CHAT</span>
      </div>
      <div style="font-size: 0.78rem; margin-bottom: 8px; background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: var(--radius);">
        <strong>User Message:</strong> "${escapeHtml(userText)}"
      </div>
      <div style="font-size: 0.75rem; background: rgba(0, 168, 132, 0.08); border-left: 3px solid var(--c-primary); padding: 8px 12px; border-radius: var(--radius); margin-bottom: 8px;">
        <strong>AI Agent Reply:</strong>
        <div style="margin-top: 4px; white-space: pre-wrap; color: var(--c-text);">${escapeHtml(botReply)}</div>
      </div>
      <div style="font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: var(--radius);">
        <strong>Suggestions for Developer:</strong>
        <ul style="margin: 4px 0 0 18px; padding: 0;">${suggestionsHtml}</ul>
      </div>
      <div style="font-size: 0.68rem; color: var(--c-text-dim); margin-top: 8px; display: flex; justify-content: space-between;">
        <span>🔒 Advisory Mode: Developer Review Required</span>
        <span>ID: ${id}</span>
      </div>
    `;

    if (tickets.length === 0 && dom.ticketsContainer) {
      dom.ticketsContainer.innerHTML = '';
    }
    dom.ticketsContainer?.prepend(card);
    tickets.push(chatTicket);
    if (dom.ticketCount) {
      dom.ticketCount.textContent = `${tickets.length} ticket${tickets.length > 1 ? 's' : ''} received`;
    }
  }

  function renderScreenshotTicketCard(screenshotTicket) {
    const { id, senderPubKey, fileName, fileSize, imgUrl, ts } = screenshotTicket;
    const card = document.createElement('div');
    card.className = 'ticket-card';
    const timeStr = new Date(ts).toLocaleTimeString();
    const shortPk = senderPubKey ? `${senderPubKey.slice(0, 8)}…${senderPubKey.slice(-6)}` : 'Unknown User';

    card.innerHTML = `
      <div class="ticket-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: 0.85rem;">📷 Screenshot from ${shortPk}</span>
          <span style="font-size: 0.7rem; color: var(--c-text-dim);">${timeStr}</span>
        </div>
        <span class="ticket-status ticket-status--HEALTHY">P2P RECEIVED</span>
      </div>
      <div style="font-size: 0.75rem; margin-bottom: 8px;">
        <strong>File:</strong> ${escapeHtml(fileName)} (${(fileSize / 1024).toFixed(1)} KB) — <em>Transferred directly via WebRTC DataChannel (Zero Nostr Quota)</em>
      </div>
      <div style="text-align: center; margin: 10px 0; background: #000; padding: 8px; border-radius: var(--radius);">
        <img src="${imgUrl}" style="max-width: 100%; max-height: 320px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" alt="Screenshot" />
      </div>
      <div style="font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: var(--radius);">
        <strong>Suggestions for Developer:</strong>
        <div style="margin-top: 4px; color: var(--c-primary);">👉 Saved to diagnostics-inbox/ for visual review of connection error or UI state.</div>
      </div>
      <div style="font-size: 0.68rem; color: var(--c-text-dim); margin-top: 8px; display: flex; justify-content: space-between;">
        <span>🔒 Advisory Mode: Developer Review Required</span>
        <span>ID: ${id}</span>
      </div>
    `;

    if (tickets.length === 0 && dom.ticketsContainer) {
      dom.ticketsContainer.innerHTML = '';
    }
    dom.ticketsContainer?.prepend(card);
    tickets.push(screenshotTicket);
    if (dom.ticketCount) {
      dom.ticketCount.textContent = `${tickets.length} ticket${tickets.length > 1 ? 's' : ''} received`;
    }
  }

  function handleReceivedP2pFile(blob, fileName, meta, senderPubKey) {
    if (!isClientAuthorized(senderPubKey)) {
      log(`🛡️ Dropped P2P file from unauthorized sender ${senderPubKey.slice(0, 8)}…`, 'warn');
      return;
    }
    const name = fileName || 'screenshot.jpg';
    log(`📥 P2P File received: ${name} (${(blob.size / 1024).toFixed(1)} KB) from ${senderPubKey.slice(0, 8)}…`, 'info');

    const imgUrl = URL.createObjectURL(blob);
    renderScreenshotTicketCard({
      id: 'ss-' + Date.now().toString(36),
      senderPubKey,
      fileName: name,
      fileSize: blob.size,
      imgUrl,
      ts: Date.now(),
    });

    // Convert blob to base64 and forward to Python server
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await fetch(LOCAL_PYTHON_SCREENSHOT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderPubKey,
            fileName: name,
            data: reader.result,
          }),
        });
        log(`✅ Screenshot saved to diagnostics-inbox/ from ${senderPubKey.slice(0, 8)}…`, 'info');
      } catch (err) {
        log(`Failed to forward screenshot to Python engine: ${err.message}`, 'warn');
      }
    };
    reader.readAsDataURL(blob);

    // Send confirmation over Nostr
    NostrTransport.sendMessage(senderPubKey, {
      id: 'ack-' + Date.now(),
      text: `🤖 [AI Support Agent] Screenshot received: "${name}" (${(blob.size / 1024).toFixed(1)} KB) via P2P direct transfer! Our developer can now inspect it.`,
    }).catch(() => {});
  }

  /**
   * Handle incoming chat messages from users.
   */
  async function handleIncomingMessage(incoming) {
    const { id, text, senderPubKey } = incoming;
    if (!text || !senderPubKey) return;
    if (identity && senderPubKey === identity.publicKey) return; // Ignore own reflection
    if (!isClientAuthorized(senderPubKey)) {
      log(`🛡️ Dropped chat message from unauthorized sender ${senderPubKey.slice(0, 8)}…`, 'warn');
      return;
    }

    log(`💬 User message from ${senderPubKey.slice(0, 8)}: "${text}"`, 'info');

    let replyData = null;
    try {
      const resp = await fetch(LOCAL_PYTHON_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderPubKey, text, id }),
      });
      if (resp.ok) {
        replyData = await resp.json();
      }
    } catch (e) {
      log(`Python engine chat endpoint not reachable: ${e.message}`, 'warn');
    }

    if (!replyData) {
      replyData = {
        reply: `🤖 [AI Support Agent Response]\nStatus: UNKNOWN\n\nI received your message: "${text}".\n\n❓ Clarification Question:\nCould you please click '📋 Send Diag' in your chat to transmit your connection telemetry so I can diagnose the issue?\n\n(Advisory Mode: Our developer has received these diagnostic recommendations).`,
        clarification: 'Could you please click 📋 Send Diag in your chat to transmit your connection telemetry?',
        developerSuggestions: ['Local Python engine offline. Start python3 support-agent/ai-diagnostic-agent.py for live rules engine.'],
      };
    }

    renderChatTicketCard({
      id: 'chat-' + Date.now().toString(36),
      senderPubKey,
      userText: text,
      botReply: replyData.reply,
      clarification: replyData.clarification,
      suggestions: replyData.developerSuggestions,
      ts: Date.now(),
    });

    try {
      await NostrTransport.sendMessage(senderPubKey, {
        id: 'reply-' + Date.now(),
        text: replyData.reply,
      });
      log(`📤 Diagnostic reply sent to user ${senderPubKey.slice(0, 8)}…`, 'info');
    } catch (err) {
      log(`Failed to transmit reply to user: ${err.message}`, 'warn');
    }
  }

  async function init() {
    log('Initializing AI Support Agent Desk…', 'info');

    // 1. Load Support identity
    const id = await loadSupportIdentity();
    if (dom.pubkeyDisplay) {
      dom.pubkeyDisplay.textContent = id.publicKey;
    }
    if (dom.btnCopyPubkey) {
      dom.btnCopyPubkey.onclick = () => {
        navigator.clipboard.writeText(id.publicKey);
        alert('Support Agent Public Key copied to clipboard!');
      };
    }

    // 2. Initialize NostrTransport
    NostrTransport.init(id.privateKey, id.publicKey, {
      onLog: (msg, level) => log(`[Nostr] ${msg}`, level),
      onRelayStatus: () => renderRelayStates(),
    });

    // 3. Sync and enforce client whitelist pre-decryption gate
    await syncWhitelistWithBackend();

    if (dom.whitelistToggle) {
      dom.whitelistToggle.onchange = () => {
        setWhitelistEnforced(dom.whitelistToggle.checked);
      };
    }
    if (dom.btnAddClient) {
      dom.btnAddClient.onclick = () => {
        const pk = dom.newClientPubkey?.value?.trim();
        const name = dom.newClientName?.value?.trim() || '';
        if (pk) {
          addAuthorizedClient(pk, name).then(ok => {
            if (ok) {
              if (dom.newClientPubkey) dom.newClientPubkey.value = '';
              if (dom.newClientName) dom.newClientName.value = '';
            }
          });
        }
      };
    }

    // 4. Connect to Nostr relays
    await NostrTransport.connect();
    renderRelayStates();

    // 5. Subscribe to diagnostic signals
    NostrTransport.subscribeSignals(handleDiagnosticSignal);

    // 6. Subscribe to incoming chat messages
    NostrTransport.subscribeMessages(handleIncomingMessage);

    // 7. Initialize P2P Signaling to accept incoming P2P screenshot & data transfers
    NostrSignaling.init({
      onSessionCreated: (sessionId, session, remotePubKey, role) => {
        log(`[P2P] WebRTC session created with ${remotePubKey.slice(0, 8)}… (${role})`);
      },
      onConnected: (sessionId) => {
        log(`[P2P] Direct WebRTC P2P connection active! (Session: ${sessionId})`);
      },
      onDisconnected: (sessionId) => {
        log(`[P2P] WebRTC session disconnected: ${sessionId}`);
      },
      onError: (sessionId, err) => {
        log(`[P2P] WebRTC signaling error: ${err}`, 'warn');
      },
      onIncomingRequest: (senderPubKey, sessionId) => {
        log(`[P2P] Auto-accepting incoming P2P session from ${senderPubKey.slice(0, 8)}…`);
      },
      onLog: (msg, level) => log(`[Signaling] ${msg}`, level),
      buildIceServers: () => [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
      getSessionConfig: (sessionId, remotePubKey, role) => ({
        onFileReceived: (blob, fileName, meta) => {
          handleReceivedP2pFile(blob, fileName, meta, remotePubKey);
        },
      }),
    });

    log('🚀 AI Support Agent active and listening on Nostr relays.', 'info');
  }

  return {
    init,
    isClientAuthorized,
    isWhitelistEnforced,
    addAuthorizedClient,
    removeAuthorizedClient,
    loadAuthorizedClients,
    setWhitelistEnforced,
  };
})();

// Auto-run on page load
SupportController.init().catch(err => {
  console.error('SupportController init error:', err);
});
