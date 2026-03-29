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
  let turnConfig = null;
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

  // ── Mobile Navigation ──
  function showChatPanel() {
    if (isMobile) {
      dom.sidebar.classList.add('sidebar--hidden');
      dom.chatPanel.classList.add('chat-panel--active');
    }
  }
  function showSidebar() {
    if (isMobile) {
      dom.sidebar.classList.remove('sidebar--hidden');
      dom.chatPanel.classList.remove('chat-panel--active');
    }
  }
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
      div.innerHTML = `
        <div class="avatar avatar--small" style="background:${color}"><span>${escapeHtml(letter)}</span></div>
        <div class="contact-item__info">
          <div class="contact-item__top">
            <span class="contact-item__name">${escapeHtml(c.nickname || c.pubkey.slice(0, 12) + '…')}</span>
            <span class="contact-item__time">${time}</span>
          </div>
          <div class="contact-item__preview">${escapeHtml(preview)}</div>
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

    const isConnected = session && nostrActiveSessionId && session.isChannelOpen?.();
    const isConnecting = session && nostrActiveSessionId && sessionRemotePubKey === pubkey && session.getState?.() !== 'closed' && session.getState?.() !== 'failed';
    
    if (isConnected) {
        dom.chatContactStatus.textContent = 'Connected';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
        show(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
    } else if (isConnecting) {
        dom.chatContactStatus.textContent = 'Connecting via Nostr...';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
        hide(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
    } else {
        dom.chatContactStatus.textContent = 'Connecting via Nostr...';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
        hide(dom.btnVideoCall);
        hide(dom.btnConnectPeer);
        
        // Auto connect
        if (nostrIdentity) {
            clearTimeout(connectionTimeout);
            NostrSignaling.startSession(pubkey).then(sid => {
                nostrActiveSessionId = sid;
                sessionRemotePubKey = pubkey;
                connectionTimeout = setTimeout(() => {
                    if (nostrActiveSessionId === sid && (!session || !session.isChannelOpen?.())) {
                        dom.chatContactStatus.textContent = 'Offline (Auto-connect failed)';
                        dom.chatContactStatus.className = 'chat-header__status';
                        show(dom.btnConnectPeer); // allow manual retry
                    }
                }, 8000);
            }).catch(err => {
                dom.chatContactStatus.textContent = 'Offline';
                dom.chatContactStatus.className = 'chat-header__status';
                show(dom.btnConnectPeer);
            });
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
    const id = `m${++messageIdCounter}-${Date.now()}`;
    const payload = JSON.stringify({ id, text });
    
    let status = 'pending';
    if (session && session.isChannelOpen && session.isChannelOpen()) {
        const sent = session.send(payload);
        if (sent) status = 'sent';
    }

    const msg = { id, text, sender: 'self', ts: Date.now(), status, type: 'text' };
    ChatStore.addMessage(activeContactPubkey, msg);
    const el = appendChatBubble(msg);
    pendingMsgs.set(id, el);
    renderContacts(dom.contactSearch.value);
  }

  function markDelivered(id) {
    if (!activeContactPubkey) return;
    ChatStore.updateMessageStatus(activeContactPubkey, id, 'delivered');
    const el = pendingMsgs.get(id);
    if (el) {
      const ticks = el.querySelector('.chat-msg__ticks');
      if (ticks) { ticks.textContent = '✓✓'; ticks.classList.remove('chat-msg__ticks--pending'); }
      pendingMsgs.delete(id);
    }
  }

  // ── ICE servers ──
  function buildIceServers() {
    const s = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
    if (turnConfig) s.push({ urls: turnConfig.urls, username: turnConfig.username, credential: turnConfig.credential });
    return s;
  }

  // ── Connection state handler ──
  function handleStateChange(state) {
    switch (state) {
      case 'gathering': setBadge('gathering', 'Gathering ICE'); break;
      case 'connecting': setBadge('connecting', 'Connecting'); break;
      case 'connected':
        setBadge('connected', 'Connected');
        if (dom.chatContactStatus) {
          dom.chatContactStatus.textContent = 'Connected';
          dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
        }
        break;
      case 'failed': setBadge('failed', 'Failed'); break;
      case 'disconnected': setBadge('failed', 'Disconnected'); break;
      case 'closed': setBadge('closed', 'Closed'); break;
    }
  }

  function enableChat() {
    dom.chatInput.disabled = false;
    dom.btnSend.disabled = false;
    dom.fileInput.disabled = false;
    show(dom.btnVideoCall);
    hide(dom.btnConnectPeer);
    dom.chatInput.focus();
  }

  function disableChat() {
    // We strictly DO NOT disable chat inputs anymore to allow offline messaging
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
        enableChat();
        hide(dom.connectBanner);
        
        // Flush pending messages
        const offlineMsgs = ChatStore.getMessages(remotePubKey).filter(m => m.sender === 'self' && m.status === 'pending');
        for (const m of offlineMsgs) {
            if (m.type === 'text') {
                if (session.send(JSON.stringify({ id: m.id, text: m.text }))) {
                    ChatStore.updateMessageStatus(remotePubKey, m.id, 'sent');
                }
            }
        }
      },
      onChannelClose: () => {
        disableChat();
        endMediaCall();
      },
      onMessage: (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed._ack) { markDelivered(parsed._ack); return; }
          const msg = { id: parsed.id || 'p-' + Date.now(), text: parsed.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' };
          ChatStore.addMessage(remotePubKey, msg);
          if (activeContactPubkey === remotePubKey) appendChatBubble(msg);
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

  function getVideoConstraints() {
    const res = dom.resolutionSelect?.value;
    const camId = dom.cameraSelect?.value;
    const c = { ...(RES_MAP[res] || {}) };
    if (camId) c.deviceId = { exact: camId };
    return c;
  }

  async function startCall() {
    if (!session) { toast('Connect first.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: getVideoConstraints() });
      session.addLocalStream(stream);
      dom.localVideo.srcObject = stream;
      mediaActive = true;
      show(dom.callOverlay);
      dom.btnToggleAudio.disabled = false;
      dom.btnToggleVideo.disabled = false;
      dom.btnScreenShare.disabled = false;
      dom.btnEndCall.disabled = false;
      updateCallButtons(true, true);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        mediaActive = true;
        show(dom.callOverlay);
        dom.btnToggleAudio.disabled = false;
        dom.btnEndCall.disabled = false;
        updateCallButtons(true, false);
        toast('Audio-only call (camera unavailable)');
      } catch (e) { toast('Cannot access media devices.'); }
    }
  }

  function endMediaCall() {
    if (session) session.removeMedia();
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

  // ── Incoming call prompt ──
  function showIncomingCallPrompt(remotePubKey) {
    const name = getContactDisplayName(remotePubKey);
    const letter = (getContactNickname(remotePubKey) || remotePubKey)[0].toUpperCase();
    dom.incomingCallLetter.textContent = letter;
    dom.incomingCallAvatar.style.background = getAvatarColor(remotePubKey);
    dom.incomingCallName.textContent = name;
    show(dom.incomingCall);
  }

  function acceptIncomingCall() {
    hide(dom.incomingCall);
    if (!pendingRemoteStream) return;

    // Play the remote stream
    dom.remoteVideo.srcObject = pendingRemoteStream;
    dom.remoteVideo.play().catch(() => {});
    hide(dom.remoteNoVideo);

    // Show call overlay and enable controls
    show(dom.callOverlay);
    mediaActive = true;
    dom.btnToggleAudio.disabled = false;
    dom.btnToggleVideo.disabled = false;
    dom.btnScreenShare.disabled = false;
    dom.btnEndCall.disabled = false;

    // Auto-start local media (camera+mic) so the peer can see/hear us
    navigator.mediaDevices.getUserMedia({ audio: true, video: getVideoConstraints() })
      .then(stream => {
        if (session) session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        updateCallButtons(true, true);
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
    hide(dom.incomingCall);
    // Stop the remote stream tracks that WebRTC is providing
    pendingRemoteStream = null;
    pendingRemoteStreamPubkey = null;
    // End media on our side to signal the peer
    if (session) session.removeMedia();
    toast('Call rejected.');
  }

  // ── QR Scanner ──
  let scannerStream = null, scannerAnimFrame = null, scannerVideo = null;
  function openQrScanner(onSuccess) {
    show(dom.qrModal);
    const readerEl = document.getElementById('qr-reader');
    readerEl.innerHTML = '';
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
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
      .then(stream => { scannerStream = stream; scannerVideo.srcObject = stream; scannerVideo.play(); scannerAnimFrame = requestAnimationFrame(scanFrame); })
      .catch(() => { toast('Camera access failed.'); closeQrScanner(); });
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

  // Manual signaling
  dom.btnCreateSession?.addEventListener('click', showCreateSession);
  dom.btnJoinSession?.addEventListener('click', showJoinSession);
  dom.btnManualBack?.addEventListener('click', () => { hide(dom.manualPanel); show(dom.chatEmpty); showSidebar(); });

  // Chat panel
  dom.btnChatBack?.addEventListener('click', () => { showSidebar(); });
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
    if (session && nostrActiveSessionId) { toast('Already connected.'); return; }
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

  // Video call
  dom.btnVideoCall?.addEventListener('click', () => startCall());
  dom.btnEndCall?.addEventListener('click', () => { endMediaCall(); toast('Call ended.'); });
  dom.btnToggleAudio?.addEventListener('click', () => { if (session) updateCallButtons(session.toggleAudio(), null); });
  dom.btnToggleVideo?.addEventListener('click', () => { if (session) updateCallButtons(null, session.toggleVideo()); });
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

  // TURN
  dom.btnSaveTurn?.addEventListener('click', () => {
    const url = dom.turnUrl.value.trim();
    if (!url) { toast('Enter TURN URL.'); return; }
    turnConfig = { urls: url, username: dom.turnUser.value.trim(), credential: dom.turnCred.value.trim() };
    toast('TURN saved.'); hide(dom.settingsModal);
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
