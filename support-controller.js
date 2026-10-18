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

const STORAGE_KEY_SUPPORT_PRIV = 'p2p-support-privkey';
const STORAGE_KEY_SUPPORT_PUB = 'p2p-support-pubkey';
const LOCAL_PYTHON_INGEST_URL = 'http://127.0.0.1:9998/api/logpkg';

export const SupportController = (() => {
  let identity = null;
  const tickets = [];

  const dom = {
    statusBadge: document.getElementById('support-status'),
    pubkeyDisplay: document.getElementById('support-pubkey-display'),
    btnCopyPubkey: document.getElementById('btn-copy-support-pubkey'),
    relayList: document.getElementById('relay-status-list'),
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
   * Handle incoming encrypted diagnostic log package from remote user over Nostr.
   */
  async function handleDiagnosticSignal(signal) {
    const { type, data, senderPubKey } = signal;
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
      analysis = {
        overallStatus: (pkg.webrtc?.connectionState === 'failed' || pkg.recentLogs?.length > 0) ? 'WARNING' : 'HEALTHY',
        rootCauses: ['Diagnostic package received over Nostr; local Python engine offline.'],
        recommendations: ['Run python3 support-agent/ai-diagnostic-agent.py to enable local rules engine.'],
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

  /**
   * Handle incoming chat messages from users.
   */
  function handleIncomingMessage(incoming) {
    const { id, text, senderPubKey } = incoming;
    log(`💬 User message from ${senderPubKey.slice(0, 8)}: "${text}"`, 'info');
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

    // 3. Connect to Nostr relays
    await NostrTransport.connect();
    renderRelayStates();

    // 4. Subscribe to diagnostic signals
    NostrTransport.subscribeSignals(handleDiagnosticSignal);

    // 5. Subscribe to incoming chat messages
    NostrTransport.subscribeMessages(handleIncomingMessage);

    log('🚀 AI Support Agent active and listening on Nostr relays.', 'info');
  }

  return { init };
})();

// Auto-run on page load
SupportController.init().catch(err => {
  console.error('SupportController init error:', err);
});
