/**
 * ui-controller.js — WhatsApp-style UI controller for P2P Connect.
 * Orchestrates: contact list, chat panels, Nostr signaling, manual signaling,
 * media calls, settings, key management, and chat backup/restore.
 */
'use strict';

import { TokenCodec } from './token-codec.js';
import { PeerSession } from './webrtc-core.js';
import { NostrCrypto } from './nostr-crypto.js';
import { NostrTransport } from './nostr-transport.js';
import { NostrSignaling } from './nostr-signaling.js';
import { ChatStore } from './chat-store.js';

(() => {
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    badge: $('#connection-badge'), badgeLabel: $('#connection-label'),
    // Top bar
    relayStatusMini: $('#relay-status-mini'),
    btnSettings: $('#btn-settings'),
    // Sidebar
    sidebar: $('#sidebar'),
    myPubkeyShort: $('#my-pubkey-short'),
    btnNewContact: $('#btn-new-contact'),
    contactSearch: $('#contact-search'),
    contactList: $('#contact-list'),
    btnCreateSession: $('#btn-create-session'),
    btnJoinSession: $('#btn-join-session'),
    // Chat panel
    chatPanel: $('#chat-panel'),
    chatEmpty: $('#chat-empty'),
    chatActive: $('#chat-active'),
    chatHeader: $('#chat-header'),
    btnChatBack: $('#btn-chat-back'),
    chatAvatar: $('#chat-avatar'),
    chatAvatarLetter: $('#chat-avatar-letter'),
    chatContactName: $('#chat-contact-name'),
    chatContactStatus: $('#chat-contact-status'),
    btnConnectPeer: $('#btn-connect-peer'),
    btnAudioCall: $('#btn-audio-call'),
    btnVideoCall: $('#btn-video-call'),
    btnChatMenu: $('#btn-chat-menu'),
    chatMenu: $('#chat-menu'),
    btnClearChat: $('#btn-clear-chat'),
    btnDeleteContact: $('#btn-delete-contact'),
    connectBanner: $('#connect-banner'),
    connectBannerText: $('#connect-banner-text'),
    connectProgress: $('#connect-progress'),
    chatMessages: $('#chat-messages'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    btnSend: $('#btn-send'),
    fileInput: $('#file-input'),
    fileProgress: $('#file-progress'),
    fileProgressLabel: $('#file-progress-label'),
    fileProgressBar: $('#file-progress-bar'),
    // Manual panel
    manualPanel: $('#manual-panel'),
    btnManualBack: $('#btn-manual-back'),
    manualPanelTitle: $('#manual-panel-title'),
    manualPanelContent: $('#manual-panel-content'),
    // Call overlay
    callOverlay: $('#call-overlay'),
    localVideo: $('#local-video'),
    remoteVideo: $('#remote-video'),
    remoteNoVideo: $('#remote-no-video'),
    btnToggleAudio: $('#btn-toggle-audio'),
    btnToggleVideo: $('#btn-toggle-video'),
    btnScreenShare: $('#btn-screenshare'),
    btnEndCall: $('#btn-end-call'),
    cameraSelect: $('#camera-select'),
    resolutionSelect: $('#resolution-select'),
    speakerSelect: $('#speaker-select'),
    // Settings modal
    settingsModal: $('#settings-modal'),
    btnCloseSettings: $('#btn-close-settings'),
    settingsPubkey: $('#settings-pubkey'),
    btnCopyPubkey: $('#btn-copy-pubkey'),
    qrPubkey: $('#qr-pubkey'),
    relayUrlInput: $('#relay-url-input'),
    btnAddRelay: $('#btn-add-relay'),
    relayList: $('#relay-list'),
    btnResetRelays: $('#btn-reset-relays'),
    turnUrl: $('#turn-url'), turnUser: $('#turn-user'), turnCred: $('#turn-cred'),
    btnSaveTurn: $('#btn-save-turn'),
    btnExportKey: $('#btn-export-key'),
    importKeyFile: $('#import-key-file'),
    settingsPrivkey: $('#settings-privkey'),
    btnTogglePrivkey: $('#btn-toggle-privkey'),
    btnCopyPrivkey: $('#btn-copy-privkey'),
    btnRegenerateKey: $('#btn-regenerate-key'),
    btnBackupChats: $('#btn-backup-chats'),
    importBackupFile: $('#import-backup-file'),
    storageInfo: $('#storage-info'),
    // Add contact modal
    addContactModal: $('#add-contact-modal'),
    btnCloseAddContact: $('#btn-close-add-contact'),
    newContactPubkey: $('#new-contact-pubkey'),
    newContactNickname: $('#new-contact-nickname'),
    btnScanContactQr: $('#btn-scan-contact-qr'),
    btnAddContactConfirm: $('#btn-add-contact-confirm'),
    // Password modal
    passwordModal: $('#password-modal'),
    passwordModalTitle: $('#password-modal-title'),
    passwordModalDesc: $('#password-modal-desc'),
    passwordInput: $('#password-input'),
    passwordConfirmField: $('#password-confirm-field'),
    passwordConfirm: $('#password-confirm'),
    btnPasswordCancel: $('#btn-password-cancel'),
    btnPasswordOk: $('#btn-password-ok'),
    btnClosePassword: $('#btn-close-password'),
    // Incoming call
    incomingCall: $('#incoming-call'),
    incomingCallAvatar: $('#incoming-call-avatar'),
    incomingCallLetter: $('#incoming-call-letter'),
    incomingCallName: $('#incoming-call-name'),
    btnAcceptCall: $('#btn-accept-call'),
    btnRejectCall: $('#btn-reject-call'),
    // QR / Inspect
    qrModal: $('#qr-modal'),
    btnCloseScanner: $('#btn-close-scanner'),
    inspectModal: $('#inspect-modal'),
    btnCloseInspect: $('#btn-close-inspect'),
    inspectInput: $('#inspect-input'),
    btnDecodeToken: $('#btn-decode-token'),
    inspectType: $('#inspect-type'), inspectVersion: $('#inspect-version'),
    inspectTs: $('#inspect-ts'), inspectIceCount: $('#inspect-ice-count'),
    inspectSdp: $('#inspect-sdp'), inspectCandidates: $('#inspect-candidates'),
  };

  // ── State ──
  let session = null;
  let nostrIdentity = null;
  let nostrActiveSessionId = null;
  let sessionRemotePubKey = null;
  let activeContactPubkey = null;
  let messageIdCounter = 0;
  let mediaActive = false;
  let isMobile = window.innerWidth <= 768;
  let pendingRemoteStream = null; // Holds incoming stream until user accepts
  let pendingRemoteStreamPubkey = null; // Who the incoming call is from
  const pendingMsgs = new Map();

  // ── SOUND ENGINE (Synthesized) ──
  const SoundEngine = (() => {
    let ctx = null;
    let ringInterval = null;

    function init() {
      if (!ctx && window.AudioContext) {
        ctx = new window.AudioContext();
      }
    }

    function playTone(freq, type, duration, vol, delay = 0) {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    }

    return {
      playMessage: () => {
        init();
        // Subtle double pop
        playTone(600, 'sine', 0.15, 0.3, 0);
        playTone(800, 'sine', 0.2, 0.2, 0.1);
      },
      startRing: () => {
        init();
        if (ringInterval) return;
        const ring = () => {
          // Calm, gentle double chime (C5 + E5 major third chord)
          playTone(523.25, 'sine', 0.8, 0.15, 0); 
          playTone(659.25, 'sine', 0.8, 0.15, 0); 
          playTone(523.25, 'triangle', 0.6, 0.05, 0); 
          
          playTone(523.25, 'sine', 0.8, 0.15, 1.0); 
          playTone(659.25, 'sine', 0.8, 0.15, 1.0);
          playTone(523.25, 'triangle', 0.6, 0.05, 1.0);
        };
        ring();
        ringInterval = setInterval(ring, 3000);
      },
      stopRing: () => {
        if (ringInterval) {
          clearInterval(ringInterval);
          ringInterval = null;
        }
      }
    };
  })();
  const CONTACTS_KEY = 'nostr-contacts';

  // ── Helpers ──
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied!`); }
    catch { toast('Copy failed.'); }
  }
  function setBadge(state, label) {
    dom.badge.className = `badge badge--${state}`;
    dom.badgeLabel.textContent = label;
  }
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function getAvatarColor(pubkey) {
    const colors = ['#00a884','#53bdeb','#8b5cf6','#fb923c','#f87171','#fbbf24','#34d399','#6366f1'];
    let hash = 0;
    for (let i = 0; i < 8; i++) hash = (hash << 4) + parseInt(pubkey[i], 16);
    return colors[Math.abs(hash) % colors.length];
  }

  // ── Contact CRUD ──
  function loadContacts() { try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || []; } catch { return []; } }
  function saveContacts(c) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); }
  function addContact(pubkey, nickname) {
    const contacts = loadContacts();
    const existing = contacts.find(c => c.pubkey === pubkey);
    if (existing) { existing.nickname = nickname; } else { contacts.push({ pubkey, nickname }); }
    saveContacts(contacts);
  }
  function removeContact(pubkey) { saveContacts(loadContacts().filter(c => c.pubkey !== pubkey)); }
  function getContactNickname(pubkey) { return loadContacts().find(c => c.pubkey === pubkey)?.nickname || ''; }
  function getContactDisplayName(pubkey) { return getContactNickname(pubkey) || pubkey.slice(0, 8) + '…' + pubkey.slice(-6); }
  function renameContact(pubkey, newName) {
    const contacts = loadContacts();
    const c = contacts.find(c => c.pubkey === pubkey);
    if (c) { c.nickname = newName; saveContacts(contacts); }
  }

  // ── Message Request Queue ──
  const pendingRequests = [];
  let currentRequest = null;

  function showNextMessageRequest() {
    if (currentRequest) return; // one at a time
    if (pendingRequests.length === 0) return;
    currentRequest = pendingRequests.shift();
    const modal = document.getElementById('msg-request-modal');
    document.getElementById('msg-request-pubkey').textContent = currentRequest.senderPubKey;
    document.getElementById('msg-request-preview').textContent = currentRequest.text;
    document.getElementById('msg-request-nickname').value = '';
    show(modal);
  }

  // ── Mobile Navigation ──
  function showChatPanel() {
    if (isMobile) {
      dom.sidebar.classList.add('sidebar--hidden');
      dom.chatPanel.classList.add('chat-panel--active');
      if (!history.state || history.state.panel !== 'chat') {
        history.pushState({ panel: 'chat' }, 'Chat', '');
      }
    }
  }
  function showSidebar() {
    if (isMobile) {
      dom.sidebar.classList.remove('sidebar--hidden');
      dom.chatPanel.classList.remove('chat-panel--active');
    }
  }
  
  window.addEventListener('popstate', (e) => {
    if (isMobile && dom.chatPanel.classList.contains('chat-panel--active')) {
      showSidebar(); // They hit device Back button
    }
  });
  
  window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });

  // ── Render Contact List ──
  function renderContacts(filter = '') {
    const contacts = loadContacts();
    const lowerFilter = filter.toLowerCase();
    dom.contactList.innerHTML = '';

    if (contacts.length === 0) {
      dom.contactList.innerHTML = `<div class="contact-list__empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        <p>No contacts yet</p><p style="font-size:.75rem;margin-top:4px;">Tap + to add a contact</p></div>`;
      return;
    }

    // Sort by last message timestamp
    const sorted = contacts.map(c => {
      const last = ChatStore.getLastMessage(c.pubkey);
      return { ...c, lastTs: last?.ts || 0, lastText: last?.text || '', lastSender: last?.sender || '' };
    }).filter(c => {
      if (!lowerFilter) return true;
      return (c.nickname || '').toLowerCase().includes(lowerFilter) || c.pubkey.includes(lowerFilter);
    }).sort((a, b) => b.lastTs - a.lastTs);

    for (const c of sorted) {
      const div = document.createElement('div');
      div.className = 'contact-item' + (c.pubkey === activeContactPubkey ? ' active' : '');
      const letter = (c.nickname || c.pubkey)[0].toUpperCase();
      const color = getAvatarColor(c.pubkey);
      const time = c.lastTs ? formatTime(c.lastTs) : '';
      const preview = c.lastText
        ? (c.lastSender === 'self' ? 'You: ' : '') + c.lastText.slice(0, 40)
        : 'No messages yet';
      const pubShort = c.pubkey.slice(0, 6) + '…' + c.pubkey.slice(-4);
      div.innerHTML = `
        <div class="avatar avatar--small" style="background:${color}"><span>${escapeHtml(letter)}</span></div>
        <div class="contact-item__info">
          <div class="contact-item__top">
            <span class="contact-item__name">${escapeHtml(c.nickname || c.pubkey.slice(0, 12) + '…')}</span>
            <span class="contact-item__time">${time}</span>
          </div>
          <div class="contact-item__preview">${escapeHtml(preview)}</div>
          <div class="contact-item__pubkey" title="${escapeHtml(c.pubkey)}">${pubShort}</div>
        </div>`;
      div.addEventListener('click', () => openChat(c.pubkey));
      dom.contactList.appendChild(div);
    }
  }

  let connectionTimeout = null;

  // ── Open Chat ──
  function openChat(pubkey) {
    activeContactPubkey = pubkey;
    const name = getContactDisplayName(pubkey);
    const letter = (getContactNickname(pubkey) || pubkey)[0].toUpperCase();
    dom.chatAvatarLetter.textContent = letter;
    dom.chatAvatar.style.background = getAvatarColor(pubkey);
    dom.chatContactName.textContent = name;
    dom.chatContactName.title = pubkey;
    // Update pubkey subtitle in header
    const pubSub = document.getElementById('chat-contact-pubkey');
    if (pubSub) {
      pubSub.textContent = pubkey.slice(0, 8) + '…' + pubkey.slice(-6);
      pubSub.title = pubkey;
    }
    
    hide(dom.chatEmpty);
    hide(dom.manualPanel);
    show(dom.chatActive);
    showChatPanel();
    renderChatMessages(pubkey);
    renderContacts(dom.contactSearch.value);

    // ALWAYS enable chat input to allow offline messaging
    dom.chatInput.disabled = false;
    dom.btnSend.disabled = false;
    dom.fileInput.disabled = false;
    dom.chatInput.focus();

    const isConnected = session && nostrActiveSessionId && sessionRemotePubKey === pubkey && session.isChannelOpen?.();
    const isConnecting = session && nostrActiveSessionId && sessionRemotePubKey === pubkey && session.getState?.() !== 'closed' && session.getState?.() !== 'failed';
    
    if (isConnected) {
        dom.chatContactStatus.textContent = 'Connected';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
        show(dom.btnAudioCall);
        show(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
    } else if (isConnecting) {
        dom.chatContactStatus.textContent = 'Connecting via Nostr...';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
        hide(dom.btnAudioCall);
        hide(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
    } else {
        dom.chatContactStatus.textContent = 'Connecting via Nostr...';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
        hide(dom.btnAudioCall);
        hide(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
        
        // Auto connect
        if (nostrIdentity) {
            clearTimeout(connectionTimeout);
            
            // If we already have an active session with someone else, do not auto-connect and orphan them!
            if (session && session.getState?.() !== 'closed' && session.getState?.() !== 'failed' && sessionRemotePubKey !== pubkey) {
               dom.chatContactStatus.textContent = 'Offline (Busy)';
               dom.chatContactStatus.className = 'chat-header__status';
               show(dom.btnConnectPeer);
            } else {
               NostrSignaling.startSession(pubkey).then(sid => {
                   nostrActiveSessionId = sid;
                   sessionRemotePubKey = pubkey;
                   connectionTimeout = setTimeout(() => {
                       if (nostrActiveSessionId === sid && (!session || !session.isChannelOpen?.())) {
                           dom.chatContactStatus.textContent = 'Offline';
                           dom.chatContactStatus.className = 'chat-header__status';
                           show(dom.btnConnectPeer); // allow manual retry
                       }
                   }, 15000);
               }).catch(err => {
                   dom.chatContactStatus.textContent = 'Offline';
                   dom.chatContactStatus.className = 'chat-header__status';
                   show(dom.btnConnectPeer);
               });
            }
        }
    }
  }

  // ── Render Chat Messages ──
  function renderChatMessages(pubkey) {
    dom.chatMessages.innerHTML = '';
    const messages = ChatStore.getMessages(pubkey);
    let lastDate = '';

    for (const msg of messages) {
      const dateStr = formatDate(msg.ts);
      if (dateStr !== lastDate) {
        lastDate = dateStr;
        const sep = document.createElement('div');
        sep.className = 'chat-date-sep';
        sep.textContent = dateStr;
        dom.chatMessages.appendChild(sep);
      }
      appendChatBubble(msg);
    }
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  function appendChatBubble(msg) {
    if (msg.type === 'system') {
      const div = document.createElement('div');
      div.className = 'chat-msg chat-msg--system';
      div.textContent = msg.text;
      dom.chatMessages.appendChild(div);
      return div;
    }

    const div = document.createElement('div');
    div.className = `chat-msg chat-msg--${msg.sender}`;
    div.dataset.id = msg.id;

    let content = escapeHtml(msg.text);
    if (msg.type === 'file' && msg.fileName) {
      content = `📎 ${escapeHtml(msg.fileName)}`;
    }

    const ticks = msg.sender === 'self'
      ? `<span class="chat-msg__ticks ${msg.status === 'delivered' ? '' : 'chat-msg__ticks--pending'}">${msg.status === 'delivered' ? '✓✓' : '✓'}</span>`
      : '';

    div.innerHTML = `<div class="chat-msg__text">${content}</div>
      <div class="chat-msg__meta"><span>${formatTime(msg.ts)}</span>${ticks}</div>`;
    dom.chatMessages.appendChild(div);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return div;
  }

  function sendChatMessage(text) {
    if (!activeContactPubkey) return;
    const targetPubKey = activeContactPubkey; // Capture for timeout closure
    const id = `m${++messageIdCounter}-${Date.now()}`;
    const payload = JSON.stringify({ id, text });
    
    let status = 'pending';
    if (session && session.isChannelOpen && session.isChannelOpen()) {
        const sent = session.send(payload);
        if (sent) {
            status = 'sent';
            // Start a 3-second fallback timer just in case WebRTC silently dropped it (zombie state)
            setTimeout(() => {
                const currentMsg = ChatStore.getMessages(targetPubKey).find(m => m.id === id);
                // If it's not delivered via WebRTC ack, peer is likely gone despite channel saying open
                if (currentMsg && currentMsg.status !== 'delivered' && nostrIdentity && NostrTransport.isConnected()) {
                    console.log('[WebRTC] Message ack timeout, falling back to Nostr transport');
                    NostrTransport.sendMessage(targetPubKey, { id, text }).catch(() => {});
                }
            }, 3000);
        }
    } else if (nostrIdentity && NostrTransport.isConnected()) {
        // Fall back to Nostr relay for offline delivery
        NostrTransport.sendMessage(targetPubKey, { id, text })
          .then(() => {
            ChatStore.updateMessageStatus(targetPubKey, id, 'sent');
            const el = pendingMsgs.get(id);
            if (el) {
              const ticks = el.querySelector('.chat-msg__ticks');
              if (ticks) { ticks.textContent = '✓'; ticks.classList.remove('chat-msg__ticks--pending'); }
            }
          })
          .catch(() => { /* stay pending */ });
        status = 'pending'; // will update to 'sent' on relay acceptance
    }

    const msg = { id, text, sender: 'self', ts: Date.now(), status, type: 'text' };
    ChatStore.addMessage(targetPubKey, msg);
    const el = appendChatBubble(msg);
    pendingMsgs.set(id, el);
    renderContacts(dom.contactSearch.value);
  }

  function markDelivered(pubkey, id) {
    if (!pubkey) return;
    ChatStore.updateMessageStatus(pubkey, id, 'delivered');
    if (activeContactPubkey === pubkey) {
      const el = pendingMsgs.get(id);
      if (el) {
        const ticks = el.querySelector('.chat-msg__ticks');
        if (ticks) { ticks.textContent = '✓✓'; ticks.classList.remove('chat-msg__ticks--pending'); }
        pendingMsgs.delete(id);
      }
    }
  }

  // ── ICE servers ──
  const ICE_STORAGE_KEY = 'custom-ice-servers';
  const DEFAULT_ICE_SERVERS = [
    // STUN — Google (most reliable, global)
    { urls: 'stun:stun.l.google.com:19302', _builtin: true },
    { urls: 'stun:stun1.l.google.com:19302', _builtin: true },
    { urls: 'stun:stun2.l.google.com:19302', _builtin: true },
    // STUN — Cloudflare
    { urls: 'stun:stun.cloudflare.com:3478', _builtin: true },
    // STUN — Mozilla
    { urls: 'stun:stun.services.mozilla.com:3478', _builtin: true },
    // STUN — stunprotocol.org
    { urls: 'stun:stunserver.stunprotocol.org:3478', _builtin: true },
    // TURN — Metered OpenRelay (free, port 80/443 to bypass firewalls)
    { urls: 'turn:standard.relay.metered.ca:80', username: 'e8dd65b92f3adf2fa4c66419', credential: '5VuMjsBamlMGwNkP', _builtin: true },
    { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: 'e8dd65b92f3adf2fa4c66419', credential: '5VuMjsBamlMGwNkP', _builtin: true },
    { urls: 'turn:standard.relay.metered.ca:443', username: 'e8dd65b92f3adf2fa4c66419', credential: '5VuMjsBamlMGwNkP', _builtin: true },
    { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'e8dd65b92f3adf2fa4c66419', credential: '5VuMjsBamlMGwNkP', _builtin: true },
  ];

  function loadCustomIceServers() {
    try { return JSON.parse(localStorage.getItem(ICE_STORAGE_KEY)) || []; } catch { return []; }
  }
  function saveCustomIceServers(list) {
    localStorage.setItem(ICE_STORAGE_KEY, JSON.stringify(list));
  }

  function buildIceServers() {
    // Combine built-in + user custom; strip _builtin flag for WebRTC API
    const all = [...DEFAULT_ICE_SERVERS, ...loadCustomIceServers()];
    return all.map(s => {
      const entry = { urls: s.urls };
      if (s.username) entry.username = s.username;
      if (s.credential) entry.credential = s.credential;
      return entry;
    });
  }

  function renderIceServerList() {
    const list = document.getElementById('ice-server-list');
    if (!list) return;
    list.innerHTML = '';
    const customs = loadCustomIceServers();
    const all = [...DEFAULT_ICE_SERVERS.map(s => ({ ...s, custom: false })), ...customs.map(s => ({ ...s, custom: true }))];
    for (const server of all) {
      const li = document.createElement('li');
      li.className = 'relay-item';
      const isStun = server.urls.startsWith('stun');
      const badge = isStun ? '🟢 STUN' : '🔵 TURN';
      const label = server.urls.replace(/^(stun|turn|turns):/, '').replace(/\?.*$/, '');
      li.innerHTML = `
        <span class="relay-item__url">
          <span style="font-size:.7rem;padding:2px 5px;border-radius:4px;background:${isStun ? '#1a3a2a' : '#1a2a3a'};color:${isStun ? '#4caf50' : '#42a5f5'};margin-right:6px;">${badge}</span>
          ${escapeHtml(label)}
          ${server.custom ? '<span style="font-size:.65rem;color:#888;margin-left:4px;">(custom)</span>' : '<span style="font-size:.65rem;color:#555;margin-left:4px;">(built-in)</span>'}
        </span>`;
      if (server.custom) {
        const btn = document.createElement('button');
        btn.className = 'btn btn--small btn--outline';
        btn.textContent = '✕';
        btn.style.cssText = 'padding:2px 8px;font-size:.75rem;min-width:auto;';
        btn.addEventListener('click', () => {
          const updated = loadCustomIceServers().filter(s => s.urls !== server.urls);
          saveCustomIceServers(updated);
          renderIceServerList();
          toast('Server removed.');
        });
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  }

  // ── Connection state handler ──
  function handleStateChange(state) {
    switch (state) {
      case 'gathering': setBadge('gathering', 'Gathering ICE'); break;
      case 'connecting': setBadge('connecting', 'Connecting'); break;
      case 'connected':
        setBadge('connected', 'Connected');
        break;
      case 'failed': setBadge('failed', 'Failed'); break;
      case 'disconnected': setBadge('failed', 'Disconnected'); break;
      case 'closed': setBadge('closed', 'Closed'); break;
    }
    
    // Only update chat header if we are looking at the person this session belongs to
    if (dom.chatContactStatus && sessionRemotePubKey === activeContactPubkey) {
      if (state === 'connected') {
        dom.chatContactStatus.textContent = 'Connected';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        dom.chatContactStatus.textContent = 'Offline';
        dom.chatContactStatus.className = 'chat-header__status';
      }
    }
  }

  function enableChat() {
    dom.chatInput.disabled = false;
    dom.btnSend.disabled = false;
    dom.fileInput.disabled = false;
    show(dom.btnAudioCall);
    show(dom.btnVideoCall);
    hide(dom.btnConnectPeer);
    dom.chatInput.focus();
  }

  function disableChat() {
    // We strictly DO NOT disable chat inputs anymore to allow offline messaging
    hide(dom.btnAudioCall);
    hide(dom.btnVideoCall);
    show(dom.btnConnectPeer);
  }

  // ── Build Nostr session config (callbacks for PeerSession) ──
  function buildNostrSessionConfig(sessionId, remotePubKey, sessionRole) {
    return {
      onLog: () => {},
      onStateChange: handleStateChange,
      onIceCandidate: () => {},
      onIceComplete: () => {},
      onChannelOpen: () => {
        if (remotePubKey === activeContactPubkey) {
          enableChat();
          hide(dom.connectBanner);
        }
        
        // Flush pending messages
        const offlineMsgs = ChatStore.getMessages(remotePubKey).filter(m => m.sender === 'self' && m.status === 'pending');
        for (const m of offlineMsgs) {
            if (m.type === 'text') {
                if (session && session.send(JSON.stringify({ id: m.id, text: m.text }))) {
                    ChatStore.updateMessageStatus(remotePubKey, m.id, 'sent');
                }
            }
        }
      },
      onChannelClose: () => {
        if (remotePubKey === activeContactPubkey) {
          disableChat();
        }
        endMediaCall();
      },
      onCallEnded: () => {
        if (remotePubKey === activeContactPubkey && mediaActive) {
          endMediaCall();
          toast('Peer ended the call.');
        }
      },
      onMessage: (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed._ack) { markDelivered(remotePubKey, parsed._ack); return; }
          const msg = { id: parsed.id || 'p-' + Date.now(), text: parsed.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' };
          ChatStore.addMessage(remotePubKey, msg);
          if (activeContactPubkey === remotePubKey) {
            appendChatBubble(msg);
            if (document.hidden) SoundEngine.playMessage();
          } else {
            SoundEngine.playMessage();
          }
          session.send(JSON.stringify({ _ack: parsed.id }));
          renderContacts(dom.contactSearch.value);
        } catch { /* ignore malformed */ }
      },
      onError: () => {},
      onFileProgress: (pct, dir) => {
        show(dom.fileProgress);
        dom.fileProgressLabel.textContent = dir === 'sending' ? 'Sending file…' : 'Receiving file…';
        dom.fileProgressBar.value = pct;
        if (pct >= 100) setTimeout(() => hide(dom.fileProgress), 1000);
      },
      onFileReceived: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const msg = { id: 'f-' + Date.now(), text: `Received file: ${filename}`, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'file', fileName: filename };
        ChatStore.addMessage(remotePubKey, msg);
        if (activeContactPubkey === remotePubKey) {
          const div = appendChatBubble(msg);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.textContent = 'Download'; a.className = 'btn btn--small btn--primary';
          a.style.marginTop = '4px'; a.style.display = 'inline-block';
          div.querySelector('.chat-msg__text').appendChild(a);
        }
        renderContacts(dom.contactSearch.value);
      },
      onRemoteStream: (stream) => {
        // If we already have the call overlay open (we initiated the call), just play
        if (mediaActive) {
          dom.remoteVideo.srcObject = stream;
          dom.remoteVideo.play().catch(() => {});
          hide(dom.remoteNoVideo);
          return;
        }
        // Otherwise, show incoming call prompt — don't auto-play
        pendingRemoteStream = stream;
        pendingRemoteStreamPubkey = remotePubKey;
        showIncomingCallPrompt(remotePubKey);
      },
      onRemoteStreamEnded: () => {
        dom.remoteVideo.srcObject = null;
        show(dom.remoteNoVideo);
        // If call was active, end it
        if (mediaActive) {
          endMediaCall();
          toast('Peer ended the call.');
        }
      },
    };
  }

  // ── Media call ──
  const RES_MAP = {
    '480': { width: { ideal: 640 }, height: { ideal: 480 } },
    '720': { width: { ideal: 1280 }, height: { ideal: 720 } },
    '1080': { width: { ideal: 1920 }, height: { ideal: 1080 } },
    '1440': { width: { ideal: 2560 }, height: { ideal: 1440 } },
  };

  async function populateDeviceSelectors() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');

      if (dom.cameraSelect) {
        const prevCam = dom.cameraSelect.value;
        dom.cameraSelect.innerHTML = '';
        cameras.forEach((cam, i) => {
          const opt = document.createElement('option');
          opt.value = cam.deviceId;
          opt.textContent = cam.label || `Camera ${i + 1}`;
          dom.cameraSelect.appendChild(opt);
        });
        if (prevCam && cameras.find(c => c.deviceId === prevCam)) dom.cameraSelect.value = prevCam;

        // Allow switching camera mid-call
        dom.cameraSelect.onchange = async () => {
          if (!session || !mediaActive) return;
          try {
            const newStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: dom.cameraSelect.value }, ...getVideoConstraints() } });
            const newTrack = newStream.getVideoTracks()[0];
            if (newTrack) {
              await session.replaceVideoTrack(newTrack);
              // Update local preview
              const localStream = dom.localVideo.srcObject;
              if (localStream) {
                const oldTrack = localStream.getVideoTracks()[0];
                if (oldTrack) { localStream.removeTrack(oldTrack); oldTrack.stop(); }
                localStream.addTrack(newTrack);
              }
              toast('Camera switched.');
            }
          } catch { toast('Camera switch failed.'); }
        };
      }

      if (dom.speakerSelect) {
        dom.speakerSelect.innerHTML = '';
        speakers.forEach((spk, i) => {
          const opt = document.createElement('option');
          opt.value = spk.deviceId;
          opt.textContent = spk.label || `Speaker ${i + 1}`;
          dom.speakerSelect.appendChild(opt);
        });
        dom.speakerSelect.onchange = () => {
          if (dom.remoteVideo?.setSinkId) {
            dom.remoteVideo.setSinkId(dom.speakerSelect.value).catch(() => {});
          }
        };
      }
    } catch { /* ignore on devices that don't support enumeration */ }
  }

  function getVideoConstraints() {
    const res = dom.resolutionSelect?.value;
    const camId = dom.cameraSelect?.value;
    const c = { ...(RES_MAP[res] || {}) };
    if (camId) c.deviceId = { exact: camId };
    return c;
  }

  async function startCall(videoEnabled = true) {
    if (!session) { toast('Connect first.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoEnabled ? getVideoConstraints() : false });
      session.addLocalStream(stream);
      dom.localVideo.srcObject = stream;
      mediaActive = true;
      show(dom.callOverlay);
      populateDeviceSelectors();
      dom.btnToggleAudio.disabled = false;
      dom.btnToggleVideo.disabled = false;
      dom.btnScreenShare.disabled = false;
      dom.btnEndCall.disabled = false;
      updateCallButtons(true, videoEnabled);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        mediaActive = true;
        show(dom.callOverlay);
        populateDeviceSelectors();
        dom.btnToggleAudio.disabled = false;
        dom.btnEndCall.disabled = false;
        updateCallButtons(true, false);
        toast('Audio-only call (camera unavailable)');
      } catch (e) { toast('Cannot access media devices.'); }
    }
  }

  function endMediaCall(sendSignal = true) {
    SoundEngine.stopRing();
    if (session) {
      session.removeMedia();
      if (sendSignal && session.sendCallEnded) session.sendCallEnded();
    }
    dom.localVideo.srcObject = null;
    dom.remoteVideo.srcObject = null;
    show(dom.remoteNoVideo);
    mediaActive = false;
    pendingRemoteStream = null;
    pendingRemoteStreamPubkey = null;
    hide(dom.callOverlay);
    hide(dom.incomingCall);
    dom.btnToggleAudio.disabled = true;
    dom.btnToggleVideo.disabled = true;
    dom.btnScreenShare.disabled = true;
    dom.btnEndCall.disabled = true;
  }

  function updateCallButtons(audio, video) {
    if (audio !== null && audio !== undefined) {
      const btn = dom.btnToggleAudio;
      btn.className = 'call-btn' + (audio ? ' call-btn--active' : ' call-btn--muted');
    }
    if (video !== null && video !== undefined) {
      const btn = dom.btnToggleVideo;
      btn.className = 'call-btn' + (video ? ' call-btn--active' : '');
    }
  }

  function showIncomingCallPrompt(remotePubKey) {
    const name = getContactDisplayName(remotePubKey);
    const letter = (getContactNickname(remotePubKey) || remotePubKey)[0].toUpperCase();
    dom.incomingCallLetter.textContent = letter;
    dom.incomingCallAvatar.style.background = getAvatarColor(remotePubKey);
    dom.incomingCallName.textContent = name;
    show(dom.incomingCall);
    SoundEngine.startRing();
  }

  function acceptIncomingCall() {
    SoundEngine.stopRing();
    hide(dom.incomingCall);
    if (!pendingRemoteStream) return;

    // Play the remote stream
    dom.remoteVideo.srcObject = pendingRemoteStream;
    dom.remoteVideo.play().catch(() => {});
    hide(dom.remoteNoVideo);

    // Show call overlay and enable controls
    show(dom.callOverlay);
    populateDeviceSelectors();
    mediaActive = true;
    dom.btnToggleAudio.disabled = false;
    dom.btnToggleVideo.disabled = false;
    dom.btnScreenShare.disabled = false;
    dom.btnEndCall.disabled = false;

    const hasRemoteVideo = pendingRemoteStream.getVideoTracks().length > 0;

    // Auto-start local media (camera+mic) so the peer can see/hear us
    navigator.mediaDevices.getUserMedia({ audio: true, video: hasRemoteVideo ? getVideoConstraints() : false })
      .then(stream => {
        if (session) session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        updateCallButtons(true, hasRemoteVideo);
      })
      .catch(() => {
        // Fallback to audio only
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(stream => {
            if (session) session.addLocalStream(stream);
            dom.localVideo.srcObject = stream;
            updateCallButtons(true, false);
            toast('Audio-only (camera unavailable)');
          })
          .catch(() => toast('Cannot access media devices.'));
      });

    pendingRemoteStream = null;
    pendingRemoteStreamPubkey = null;
    toast('Call accepted!');
  }

  function rejectIncomingCall() {
    SoundEngine.stopRing();
    hide(dom.incomingCall);
    // Stop the remote stream tracks that WebRTC is providing
    pendingRemoteStream = null;
    pendingRemoteStreamPubkey = null;
    // End media on our side to signal the peer
    if (session) session.removeMedia();
    if (session && session.sendCallEnded) session.sendCallEnded();
    toast('Call rejected.');
  }

  // ── QR Scanner ──
  let scannerStream = null, scannerAnimFrame = null, scannerVideo = null;
  const QR_CAMERA_KEY = 'qr-last-camera';

  function openQrScanner(onSuccess) {
    show(dom.qrModal);
    const readerEl = document.getElementById('qr-reader');
    readerEl.innerHTML = '';

    // Camera selector
    const camRow = document.createElement('div');
    camRow.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:8px;';
    const camLabel = document.createElement('label');
    camLabel.textContent = 'Camera: ';
    camLabel.style.cssText = 'font-size:.85rem;color:#aeb7c4;white-space:nowrap;';
    const camSelect = document.createElement('select');
    camSelect.id = 'qr-camera-select';
    camSelect.style.cssText = 'flex:1;padding:6px 8px;border-radius:6px;background:#1a1d27;color:#e4e8f1;border:1px solid #2a3040;font-size:.85rem;';
    camRow.appendChild(camLabel);
    camRow.appendChild(camSelect);
    readerEl.appendChild(camRow);

    // Video element
    scannerVideo = document.createElement('video');
    scannerVideo.setAttribute('playsinline', 'true');
    scannerVideo.setAttribute('autoplay', 'true');
    scannerVideo.style.cssText = 'width:100%;max-width:400px;border-radius:8px;';
    readerEl.appendChild(scannerVideo);

    const scanCanvas = document.createElement('canvas');
    const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    function scanFrame() {
      if (!scannerStream) return;
      if (scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) { scannerAnimFrame = requestAnimationFrame(scanFrame); return; }
      const vw = scannerVideo.videoWidth, vh = scannerVideo.videoHeight;
      const scale = Math.min(1, 640 / vw);
      scanCanvas.width = Math.floor(vw * scale);
      scanCanvas.height = Math.floor(vh * scale);
      scanCtx.drawImage(scannerVideo, 0, 0, scanCanvas.width, scanCanvas.height);
      const imgData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const code = window.jsQR ? jsQR(imgData.data, scanCanvas.width, scanCanvas.height, { inversionAttempts: 'dontInvert' }) : null;
      if (code?.data) { onSuccess(code.data); closeQrScanner(); return; }
      scannerAnimFrame = requestAnimationFrame(scanFrame);
    }

    function startCameraStream(deviceId) {
      // Stop existing stream
      if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
      if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
      const constraints = { video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } }
        : { facingMode: 'environment', width: { ideal: 1280 } }
      };
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          scannerStream = stream;
          scannerVideo.srcObject = stream;
          scannerVideo.play();
          scannerAnimFrame = requestAnimationFrame(scanFrame);
          // Cache the successful camera
          const activeTrack = stream.getVideoTracks()[0];
          if (activeTrack) {
            const settings = activeTrack.getSettings();
            if (settings.deviceId) localStorage.setItem(QR_CAMERA_KEY, settings.deviceId);
          }
        })
        .catch(() => { toast('Camera access failed.'); closeQrScanner(); });
    }

    // Populate camera list
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const cameras = devices.filter(d => d.kind === 'videoinput');
      camSelect.innerHTML = '';
      cameras.forEach((cam, i) => {
        const opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${i + 1}`;
        camSelect.appendChild(opt);
      });
      // Select cached camera or default to last one (usually rear/back camera)
      const cached = localStorage.getItem(QR_CAMERA_KEY);
      if (cached && cameras.find(c => c.deviceId === cached)) {
        camSelect.value = cached;
      } else if (cameras.length > 0) {
        // Default to last camera in list (often the back camera on mobile)
        camSelect.value = cameras[cameras.length - 1].deviceId;
      }
      camSelect.addEventListener('change', () => startCameraStream(camSelect.value));
      startCameraStream(camSelect.value || null);
    }).catch(() => startCameraStream(null)); // Fallback if enumerate fails
  }

  function closeQrScanner() {
    if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
    if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
    if (scannerVideo) { scannerVideo.srcObject = null; scannerVideo = null; }
    const readerEl = document.getElementById('qr-reader');
    if (readerEl) readerEl.innerHTML = '';
    hide(dom.qrModal);
  }

  // ── Key export/import ──
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function exportKey(password) {
    if (!nostrIdentity) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(nostrIdentity.privateKey));
    const blob = new Blob([JSON.stringify({
      v: 1, salt: Array.from(salt), iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'p2p-identity.p2pkey'; a.click();
    URL.revokeObjectURL(url);
    toast('Key exported!');
  }

  async function importKey(fileContent, password) {
    const { v, salt, iv, data } = JSON.parse(fileContent);
    if (v !== 1) throw new Error('Unknown format');
    const key = await deriveKey(password, new Uint8Array(salt));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data));
    const privHex = new TextDecoder().decode(decrypted);
    if (!/^[0-9a-f]{64}$/i.test(privHex)) throw new Error('Invalid key data');
    const pubHex = await NostrCrypto.getPublicKey(privHex);
    localStorage.setItem('nostr-privkey', privHex);
    localStorage.setItem('nostr-pubkey', pubHex);
    nostrIdentity = { privateKey: privHex, publicKey: pubHex };
    toast('Key imported! Reconnecting…');
    location.reload();
  }

  // Password prompt helper
  function promptPassword(title, desc, needConfirm) {
    return new Promise((resolve, reject) => {
      dom.passwordModalTitle.textContent = title;
      dom.passwordModalDesc.textContent = desc;
      dom.passwordInput.value = '';
      dom.passwordConfirm.value = '';
      needConfirm ? show(dom.passwordConfirmField) : hide(dom.passwordConfirmField);
      show(dom.passwordModal);
      dom.passwordInput.focus();
      const cleanup = () => { hide(dom.passwordModal); dom.btnPasswordOk.onclick = null; dom.btnPasswordCancel.onclick = null; dom.btnClosePassword.onclick = null; };
      dom.btnPasswordOk.onclick = () => {
        const pw = dom.passwordInput.value;
        if (!pw) { toast('Enter a password.'); return; }
        if (needConfirm && pw !== dom.passwordConfirm.value) { toast('Passwords do not match.'); return; }
        cleanup(); resolve(pw);
      };
      dom.btnPasswordCancel.onclick = () => { cleanup(); reject(new Error('Cancelled')); };
      dom.btnClosePassword.onclick = () => { cleanup(); reject(new Error('Cancelled')); };
    });
  }

  // ── Manual Signaling ──
  function showCreateSession() {
    hide(dom.chatEmpty); hide(dom.chatActive);
    show(dom.manualPanel);
    dom.manualPanelTitle.textContent = 'Create Session';
    showChatPanel();

    // Init a manual PeerSession
    session = PeerSession.create({
      iceServers: buildIceServers(),
      onLog: () => {}, onStateChange: handleStateChange,
      onIceCandidate: () => {}, onIceComplete: () => {},
      onChannelOpen: () => { enableChat(); hide(dom.manualPanel); show(dom.chatActive); toast('Connected!'); },
      onChannelClose: () => { disableChat(); },
      onMessage: (data) => { try { const p = JSON.parse(data); if (p._ack) { markDelivered(p._ack); return; } appendChatBubble({ id: p.id, text: p.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' }); session.send(JSON.stringify({ _ack: p.id })); } catch {} },
      onError: () => {},
      onFileProgress: () => {},
      onFileReceived: () => {},
      onRemoteStream: (stream) => {
        if (mediaActive) { dom.remoteVideo.srcObject = stream; dom.remoteVideo.play().catch(() => {}); hide(dom.remoteNoVideo); return; }
        pendingRemoteStream = stream; pendingRemoteStreamPubkey = null;
        showIncomingCallPrompt(null);
      },
      onRemoteStreamEnded: () => { dom.remoteVideo.srcObject = null; show(dom.remoteNoVideo); if (mediaActive) { endMediaCall(); toast('Peer ended the call.'); } },
    });

    dom.manualPanelContent.innerHTML = `
      <div class="manual-step"><div class="manual-step__header"><span class="manual-step__num">1</span>Copy invite & send to peer</div>
        <div class="manual-step__body"><textarea id="mp-offer-out" readonly rows="4" placeholder="Generating…"></textarea>
          <div class="manual-btn-row"><button id="mp-copy-offer" class="btn btn--primary btn--small" disabled>Copy Token</button></div></div></div>
      <div class="manual-step"><div class="manual-step__header"><span class="manual-step__num">2</span>Paste answer token</div>
        <div class="manual-step__body"><textarea id="mp-answer-in" rows="4" placeholder="Paste answer token…"></textarea>
          <div class="manual-btn-row"><button id="mp-accept-answer" class="btn btn--primary btn--small">Accept Answer</button></div></div></div>`;

    (async () => {
      const offer = await session.createOffer();
      await new Promise(r => setTimeout(r, 1500));
      const candidates = session.getLocalCandidates();
      const token = await TokenCodec.encode('offer', offer, candidates);
      const ta = document.getElementById('mp-offer-out');
      ta.value = token;
      document.getElementById('mp-copy-offer').disabled = false;
      document.getElementById('mp-copy-offer').addEventListener('click', () => copyText(token, 'Invite token'));
    })();

    document.getElementById('mp-accept-answer')?.addEventListener('click', async () => {
      const raw = document.getElementById('mp-answer-in').value.trim();
      if (!raw) { toast('Paste answer token.'); return; }
      try {
        const data = await TokenCodec.decode(raw);
        if (data.type !== 'answer') throw new Error('Not an answer token');
        await session.acceptAnswer(data.sdp);
        if (data.candidates?.length) await session.addIceCandidates(data.candidates);
        toast('Answer accepted!');
      } catch (e) { toast(e.message); }
    });
  }

  function showJoinSession() {
    hide(dom.chatEmpty); hide(dom.chatActive);
    show(dom.manualPanel);
    dom.manualPanelTitle.textContent = 'Join Session';
    showChatPanel();

    session = PeerSession.create({
      iceServers: buildIceServers(),
      onLog: () => {}, onStateChange: handleStateChange,
      onIceCandidate: () => {}, onIceComplete: () => {},
      onChannelOpen: () => { enableChat(); hide(dom.manualPanel); show(dom.chatActive); toast('Connected!'); },
      onChannelClose: () => { disableChat(); },
      onMessage: (data) => { try { const p = JSON.parse(data); if (p._ack) { markDelivered(p._ack); return; } appendChatBubble({ id: p.id, text: p.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' }); session.send(JSON.stringify({ _ack: p.id })); } catch {} },
      onError: () => {}, onFileProgress: () => {}, onFileReceived: () => {},
      onRemoteStream: (stream) => {
        if (mediaActive) { dom.remoteVideo.srcObject = stream; dom.remoteVideo.play().catch(() => {}); hide(dom.remoteNoVideo); return; }
        pendingRemoteStream = stream; pendingRemoteStreamPubkey = null;
        showIncomingCallPrompt(null);
      },
      onRemoteStreamEnded: () => { dom.remoteVideo.srcObject = null; show(dom.remoteNoVideo); if (mediaActive) { endMediaCall(); toast('Peer ended the call.'); } },
    });

    dom.manualPanelContent.innerHTML = `
      <div class="manual-step"><div class="manual-step__header"><span class="manual-step__num">1</span>Paste invite token</div>
        <div class="manual-step__body"><textarea id="mp-offer-in" rows="4" placeholder="Paste invite token…"></textarea>
          <div class="manual-btn-row"><button id="mp-accept-offer" class="btn btn--primary btn--small">Generate Answer</button></div></div></div>
      <div class="manual-step"><div class="manual-step__header"><span class="manual-step__num">2</span>Copy answer & send back</div>
        <div class="manual-step__body"><textarea id="mp-answer-out" readonly rows="4" placeholder="Answer will appear…"></textarea>
          <div class="manual-btn-row"><button id="mp-copy-answer" class="btn btn--primary btn--small" disabled>Copy Token</button></div></div></div>`;

    document.getElementById('mp-accept-offer')?.addEventListener('click', async () => {
      const raw = document.getElementById('mp-offer-in').value.trim();
      if (!raw) { toast('Paste invite token.'); return; }
      try {
        const data = await TokenCodec.decode(raw);
        if (data.type !== 'offer') throw new Error('Not an offer token');
        const answer = await session.acceptOffer(data.sdp);
        if (data.candidates?.length) await session.addIceCandidates(data.candidates);
        await new Promise(r => setTimeout(r, 1500));
        const candidates = session.getLocalCandidates();
        const token = await TokenCodec.encode('answer', answer, candidates);
        document.getElementById('mp-answer-out').value = token;
        document.getElementById('mp-copy-answer').disabled = false;
        document.getElementById('mp-copy-answer').addEventListener('click', () => copyText(token, 'Answer token'));
      } catch (e) { toast(e.message); }
    });
  }

  // ═══ EVENT BINDINGS ═══

  // Sidebar
  dom.contactSearch?.addEventListener('input', (e) => renderContacts(e.target.value));
  dom.btnNewContact?.addEventListener('click', () => show(dom.addContactModal));
  dom.btnCloseAddContact?.addEventListener('click', () => hide(dom.addContactModal));
  dom.btnScanContactQr?.addEventListener('click', () => openQrScanner((t) => { dom.newContactPubkey.value = t.trim(); toast('Key scanned!'); }));
  dom.btnAddContactConfirm?.addEventListener('click', () => {
    const pk = dom.newContactPubkey?.value.trim();
    const nick = dom.newContactNickname?.value.trim();
    if (!pk || !/^[0-9a-f]{64}$/i.test(pk)) { toast('Invalid pubkey (64 hex chars).'); return; }
    if (pk === nostrIdentity?.publicKey) { toast('Cannot add yourself!'); return; }
    addContact(pk, nick || 'Peer ' + pk.slice(0, 8));
    dom.newContactPubkey.value = '';
    dom.newContactNickname.value = '';
    hide(dom.addContactModal);
    renderContacts();
    toast('Contact added!');
  });

  // Click contact name or pubkey in chat header to copy full pubkey
  dom.chatContactName?.addEventListener('click', () => {
    if (activeContactPubkey) copyText(activeContactPubkey, 'Public key');
  });
  document.getElementById('chat-contact-pubkey')?.addEventListener('click', () => {
    if (activeContactPubkey) copyText(activeContactPubkey, 'Public key');
  });

  // Chat menu toggle
  dom.btnChatMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.chatMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => { dom.chatMenu?.classList.add('hidden'); });

  // Rename contact
  document.getElementById('btn-rename-contact')?.addEventListener('click', () => {
    dom.chatMenu.classList.add('hidden');
    if (!activeContactPubkey) return;
    const current = getContactNickname(activeContactPubkey);
    const newName = prompt('Enter new nickname:', current);
    if (newName !== null && newName.trim()) {
      renameContact(activeContactPubkey, newName.trim());
      dom.chatContactName.textContent = newName.trim();
      renderContacts(dom.contactSearch?.value);
      toast('Contact renamed!');
    }
  });

  // Clear chat
  dom.btnClearChat?.addEventListener('click', () => {
    dom.chatMenu.classList.add('hidden');
    if (!activeContactPubkey) return;
    if (!confirm('Clear all messages with this contact?')) return;
    ChatStore.clearChat(activeContactPubkey);
    dom.chatMessages.innerHTML = '';
    renderContacts(dom.contactSearch?.value);
    toast('Chat cleared');
  });

  // Delete contact
  dom.btnDeleteContact?.addEventListener('click', () => {
    dom.chatMenu.classList.add('hidden');
    if (!activeContactPubkey) return;
    const name = getContactDisplayName(activeContactPubkey);
    if (!confirm(`Delete contact "${name}" and all messages?`)) return;
    ChatStore.clearChat(activeContactPubkey);
    removeContact(activeContactPubkey);
    activeContactPubkey = null;
    hide(dom.chatActive);
    show(dom.chatEmpty);
    showSidebar();
    renderContacts();
    toast('Contact deleted');
  });

  // Message request — Accept
  document.getElementById('btn-accept-request')?.addEventListener('click', () => {
    if (!currentRequest) return;
    const nick = document.getElementById('msg-request-nickname').value.trim() || 'Peer ' + currentRequest.senderPubKey.slice(0, 8);
    addContact(currentRequest.senderPubKey, nick);
    // Deliver this message and any others from the same sender still in queue
    const allFromSender = [currentRequest, ...pendingRequests.filter(r => r.senderPubKey === currentRequest.senderPubKey)];
    // Remove from queue
    const senderKey = currentRequest.senderPubKey;
    for (let i = pendingRequests.length - 1; i >= 0; i--) {
      if (pendingRequests[i].senderPubKey === senderKey) pendingRequests.splice(i, 1);
    }
    for (const req of allFromSender) {
      const msg = { id: req.id || 'nr-' + Date.now(), text: req.text, sender: 'peer', ts: req.ts || Date.now(), status: 'delivered', type: 'text' };
      ChatStore.addMessage(senderKey, msg);
      if (activeContactPubkey === senderKey) appendChatBubble(msg);
    }
    renderContacts(dom.contactSearch?.value);
    toast(`Contact "${nick}" added!`);
    hide(document.getElementById('msg-request-modal'));
    currentRequest = null;
    showNextMessageRequest(); // process next in queue
  });

  // Message request — Decline
  document.getElementById('btn-decline-request')?.addEventListener('click', () => {
    hide(document.getElementById('msg-request-modal'));
    currentRequest = null;
    showNextMessageRequest(); // process next in queue
  });
  // Manual signaling
  dom.btnCreateSession?.addEventListener('click', showCreateSession);
  dom.btnJoinSession?.addEventListener('click', showJoinSession);
  dom.btnManualBack?.addEventListener('click', () => { hide(dom.manualPanel); show(dom.chatEmpty); showSidebar(); });

  // Chat panel
  dom.btnChatBack?.addEventListener('click', () => { 
    showSidebar(); 
    if (history.state && history.state.panel === 'chat') history.back();
  });
  dom.chatForm?.addEventListener('submit', (e) => { e.preventDefault(); const t = dom.chatInput.value.trim(); if (!t) return; sendChatMessage(t); dom.chatInput.value = ''; dom.chatInput.focus(); });
  dom.fileInput?.addEventListener('change', async (e) => {
    if (!session) return;
    const file = e.target.files[0]; if (!file) return;
    e.target.value = '';
    try { dom.fileInput.disabled = true; await session.sendFile(file);
      const msg = { id: 'fs-' + Date.now(), text: `Sent file: ${file.name}`, sender: 'self', ts: Date.now(), status: 'delivered', type: 'file', fileName: file.name };
      if (activeContactPubkey) { ChatStore.addMessage(activeContactPubkey, msg); appendChatBubble(msg); }
    } catch (err) { toast('File send failed.'); } finally { dom.fileInput.disabled = false; }
  });

  // Chat menu
  dom.btnChatMenu?.addEventListener('click', (e) => { e.stopPropagation(); dom.chatMenu.classList.toggle('hidden'); });
  document.addEventListener('click', () => hide(dom.chatMenu));
  dom.btnClearChat?.addEventListener('click', () => {
    if (!activeContactPubkey) return;
    ChatStore.clearChat(activeContactPubkey);
    renderChatMessages(activeContactPubkey);
    renderContacts(dom.contactSearch.value);
    toast('Chat cleared.');
  });
  dom.btnDeleteContact?.addEventListener('click', () => {
    if (!activeContactPubkey) return;
    removeContact(activeContactPubkey);
    ChatStore.clearChat(activeContactPubkey);
    activeContactPubkey = null;
    hide(dom.chatActive); show(dom.chatEmpty);
    renderContacts();
    showSidebar();
    toast('Contact deleted.');
  });

  // Connect P2P button
  dom.btnConnectPeer?.addEventListener('click', async () => {
    if (!activeContactPubkey || !nostrIdentity) { toast('No contact selected.'); return; }
    if (session && sessionRemotePubKey === activeContactPubkey && typeof session.isChannelOpen === 'function' && session.isChannelOpen()) { 
        toast('Already connected.'); return; 
    }
    
    // Auto-close any existing session with someone else to prevent orphaning resources
    if (session && sessionRemotePubKey !== activeContactPubkey) {
       if (typeof session.close === 'function') session.close();
       session = null;
    }
    
    show(dom.connectBanner);
    dom.connectBannerText.textContent = 'Connecting via Nostr…';
    const dots = dom.connectProgress.children;
    dots[0]?.classList.add('done');
    dots[1]?.classList.add('active');
    try {
      nostrActiveSessionId = await NostrSignaling.startSession(activeContactPubkey);
      dots[1]?.classList.replace('active', 'done');
      dots[2]?.classList.add('active');
      dom.connectBannerText.textContent = 'Waiting for peer…';
    } catch (err) {
      dots[1]?.classList.replace('active', 'error');
      dom.connectBannerText.textContent = 'Failed: ' + err.message;
      toast('Connection failed.');
    }
  });

  // Calls
  dom.btnAudioCall?.addEventListener('click', () => startCall(false));
  dom.btnVideoCall?.addEventListener('click', () => startCall(true));
  dom.btnEndCall?.addEventListener('click', () => { endMediaCall(); toast('Call ended.'); });
  dom.btnToggleAudio?.addEventListener('click', () => { if (session) updateCallButtons(session.toggleAudio(), null); });
  
  dom.btnToggleVideo?.addEventListener('click', async () => {
    if (!session) return;
    const ls = session.getLocalStream();
    if (!ls) return;
    
    const hasVideo = ls.getVideoTracks().length > 0;
    if (!hasVideo) {
      // Upgrade from audio-only to video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: getVideoConstraints() });
        const videoTrack = stream.getVideoTracks()[0];
        ls.addTrack(videoTrack);
        await session.replaceVideoTrack(videoTrack);
        dom.localVideo.srcObject = ls;
        updateCallButtons(null, true);
        toast('Upgraded to video call');
      } catch (e) {
        toast('Could not access camera for video upgrade');
      }
    } else {
      updateCallButtons(null, session.toggleVideo());
    }
  });
  dom.btnScreenShare?.addEventListener('click', async () => {
    if (!session) return;
    if (session.isScreenSharing()) {
      session.stopScreenShare();
      const ls = session.getLocalStream(); if (ls) dom.localVideo.srcObject = ls;
      dom.btnScreenShare.classList.remove('call-btn--sharing');
    } else {
      try {
        const ss = await session.startScreenShare();
        dom.localVideo.srcObject = ss;
        dom.btnScreenShare.classList.add('call-btn--sharing');
        ss.getVideoTracks()[0].onended = () => {
          const ls = session.getLocalStream(); if (ls) dom.localVideo.srcObject = ls;
          dom.btnScreenShare.classList.remove('call-btn--sharing');
        };
      } catch { toast('Screen share failed.'); }
    }
  });

  // Incoming call accept/reject
  dom.btnAcceptCall?.addEventListener('click', () => acceptIncomingCall());
  dom.btnRejectCall?.addEventListener('click', () => rejectIncomingCall());

  // Settings
  dom.btnSettings?.addEventListener('click', () => {
    show(dom.settingsModal);
    renderRelayList();
    renderIceServerList();
    updateStorageInfo();
    if (nostrIdentity && window.QRCode) {
      QRCode.toCanvas(dom.qrPubkey, nostrIdentity.publicKey, { width: 180, margin: 2, color: { dark: '#000', light: '#fff' } }, () => {});
    }
  });
  dom.btnCloseSettings?.addEventListener('click', () => hide(dom.settingsModal));

  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => { c.classList.add('hidden'); c.classList.remove('active'); });
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
    });
  });

  // Copy pubkey
  dom.myPubkeyShort?.parentElement?.addEventListener('click', () => { if (nostrIdentity) copyText(nostrIdentity.publicKey, 'Public key'); });
  dom.btnCopyPubkey?.addEventListener('click', () => { if (nostrIdentity) copyText(nostrIdentity.publicKey, 'Public key'); });

  // Relay management
  function renderRelayList() {
    if (!dom.relayList) return;
    const states = NostrTransport.getRelayStates();
    dom.relayList.innerHTML = '';
    for (const { url, state } of states) {
      const li = document.createElement('li');
      li.className = 'relay-item';
      const dot = state === 'connected' ? 'relay-item__dot--connected' : state === 'connecting' ? 'relay-item__dot--connecting' : '';
      li.innerHTML = `<span class="relay-item__dot ${dot}"></span><span class="relay-item__url">${url}</span><button class="relay-item__remove" title="Remove">×</button>`;
      li.querySelector('.relay-item__remove').addEventListener('click', () => { NostrTransport.removeRelay(url); renderRelayList(); });
      dom.relayList.appendChild(li);
    }
    const connected = states.filter(s => s.state === 'connected').length;
    dom.relayStatusMini.textContent = `${connected}/${states.length}`;
  }

  dom.btnAddRelay?.addEventListener('click', () => {
    const url = dom.relayUrlInput?.value.trim();
    if (!url) return;
    if (NostrTransport.addRelay(url)) { dom.relayUrlInput.value = ''; renderRelayList(); toast('Relay added.'); }
    else toast('Invalid or duplicate URL.');
  });
  dom.btnResetRelays?.addEventListener('click', () => {
    NostrTransport.resetRelays();
    NostrTransport.disconnect();
    NostrTransport.connect().then(() => renderRelayList());
    toast('Relays reset.');
  });

  // ICE Servers (add custom + reset)
  dom.btnSaveTurn?.addEventListener('click', () => {
    const url = dom.turnUrl.value.trim();
    if (!url) { toast('Enter a server URL.'); return; }
    const entry = { urls: url };
    const user = dom.turnUser.value.trim();
    const cred = dom.turnCred.value.trim();
    if (user) entry.username = user;
    if (cred) entry.credential = cred;
    const customs = loadCustomIceServers();
    if (customs.find(s => s.urls === url)) { toast('Server already added.'); return; }
    customs.push(entry);
    saveCustomIceServers(customs);
    dom.turnUrl.value = ''; dom.turnUser.value = ''; dom.turnCred.value = '';
    renderIceServerList();
    toast('Server added!');
  });
  document.getElementById('btn-reset-ice')?.addEventListener('click', () => {
    saveCustomIceServers([]);
    renderIceServerList();
    toast('Custom servers cleared. Built-in servers active.');
  });

  // Security - Key mgmt
  dom.btnExportKey?.addEventListener('click', async () => {
    try { const pw = await promptPassword('Export Key', 'Set a password to encrypt your private key.', true); await exportKey(pw); }
    catch {}
  });
  dom.importKeyFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return; e.target.value = '';
    const text = await file.text();
    try { const pw = await promptPassword('Import Key', 'Enter the password used during export.', false); await importKey(text, pw); }
    catch (err) { if (err.message !== 'Cancelled') toast('Import failed: ' + err.message); }
  });
  dom.btnTogglePrivkey?.addEventListener('click', () => {
    if (!nostrIdentity) return;
    const inp = dom.settingsPrivkey;
    if (inp.type === 'password') { inp.type = 'text'; inp.value = nostrIdentity.privateKey; dom.btnTogglePrivkey.textContent = 'Hide'; }
    else { inp.type = 'password'; inp.value = '••••••••••••••••'; dom.btnTogglePrivkey.textContent = 'Show'; }
  });
  dom.btnCopyPrivkey?.addEventListener('click', () => { if (nostrIdentity) copyText(nostrIdentity.privateKey, 'Private key'); });
  dom.btnRegenerateKey?.addEventListener('click', async () => {
    if (!confirm('Are you sure? This creates a new identity. Your contacts won\'t recognize you.')) return;
    await NostrCrypto.regenerateIdentity();
    toast('New identity created. Reloading…');
    setTimeout(() => location.reload(), 500);
  });

  // Backup
  function updateStorageInfo() {
    const { used, chatBytes } = ChatStore.getStorageUsage();
    dom.storageInfo.textContent = `Chat storage: ${(chatBytes / 1024).toFixed(1)} KB | Total localStorage: ${(used / 1024).toFixed(1)} KB`;
  }
  dom.btnBackupChats?.addEventListener('click', () => {
    const contacts = loadContacts();
    const chatData = ChatStore.exportAllChats();
    const backup = { ...chatData, contacts };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `p2p-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported!');
  });
  dom.importBackupFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return; e.target.value = '';
    try {
      const backup = JSON.parse(await file.text());
      if (backup.contacts) { for (const c of backup.contacts) addContact(c.pubkey, c.nickname); }
      ChatStore.importChats(backup, false);
      renderContacts();
      updateStorageInfo();
      toast(`Restored ${backup.contacts?.length || 0} contacts + chats!`);
    } catch (err) { toast('Invalid backup file.'); }
  });

  // Inspector
  dom.btnCloseInspect?.addEventListener('click', () => hide(dom.inspectModal));
  dom.btnCloseScanner?.addEventListener('click', closeQrScanner);
  dom.btnDecodeToken?.addEventListener('click', async () => {
    const raw = dom.inspectInput?.value.trim();
    if (!raw) return;
    try {
      const data = await TokenCodec.decode(raw);
      dom.inspectType.textContent = data.type?.toUpperCase() || 'Unknown';
      dom.inspectVersion.textContent = 'v2';
      dom.inspectTs.textContent = data.ts ? new Date(data.ts).toLocaleString() : 'N/A';
      dom.inspectIceCount.textContent = (data.candidates?.length || 0) + ' candidate(s)';
      dom.inspectSdp.textContent = data.sdp?.sdp || '(no SDP)';
      dom.inspectCandidates.textContent = data.candidates?.length ? data.candidates.map((c, i) => `#${i + 1}: ${c.candidate}`).join('\n') : '(none)';
      show(dom.inspectModal);
    } catch (err) { toast('Decode failed: ' + err.message); }
  });

  // ═══ NOSTR INITIALIZATION ═══
  async function initNostr() {
    try {
      await NostrCrypto.preload();
      nostrIdentity = await NostrCrypto.loadOrCreateIdentity();

      // Show pubkey in sidebar
      dom.myPubkeyShort.textContent = nostrIdentity.publicKey.slice(0, 8) + '…' + nostrIdentity.publicKey.slice(-6);
      dom.myPubkeyShort.title = nostrIdentity.publicKey;
      dom.settingsPubkey.textContent = nostrIdentity.publicKey;

      // Init transport
      NostrTransport.init(nostrIdentity.privateKey, nostrIdentity.publicKey, {
        onLog: () => {},
        onRelayStatus: () => renderRelayList(),
      });

      await NostrTransport.connect();
      renderRelayList();

      // Subscribe to incoming Nostr chat messages (offline delivery)
      NostrTransport.subscribeMessages((incoming) => {
        const { id, text, ts, senderPubKey } = incoming;
        if (!text) return;
        // Deduplicate — check if we already have this message
        const existing = ChatStore.getMessages(senderPubKey);
        if (existing.find(m => m.id === id)) return;
        // Check if sender is already a known contact
        if (loadContacts().find(c => c.pubkey === senderPubKey)) {
          // Known contact — deliver immediately
          const msg = { id: id || 'nr-' + Date.now(), text, sender: 'peer', ts: ts || Date.now(), status: 'delivered', type: 'text' };
          ChatStore.addMessage(senderPubKey, msg);
          if (activeContactPubkey === senderPubKey) {
            appendChatBubble(msg);
            if (document.hidden) SoundEngine.playMessage();
          } else {
            SoundEngine.playMessage();
          }
          renderContacts(dom.contactSearch?.value);
          toast(`Message from ${getContactDisplayName(senderPubKey)}`);
        } else {
          // Unknown contact — queue as message request
          SoundEngine.playMessage();
          pendingRequests.push({ id, text, ts, senderPubKey });
          showNextMessageRequest();
        }
      });

      // Init signaling
      NostrSignaling.init({
        onLog: () => {},
        buildIceServers,
        getSessionConfig: buildNostrSessionConfig,
        onSessionCreated: (sessionId, peerSession, remotePubKey, sessionRole) => {
          session = peerSession;
          nostrActiveSessionId = sessionId;
          sessionRemotePubKey = remotePubKey;
          // Auto-add contact if not exists
          if (!loadContacts().find(c => c.pubkey === remotePubKey)) {
            addContact(remotePubKey, 'Peer ' + remotePubKey.slice(0, 8));
            renderContacts();
          }
          if (sessionRole === 'joiner') {
            const name = getContactDisplayName(remotePubKey);
            toast(`Incoming connection from ${name}`);
            openChat(remotePubKey);
            show(dom.connectBanner);
            dom.connectBannerText.textContent = `Connecting with ${name}…`;
          }
        },
        onConnected: (sessionId) => {
          if (sessionId !== nostrActiveSessionId) return;
          hide(dom.connectBanner);
          handleStateChange('connected');
          enableChat();
          toast('Connected! ⚡');
          // Update connect progress dots
          const dots = dom.connectProgress?.children;
          if (dots) { for (const d of dots) { d.classList.remove('active'); d.classList.add('done'); } }
        },
        onDisconnected: (sessionId) => {
          if (sessionId !== nostrActiveSessionId) return;
          handleStateChange('disconnected');
          disableChat();
        },
        onError: (sessionId, errMsg) => {
          if (sessionId !== nostrActiveSessionId) return;
          toast('Error: ' + errMsg);
        },
        onIncomingRequest: (senderPubKey) => {
          const name = getContactDisplayName(senderPubKey);
          toast(`Incoming from ${name}`);
        },
      });

      setBadge('idle', 'Online');
    } catch (err) {
      console.error('[Nostr] Init error:', err);
      setBadge('failed', 'Offline');
    }
  }

  // ═══ INIT ═══
  setBadge('connecting', 'Connecting…');
  renderContacts();
  initNostr();

})();
