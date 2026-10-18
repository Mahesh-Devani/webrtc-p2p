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
import { DiagnosticLogger } from './diagnostic-logger.js';

console.log('[P2P Connect] v7 - Multi-File Flow Control & Unified Singletons Active');

(() => {
  DiagnosticLogger.installConsoleInterceptor();
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
    // Remote Desktops
    remoteDevicesSection: $('#remote-devices-section'),
    remoteDevicesList: $('#remote-devices-list'),
    btnAddRemoteDevice: $('#btn-add-remote-device'),
    addRemoteDeviceModal: $('#add-remote-device-modal'),
    btnCloseAddRemoteDevice: $('#btn-close-add-remote-device'),
    remoteDeviceToken: $('#remote-device-token'),
    remoteDeviceNickname: $('#remote-device-nickname'),
    remoteDeviceIcon: $('#remote-device-icon'),
    remoteDevicePin: $('#remote-device-pin'),
    btnScanRemoteQr: $('#btn-scan-remote-qr'),
    btnSaveRemoteDevice: $('#btn-save-remote-device'),
    clientIdDisplay: $('#client-id-display'),
    btnCopyClientId: $('#btn-copy-client-id'),
    editRemoteDeviceModal: $('#edit-remote-device-modal'),
    btnCloseEditRemoteDevice: $('#btn-close-edit-remote-device'),
    editRemoteDeviceOriginalPubkey: $('#edit-remote-device-original-pubkey'),
    editRemoteDeviceNickname: $('#edit-remote-device-nickname'),
    editRemoteDeviceIcon: $('#edit-remote-device-icon'),
    editRemoteDevicePubkey: $('#edit-remote-device-pubkey'),
    btnCopyEditPubkey: $('#btn-copy-edit-pubkey'),
    editRemoteDevicePin: $('#edit-remote-device-pin'),
    btnToggleEditPinVisibility: $('#btn-toggle-edit-pin-visibility'),
    btnCopyQuickConnectLink: $('#btn-copy-quick-connect-link'),
    btnTestRemoteDevice: $('#btn-test-remote-device'),
    editDeviceTestStatus: $('#edit-device-test-status'),
    btnDeleteFromEdit: $('#btn-delete-from-edit'),
    btnCancelEditRemoteDevice: $('#btn-cancel-edit-remote-device'),
    btnSaveEditRemoteDevice: $('#btn-save-edit-remote-device'),
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
    btnRemoteDesktop: $('#btn-remote-desktop'),
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
    btnAttachScreenshot: $('#btn-attach-screenshot'),
    screenshotInput: $('#screenshot-input'),
    btnChatSendDiag: $('#btn-chat-send-diag'),
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
    btnRdToggle: $('#btn-rd-toggle'),
    btnEndCall: $('#btn-end-call'),
    cameraSelect: $('#camera-select'),
    resolutionSelect: $('#resolution-select'),
    speakerSelect: $('#speaker-select'),
    // Remote Desktop toolbar & elements
    rdToolbar: $('#rd-toolbar'),
    rdModeView: $('#rd-mode-view'),
    rdModePointer: $('#rd-mode-pointer'),
    rdModeControl: $('#rd-mode-control'),
    rdBtnPointerLock: $('#rd-btn-pointer-lock'),
    rdBtnKeyboardLock: $('#rd-btn-keyboard-lock'),
    rdBtnSyncClipboard: $('#rd-btn-sync-clipboard'),
    rdClipboardMenu: $('#rd-clipboard-menu'),
    rdClipSend: $('#rd-clip-send'),
    rdClipFetch: $('#rd-clip-fetch'),
    rdClipAutoSync: $('#rd-clip-autosync'),
    rdBtnQuality: $('#rd-btn-quality'),
    rdQualityLabel: $('#rd-quality-label'),
    rdQualityMenu: $('#rd-quality-menu'),
    rdBtnDisplays: $('#rd-btn-displays'),
    rdDisplaysLabel: $('#rd-displays-label'),
    rdDisplaysMenu: $('#rd-displays-menu'),
    rdBtnSpecialKeys: $('#rd-btn-special-keys'),
    rdKeysMenu: $('#rd-keys-menu'),
    rdBtnFit: $('#rd-btn-fit'),
    rdFitLabel: $('#rd-fit-label'),
    rdReconnectBanner: $('#rd-reconnect-banner'),
    rdReconnectStatus: $('#rd-reconnect-status'),
    btnRdReconnectNow: $('#btn-rd-reconnect-now'),
    btnRdReconnectCancel: $('#btn-rd-reconnect-cancel'),
    btnExportFleet: $('#btn-export-fleet'),
    btnImportFleet: $('#btn-import-fleet'),
    fleetImportFile: $('#fleet-import-file'),
    btnOpenSleepGuide: $('#btn-open-sleep-guide'),
    hostSleepGuideModal: $('#host-sleep-guide-modal'),
    btnCloseSleepGuide: $('#btn-close-sleep-guide'),
    btnAckSleepGuide: $('#btn-ack-sleep-guide'),
    rdBtnFullscreen: $('#rd-btn-fullscreen'),
    rdBtnDisconnect: $('#rd-btn-disconnect'),
    rdBtnCollapse: $('#rd-btn-collapse'),
    rdBtnKeyboard: $('#rd-btn-keyboard'),
    rdZoomIndicator: $('#rd-zoom-indicator'),
    rdZoomLevel: $('#rd-zoom-level'),
    rdBtnResetZoom: $('#rd-btn-reset-zoom'),
    rdHostPrompt: $('#rd-host-prompt'),
    rdHostPromptText: $('#rd-host-prompt-text'),
    rdBtnGrantControl: $('#rd-btn-grant-control'),
    rdBtnDenyControl: $('#rd-btn-deny-control'),
    rdHostActiveBar: $('#rd-host-active-bar'),
    rdBtnRevokeControl: $('#rd-btn-revoke-control'),
    rdLaserPointer: $('#rd-laser-pointer'),
    rdLaserPointerLabel: $('#rd-laser-pointer-label'),
    bridgeStatusPill: $('#bridge-status-pill'),
    btnToggleBridge: $('#btn-toggle-bridge'),
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
    btnTestIce: $('#btn-test-ice'),
    iceTestResults: $('#ice-test-results'),
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
    // Diagnostics Modal
    diagnosticsModal: $('#diagnostics-modal'),
    btnCloseDiagnostics: $('#btn-close-diagnostics'),
    btnHeaderDiagnostics: $('#btn-header-diagnostics'),
    btnMenuDiagnostics: $('#btn-menu-diagnostics'),
    btnRdDiagnostics: $('#rd-btn-diagnostics'),
    btnOpenDiagnosticsFull: $('#btn-open-diagnostics-full'),
    diagRelayStatus: $('#diag-relay-status'),
    diagRelayDetail: $('#diag-relay-detail'),
    diagWebrtcStatus: $('#diag-webrtc-status'),
    diagWebrtcDetail: $('#diag-webrtc-detail'),
    diagCandidatePair: $('#diag-candidate-pair'),
    diagCandidateDetail: $('#diag-candidate-detail'),
    btnDownloadLogpkg: $('#btn-download-logpkg'),
    btnCopyDiagSummary: $('#btn-copy-diag-summary'),
    btnSendAiAgent: $('#btn-send-ai-agent'),
    btnTestNetworkStun: $('#btn-test-network-stun'),
    diagLogFilter: $('#diag-log-filter'),
    btnClearDiagLogs: $('#btn-clear-diag-logs'),
    diagLogTerminal: $('#diag-log-terminal'),
  };

  // ── State ──
  let session = null;
  let nostrIdentity = null;
  let nostrActiveSessionId = null;
  let sessionRemotePubKey = null;
  let activeContactPubkey = null;
  let activeRemoteDesktopDevice = null;
  let isWaitingForRemoteDesktop = false;
  let messageIdCounter = 0;
  let mediaActive = false;
  let isMobile = window.innerWidth <= 768;
  let pendingRemoteStream = null; // Holds incoming stream until user accepts
  let pendingRemoteStreamPubkey = null; // Who the incoming call is from
  const pendingMsgs = new Map();
  const lastIceErrors = []; // Diagnostic tracking for candidate errors (TURN/STUN)
  let connectingPromise = null;
  let connectingPromisePubKey = null;
  let pendingAutoConnectPubKey = null;

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
  function formatFileSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  function getAvatarColor(pubkey) {
    const colors = ['#00a884','#53bdeb','#8b5cf6','#fb923c','#f87171','#fbbf24','#34d399','#6366f1'];
    let hash = 0;
    for (let i = 0; i < 8; i++) hash = (hash << 4) + parseInt(pubkey[i], 16);
    return colors[Math.abs(hash) % colors.length];
  }

  // ── Official AI Support Agent ──
  const SUPPORT_AGENT_PUBKEY = '968a5ce393c3b9b5cb28e41a015e70d27ba6bce0f44128b02638ebe817815b21';
  const SUPPORT_AGENT_NAME = '🤖 AI Support Agent';

  // ── Contact CRUD ──
  function loadContacts() { try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || []; } catch { return []; } }
  function saveContacts(c) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); }
  function ensureSupportAgentContact() {
    const contacts = loadContacts();
    if (!contacts.find(c => c.pubkey === SUPPORT_AGENT_PUBKEY)) {
      contacts.unshift({ pubkey: SUPPORT_AGENT_PUBKEY, nickname: SUPPORT_AGENT_NAME, isSupportBot: true });
      saveContacts(contacts);
    }
  }
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

  // ── Remote Devices (Unattended Hosts) CRUD ──
  const REMOTE_DEVICES_KEY = 'p2p-remote-devices';

  function loadRemoteDevices() {
    try { return JSON.parse(localStorage.getItem(REMOTE_DEVICES_KEY)) || []; }
    catch { return []; }
  }

  function saveRemoteDevices(devices) {
    localStorage.setItem(REMOTE_DEVICES_KEY, JSON.stringify(devices));
    renderRemoteDevices();
  }

  function addOrUpdateRemoteDevice(pubkey, name, pin = '', icon = '🖥️') {
    const devices = loadRemoteDevices();
    const existing = devices.find(d => d.pubkey === pubkey);
    if (existing) {
      existing.name = name || existing.name;
      existing.icon = icon || existing.icon || '🖥️';
      if (pin !== undefined && pin !== '') existing.pin = pin;
    } else {
      devices.push({ pubkey, name: name || `Host-${pubkey.slice(0, 6)}`, pin: pin || '', icon: icon || '🖥️' });
    }
    saveRemoteDevices(devices);
  }

  function removeRemoteDevice(pubkey) {
    const devices = loadRemoteDevices().filter(d => d.pubkey !== pubkey);
    saveRemoteDevices(devices);
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Never connected';
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 60) return 'Just now';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function formatDuration(sec) {
    if (!sec || sec <= 0) return '';
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (mins < 60) return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMin = mins % 60;
    return remMin > 0 ? `${hrs}h ${remMin}m` : `${hrs}h`;
  }

  function formatConnectionTime(lastConnected, lastDuration) {
    if (!lastConnected) return 'Never connected';
    const rel = formatRelativeTime(lastConnected);
    const dur = formatDuration(lastDuration);
    return dur ? `Connected ${rel} (Duration: ${dur})` : `Connected ${rel}`;
  }

  function renderRemoteDevices() {
    if (!dom.remoteDevicesList) return;
    const devices = loadRemoteDevices();
    if (devices.length === 0) {
      dom.remoteDevicesList.innerHTML = `<div class="remote-device-empty">No remote computers paired yet.<br>Click "Add Remote Computer" to pair.</div>`;
      return;
    }

    dom.remoteDevicesList.innerHTML = devices.map(d => `
      <div class="remote-device-item" data-pubkey="${escapeHtml(d.pubkey)}">
        <div class="remote-device-info">
          <div class="remote-device-name">
            <span>${escapeHtml(d.icon || '🖥️')}</span>
            <span>${escapeHtml(d.name)}</span>
          </div>
          <div class="remote-device-meta">
            ${escapeHtml(d.pubkey.slice(0, 8))}…${escapeHtml(d.pubkey.slice(-6))} ${d.pin ? '🔒' : ''}
          </div>
          <div class="remote-device-time">
            🕒 ${escapeHtml(formatConnectionTime(d.lastConnected, d.lastDuration))}
          </div>
        </div>
        <div class="remote-device-actions">
          <button class="remote-device-btn-connect" data-pubkey="${escapeHtml(d.pubkey)}" title="Connect to Remote Desktop">
            ⚡ Connect
          </button>
          <button class="remote-device-btn-edit" data-pubkey="${escapeHtml(d.pubkey)}" title="Edit Computer Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="remote-device-btn-del" data-pubkey="${escapeHtml(d.pubkey)}" title="Remove Computer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    dom.remoteDevicesList.querySelectorAll('.remote-device-btn-connect').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pubkey = btn.dataset.pubkey;
        const dev = loadRemoteDevices().find(d => d.pubkey === pubkey);
        if (dev) connectToRemoteDevice(dev);
      });
    });

    dom.remoteDevicesList.querySelectorAll('.remote-device-btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pubkey = btn.dataset.pubkey;
        const dev = loadRemoteDevices().find(d => d.pubkey === pubkey);
        if (dev) openEditRemoteDeviceModal(dev);
      });
    });

    dom.remoteDevicesList.querySelectorAll('.remote-device-btn-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pubkey = btn.dataset.pubkey;
        const dev = loadRemoteDevices().find(d => d.pubkey === pubkey);
        const name = dev ? dev.name : 'this computer';
        if (confirm(`Remove "${name}" from your remote computers?`)) {
          removeRemoteDevice(pubkey);
          toast(`Removed "${name}".`);
        }
      });
    });
  }

  let rdSessionStartTime = null;

  function recordRdSessionEnd() {
    if (activeRemoteDesktopDevice && rdSessionStartTime) {
      const durationSec = Math.max(1, Math.round((Date.now() - rdSessionStartTime) / 1000));
      const devices = loadRemoteDevices();
      const dev = devices.find(d => d.pubkey === activeRemoteDesktopDevice.pubkey);
      if (dev) {
        dev.lastConnected = Date.now();
        dev.lastDuration = durationSec;
        saveRemoteDevices(devices);
      }
    }
    rdSessionStartTime = null;
  }

  async function exportFleet() {
    const devices = loadRemoteDevices();
    if (devices.length === 0) {
      toast('No remote computers saved to export.');
      return;
    }
    const encrypt = confirm('Would you like to encrypt this fleet backup with a password?\n\nOK = Encrypted with password\nCancel = Plain JSON backup');
    const backupData = {
      app: 'P2P Connect',
      version: 2,
      type: 'fleet_backup',
      exportedAt: new Date().toISOString(),
      devices
    };

    let fileContent = '';
    const fileName = `p2p-fleet-backup-${new Date().toISOString().slice(0, 10)}.json`;

    if (encrypt) {
      const pwd = prompt('Enter a secure password to encrypt this fleet backup:');
      if (!pwd) {
        toast('Export cancelled.');
        return;
      }
      try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(pwd), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt']
        );
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          enc.encode(JSON.stringify(backupData))
        );
        const payload = {
          encrypted: true,
          salt: Array.from(salt),
          iv: Array.from(iv),
          data: Array.from(new Uint8Array(encrypted))
        };
        fileContent = JSON.stringify(payload, null, 2);
      } catch (err) {
        toast('Encryption failed: ' + err.message);
        return;
      }
    } else {
      fileContent = JSON.stringify(backupData, null, 2);
    }

    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${devices.length} remote computer(s) successfully!`);
  }

  async function importFleet(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let parsed = JSON.parse(text);

      if (parsed.encrypted) {
        const pwd = prompt('This backup is encrypted. Enter password to decrypt:');
        if (!pwd) {
          toast('Import cancelled.');
          return;
        }
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(pwd), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: new Uint8Array(parsed.salt), iterations: 100000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(parsed.iv) },
          key,
          new Uint8Array(parsed.data)
        );
        parsed = JSON.parse(new TextDecoder().decode(decrypted));
      }

      const incomingDevices = Array.isArray(parsed.devices) ? parsed.devices : (Array.isArray(parsed) ? parsed : []);
      if (incomingDevices.length === 0) {
        toast('No valid devices found in backup file.');
        return;
      }

      const existingDevices = loadRemoteDevices();
      let importedCount = 0;
      for (const dev of incomingDevices) {
        if (!dev.pubkey) continue;
        const idx = existingDevices.findIndex(d => d.pubkey === dev.pubkey);
        if (idx >= 0) {
          existingDevices[idx] = { ...existingDevices[idx], ...dev };
        } else {
          existingDevices.push(dev);
        }
        importedCount++;
      }

      saveRemoteDevices(existingDevices);
      toast(`Imported ${importedCount} remote computers!`);
    } catch (err) {
      toast('Failed to import backup: ' + (err.message || 'Invalid format'));
    }
  }

  function openEditRemoteDeviceModal(dev) {
    if (!dev) return;
    if (dom.editRemoteDeviceOriginalPubkey) dom.editRemoteDeviceOriginalPubkey.value = dev.pubkey;
    if (dom.editRemoteDeviceNickname) dom.editRemoteDeviceNickname.value = dev.name || '';
    if (dom.editRemoteDeviceIcon) dom.editRemoteDeviceIcon.value = dev.icon || '🖥️';
    if (dom.editRemoteDevicePubkey) dom.editRemoteDevicePubkey.textContent = dev.pubkey;
    if (dom.editRemoteDevicePin) {
      dom.editRemoteDevicePin.value = dev.pin || '';
      dom.editRemoteDevicePin.type = 'password';
    }
    const eyeIcon = document.getElementById('icon-edit-pin-eye');
    if (eyeIcon) {
      eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
    if (dom.editDeviceTestStatus) {
      dom.editDeviceTestStatus.innerHTML = `Click "Test Reachability" to check if the host daemon is online on Nostr relays.`;
    }
    show(dom.editRemoteDeviceModal);
  }

  async function testRemoteDeviceReachability(pubkey) {
    if (!pubkey || !dom.editDeviceTestStatus) return;

    dom.editDeviceTestStatus.innerHTML = `<span style="color:var(--c-primary);">📡 Connecting to relays and pinging host...</span>`;
    
    if (!NostrTransport.isConnected()) {
      try {
        await NostrTransport.connect();
      } catch (err) {
        dom.editDeviceTestStatus.innerHTML = `<span style="color:var(--c-danger);">❌ Could not connect to Nostr relays: ${escapeHtml(err.message || '')}</span>`;
        return;
      }
    }

    const testSessionId = 'test-' + Date.now();
    let responded = false;
    let timer = null;

    const cleanup = NostrTransport.subscribeSignals((signal) => {
      if (signal.senderPubKey === pubkey && (signal.type === 'host_pong' || signal.type === 'close')) {
        responded = true;
        if (timer) clearTimeout(timer);
        if (typeof cleanup === 'function') cleanup();

        if (signal.type === 'host_pong') {
          const info = signal.data || {};
          if (info.status === 'blocked') {
            dom.editDeviceTestStatus.innerHTML = `
              <div style="color:#f59e0b;font-weight:600;margin-bottom:2px;">⚠️ Host Online, but Connection Blocked</div>
              <div style="color:var(--c-text-dim);font-size:0.7rem;">${escapeHtml(info.reason || 'Client ID not in host whitelist')}</div>
            `;
          } else if (info.status === 'ready') {
            const streamState = info.streamActive
              ? `<span style="color:#10b981;font-weight:600;">🟢 Online &amp; Desktop Capture Active</span>`
              : `<span style="color:#f59e0b;font-weight:600;">🟡 Online, but Desktop Capture Inactive</span>`;
            const bridgeState = info.bridgeLive
              ? `• Native Bridge: Active`
              : `• Native Bridge: Inactive`;
            const pinState = info.pinRequired ? `• Password: Required 🔒` : `• Password: None`;
            
            dom.editDeviceTestStatus.innerHTML = `
              <div style="margin-bottom:3px;">${streamState}</div>
              <div style="color:var(--c-text-dim);font-size:0.68rem;line-height:1.4;">
                Host: <strong>${escapeHtml(info.name || 'Remote Host')}</strong><br>
                ${bridgeState} ${pinState}
              </div>
            `;
          }
        } else if (signal.type === 'close') {
          dom.editDeviceTestStatus.innerHTML = `
            <div style="color:var(--c-danger);font-weight:600;">❌ Connection Blocked by Host</div>
            <div style="color:var(--c-text-dim);font-size:0.7rem;">${escapeHtml(signal.data || 'Unauthorized')}</div>
          `;
        }
      }
    });

    try {
      await NostrTransport.sendSignal(pubkey, {
        type: 'host_ping',
        session: testSessionId,
        data: { t: Date.now() }
      });
    } catch (err) {
      if (typeof cleanup === 'function') cleanup();
      dom.editDeviceTestStatus.innerHTML = `<span style="color:var(--c-danger);">❌ Failed to send ping: ${escapeHtml(err.message || '')}</span>`;
      return;
    }

    timer = setTimeout(() => {
      if (!responded) {
        if (typeof cleanup === 'function') cleanup();
        dom.editDeviceTestStatus.innerHTML = `
          <div style="color:var(--c-danger);font-weight:600;">🔴 No Response from Host</div>
          <div style="color:var(--c-text-dim);font-size:0.7rem;">Host is offline, asleep, or host.html is closed.</div>
        `;
      }
    }, 6000);
  }

  async function connectToRemoteDevice(device) {
    if (!device || !device.pubkey) return;

    if (!NostrTransport.isConnected()) {
      toast('Connecting to Nostr relays…');
      await NostrTransport.connect();
    }

    let pin = device.pin;
    if (pin === undefined || pin === null || pin === '') {
      const entered = prompt(`Enter Password / PIN for ${device.name} (leave empty if none configured):`, '');
      if (entered === null) return; // User cancelled
      pin = entered.trim();
    }

    // Close any previous session before starting remote desktop to prevent race conditions
    if (session && typeof session.close === 'function') {
      try { session.close(); } catch {}
      session = null;
    }

    activeRemoteDesktopDevice = device;
    isWaitingForRemoteDesktop = true;
    toast(`Connecting to ${device.name}…`);

    show(dom.connectBanner);
    dom.connectBannerText.textContent = `Connecting to ${device.name}…`;
    const dots = dom.connectProgress?.children;
    if (dots) {
      dots[0]?.classList.add('done');
      dots[1]?.classList.add('active');
    }

    try {
      nostrActiveSessionId = await NostrSignaling.startSession(device.pubkey, {
        pin,
        isUnattended: true,
      });
      sessionRemotePubKey = device.pubkey;
      if (dots) {
        dots[1]?.classList.replace('active', 'done');
        dots[2]?.classList.add('active');
      }
      dom.connectBannerText.textContent = `Awaiting host desktop stream…`;
    } catch (err) {
      console.error('[connectToRemoteDevice] Failed to start session:', err);
      if (dots) dots[1]?.classList.replace('active', 'error');
      dom.connectBannerText.textContent = 'Connection failed: ' + (err.message || '');
      setTimeout(() => hide(dom.connectBanner), 3500);
      activeRemoteDesktopDevice = null;
      isWaitingForRemoteDesktop = false;
      return;
    }

    // Auto-timeout if host is offline / doesn't answer
    setTimeout(() => {
      if (activeRemoteDesktopDevice && (!session || !session.isChannelOpen || !session.isChannelOpen())) {
        hide(dom.connectBanner);
        toast(`No response from ${device.name}. Ensure the host daemon is running.`);
        activeRemoteDesktopDevice = null;
        isWaitingForRemoteDesktop = false;
      }
    }, 20000);
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
    if (!dom.contactList) return;
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
      const isBot = c.isSupportBot || c.pubkey === SUPPORT_AGENT_PUBKEY;
      const letter = isBot ? '🤖' : (c.nickname || c.pubkey)[0].toUpperCase();
      const color = isBot ? 'linear-gradient(135deg, #00a884 0%, #0d6efd 100%)' : getAvatarColor(c.pubkey);
      const time = c.lastTs ? formatTime(c.lastTs) : '';
      const preview = c.lastText
        ? (c.lastSender === 'self' ? 'You: ' : '') + c.lastText.slice(0, 40)
        : (isBot ? 'Ask diagnostic questions or send logs' : 'No messages yet');
      const pubShort = c.pubkey.slice(0, 6) + '…' + c.pubkey.slice(-4);
      const botBadge = isBot ? '<span class="contact-bot-badge">AI SUPPORT</span>' : '';
      div.innerHTML = `
        <div class="avatar avatar--small" style="background:${color}"><span>${escapeHtml(letter)}</span></div>
        <div class="contact-item__info">
          <div class="contact-item__top">
            <span class="contact-item__name">${escapeHtml(c.nickname || c.pubkey.slice(0, 12) + '…')}${botBadge}</span>
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

    const isSupportBot = pubkey === SUPPORT_AGENT_PUBKEY;
    const isConnected = session && nostrActiveSessionId && sessionRemotePubKey === pubkey && session.isChannelOpen?.();
    const isConnecting = (connectingPromisePubKey === pubkey) || (session && nostrActiveSessionId && sessionRemotePubKey === pubkey && session.getState?.() !== 'closed' && session.getState?.() !== 'failed');
    
    if (isSupportBot) {
        dom.chatContactStatus.textContent = isConnected ? 'Connected (Direct P2P Ready)' : '🤖 AI Diagnostic Agent • Always Ready';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
        hide(dom.btnAudioCall);
        hide(dom.btnVideoCall);
        hide(dom.btnRemoteDesktop);
        if (dom.btnChatSendDiag) show(dom.btnChatSendDiag);
        if (dom.btnAttachScreenshot) show(dom.btnAttachScreenshot);
        if (isConnected) {
            hide(dom.btnConnectPeer);
        } else {
            show(dom.btnConnectPeer);
            dom.btnConnectPeer.title = 'Connect Direct P2P Channel (for Screenshots)';
        }
    } else {
        if (dom.btnChatSendDiag) hide(dom.btnChatSendDiag);
        if (dom.btnAttachScreenshot) hide(dom.btnAttachScreenshot);
        dom.btnConnectPeer.title = 'Reconnect';

        if (isConnected) {
            dom.chatContactStatus.textContent = 'Connected';
            dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
            show(dom.btnAudioCall);
            show(dom.btnVideoCall);
            show(dom.btnRemoteDesktop);
            hide(dom.btnConnectPeer);
        } else if (isConnecting) {
            dom.chatContactStatus.textContent = 'Connecting via Nostr…';
            dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
            hide(dom.btnAudioCall);
            hide(dom.btnVideoCall);
            hide(dom.btnRemoteDesktop);
            hide(dom.btnConnectPeer);
        } else {
            dom.chatContactStatus.textContent = 'Connecting via Nostr…';
            dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
            hide(dom.btnAudioCall);
            hide(dom.btnVideoCall);
            hide(dom.btnRemoteDesktop);
            hide(dom.btnConnectPeer);
            
            // Auto connect
            if (nostrIdentity) {
                // If we already have an active session with someone else, do not auto-connect and orphan them!
                if (session && session.getState?.() !== 'closed' && session.getState?.() !== 'failed' && sessionRemotePubKey !== pubkey) {
                   dom.chatContactStatus.textContent = 'Offline (Busy)';
                   dom.chatContactStatus.className = 'chat-header__status';
                   show(dom.btnConnectPeer);
                } else {
                   ensurePeerConnected(pubkey).catch(() => {});
                }
            } else {
                pendingAutoConnectPubKey = pubkey;
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

  function formatDiagnosticBubbleHtml(rawText, ts, ticks) {
    let status = 'INFO';
    const statusMatch = rawText.match(/Status:\s*([A-Z]+)/i);
    if (statusMatch) {
      status = statusMatch[1].toUpperCase();
    }
    const badgeClass = `diag-card__status-badge diag-card__status-badge--${status}`;

    // Extract Clarification Question if present
    let clarification = '';
    const clarMatch = rawText.match(/(?:❓\s*Clarification Question:|❓\s*Clarification Needed:)\s*([\s\S]*?)(?:\(Advisory Mode|$)/i);
    if (clarMatch) {
      clarification = clarMatch[1].trim();
    }

    // Extract Findings
    let findings = [];
    const findMatch = rawText.match(/Findings:\s*([\s\S]*?)(?=Recommendations:|❓\s*Clarification|\(Advisory Mode|$)/i);
    if (findMatch) {
      findings = findMatch[1].trim().split('\n')
        .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
        .filter(Boolean);
    }

    // Extract Recommendations
    let recs = [];
    const recMatch = rawText.match(/Recommendations:\s*([\s\S]*?)(?=❓\s*Clarification|\(Advisory Mode|$)/i);
    if (recMatch) {
      recs = recMatch[1].trim().split('\n')
        .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
        .filter(Boolean);
    }

    // If no explicit Findings/Recommendations sections, extract main advice paragraphs
    let adviceHtml = '';
    if (findings.length === 0 && recs.length === 0) {
      const lines = rawText.split('\n')
        .filter(l => !l.startsWith('🤖') && !l.startsWith('Status:') && !l.startsWith('❓') && !l.includes('Advisory Mode'))
        .join('\n').trim();
      if (lines) {
        adviceHtml = `<div class="diag-card__section" style="white-space: pre-wrap;">${escapeHtml(lines)}</div>`;
      }
    }

    const findingsHtml = findings.length > 0 ? `
      <div class="diag-card__section">
        <div class="diag-card__label" style="color:var(--c-danger);">Findings / Root Causes:</div>
        <ul class="diag-card__list">${findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      </div>` : '';

    const recsHtml = recs.length > 0 ? `
      <div class="diag-card__section">
        <div class="diag-card__label" style="color:var(--c-primary);">Recommendations:</div>
        <ul class="diag-card__list">${recs.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      </div>` : '';

    const clarHtml = clarification ? `
      <div class="diag-card__clarification">
        <div class="diag-card__clarification-title">
          <span>❓</span><span>Clarification Needed:</span>
        </div>
        <div>${escapeHtml(clarification)}</div>
      </div>` : '';

    return `
      <div class="diag-card__header">
        <div class="diag-card__title-box"><span>🤖</span><span>AI Support Agent</span></div>
        <span class="${badgeClass}">${status}</span>
      </div>
      ${adviceHtml}
      ${findingsHtml}
      ${recsHtml}
      ${clarHtml}
      <div class="diag-card__footer">
        <span>🔒 Advisory Mode: Recommendations for Developer Review</span>
        <div class="chat-msg__meta"><span>${formatTime(ts)}</span>${ticks}</div>
      </div>`;
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

    const ticks = msg.sender === 'self'
      ? `<span class="chat-msg__ticks ${msg.status === 'delivered' ? '' : 'chat-msg__ticks--pending'}">${msg.status === 'delivered' ? '✓✓' : '✓'}</span>`
      : '';

    // Check if message is a sent diagnostic package
    if (msg.text && msg.text.startsWith('📋 Diagnostic Log Package transmitted')) {
      div.className = `chat-msg chat-msg--${msg.sender} chat-msg--diag-card`;
      div.innerHTML = `
        <div class="diag-card__header">
          <div class="diag-card__title-box"><span>📋</span><span>Diagnostic Log Package</span></div>
          <span class="diag-card__status-badge diag-card__status-badge--INFO">TELEMETRY SENT</span>
        </div>
        <div class="diag-card__section">
          ${escapeHtml(msg.text)}
        </div>
        <div class="diag-card__footer">
          <span>🔒 Pruned &amp; Encrypted via NIP-44 (&lt; 2 KB)</span>
          <div class="chat-msg__meta"><span>${formatTime(msg.ts)}</span>${ticks}</div>
        </div>`;
      dom.chatMessages.appendChild(div);
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      return div;
    }

    // Check if message is an AI Support Agent report or clarification
    if (msg.text && (msg.text.startsWith('🤖 [AI Diagnostic Analysis]') || msg.text.startsWith('🤖 [AI Support Agent'))) {
      div.className = `chat-msg chat-msg--${msg.sender} chat-msg--diag-card`;
      div.innerHTML = formatDiagnosticBubbleHtml(msg.text, msg.ts, ticks);
      dom.chatMessages.appendChild(div);
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      return div;
    }

    let content = escapeHtml(msg.text);
    if (msg.type === 'file' && msg.fileName) {
      const isScreenshot = msg.fileName.toLowerCase().includes('screenshot') || (msg.text && msg.text.includes('📷 Screenshot'));
      const sizeStr = msg.fileSize ? ` <span style="opacity:0.75;font-size:0.85em;">(${formatFileSize(msg.fileSize)})</span>` : '';
      if (isScreenshot) {
        content = `📷 <strong>Screenshot</strong>${sizeStr}<div style="font-size:0.72rem; color:var(--c-primary); margin-top:3px;">⚡ Direct P2P Transfer (Zero Nostr Quota)</div>`;
      } else {
        content = `📎 ${escapeHtml(msg.fileName)}${sizeStr}`;
      }
    }

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
        status = 'pending'; // will update to 'sent' on relay acceptance

        // Peer is being messaged — auto-initiate P2P connection in background (slight 500ms delay so sendMessage finishes publishing first)
        if (!session || !session.isChannelOpen?.()) {
          setTimeout(() => {
            if (!session || !session.isChannelOpen?.()) {
              ensurePeerConnected(targetPubKey).catch(() => {});
            }
          }, 500);
        }
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
        hideRdReconnectBanner();
        break;
      case 'failed':
        setBadge('failed', 'Failed');
        const recentTurnErrors = lastIceErrors.filter(e => Date.now() - e.ts < 30000 && (e.code === 400 || e.code === 401 || e.code === 403));
        if (recentTurnErrors.length > 0) {
          toast('P2P failed: TURN relay reported allocate/auth error. Check Settings → ICE Servers.');
        }
        if (dom.callOverlay?.classList.contains('call-overlay--rd')) {
          showRdReconnectBanner();
        }
        break;
      case 'disconnected':
        setBadge('failed', 'Disconnected');
        if (dom.callOverlay?.classList.contains('call-overlay--rd')) {
          showRdReconnectBanner();
        }
        break;
      case 'closed':
        setBadge('closed', 'Closed');
        hideRdReconnectBanner();
        break;
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
    show(dom.btnRemoteDesktop);
    hide(dom.btnConnectPeer);
    dom.chatInput.focus();
  }

  function disableChat() {
    // We strictly DO NOT disable chat inputs anymore to allow offline messaging
    hide(dom.btnAudioCall);
    hide(dom.btnVideoCall);
    hide(dom.btnRemoteDesktop);
    show(dom.btnConnectPeer);
  }

  // ── File Transfer Handling ──
  let fileProgressHideTimer = null;

  function handleFileProgress(pct, dir, fileInfo) {
    if (fileProgressHideTimer) {
      clearTimeout(fileProgressHideTimer);
      fileProgressHideTimer = null;
    }
    show(dom.fileProgress);
    let prefix = dir === 'sending' ? 'Sending' : 'Receiving';
    if (fileInfo?.fileIndex && fileInfo?.totalFiles && fileInfo.totalFiles > 1) {
      prefix += ` (${fileInfo.fileIndex}/${fileInfo.totalFiles})`;
    }
    const name = fileInfo?.fileName ? ` ${fileInfo.fileName}` : ' file';
    dom.fileProgressLabel.textContent = `${prefix}${name}: ${pct}%`;
    dom.fileProgressBar.value = pct;
    if (pct >= 100) {
      // If there are more files remaining in the batch, stay visible
      if (fileInfo?.fileIndex && fileInfo?.totalFiles && fileInfo.fileIndex < fileInfo.totalFiles) {
        // Keep progress indicator up for the next file
      } else {
        fileProgressHideTimer = setTimeout(() => {
          hide(dom.fileProgress);
          fileProgressHideTimer = null;
        }, 1200);
      }
    }
  }

  function handleFileAbort(fileName) {
    toast(`Transfer of ${fileName} was cancelled or failed.`);
    if (fileProgressHideTimer) {
      clearTimeout(fileProgressHideTimer);
      fileProgressHideTimer = null;
    }
    fileProgressHideTimer = setTimeout(() => {
      hide(dom.fileProgress);
      fileProgressHideTimer = null;
    }, 1200);
  }

  function handleFileReceived(blob, filename, fileMeta, targetPubKey = null) {
    const url = URL.createObjectURL(blob);
    const msg = {
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: `Received file: ${filename}`,
      sender: 'peer',
      ts: Date.now(),
      status: 'delivered',
      type: 'file',
      fileName: filename,
      fileSize: blob.size
    };
    if (targetPubKey) {
      ChatStore.addMessage(targetPubKey, msg);
    }
    if (!targetPubKey || activeContactPubkey === targetPubKey) {
      const div = appendChatBubble(msg);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.textContent = `Download (${formatFileSize(blob.size)})`;
      a.className = 'btn btn--small btn--primary';
      a.style.marginTop = '4px';
      a.style.display = 'inline-block';
      div.querySelector('.chat-msg__text')?.appendChild(a);
    }
    if (targetPubKey) {
      renderContacts(dom.contactSearch.value);
    }
    SoundEngine.playMessage();
  }

  // ── Auto-reconnect / Ensure Peer Connected ──
  async function ensurePeerConnected(remotePubKey, { timeoutMs = 25000 } = {}) {
    if (!remotePubKey) return false;

    // 1. If already open and active with this contact
    if (session && sessionRemotePubKey === remotePubKey && typeof session.isChannelOpen === 'function' && session.isChannelOpen()) {
      if (activeContactPubkey === remotePubKey) {
        dom.chatContactStatus.textContent = 'Connected';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
        show(dom.btnAudioCall);
        show(dom.btnVideoCall);
        show(dom.btnRemoteDesktop);
        hide(dom.btnConnectPeer);
      }
      return true;
    }

    // 2. If already in flight for this pubkey, reuse the in-flight promise
    if (connectingPromise && connectingPromisePubKey === remotePubKey) {
      return connectingPromise;
    }

    // 3. If session exists and is recovering (e.g. transient disconnect during app switch)
    if (session && sessionRemotePubKey === remotePubKey && typeof session.waitForOpen === 'function') {
      const quicklyRecovered = await session.waitForOpen(2000);
      if (quicklyRecovered) {
        if (activeContactPubkey === remotePubKey) {
          dom.chatContactStatus.textContent = 'Connected';
          dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
          show(dom.btnAudioCall);
          show(dom.btnVideoCall);
          show(dom.btnRemoteDesktop);
          hide(dom.btnConnectPeer);
        }
        return true;
      }
    }

    // 4. Need to establish session via Nostr
    if (!nostrIdentity) return false;

    // Close any previous session that is not actively connected to avoid conflicting state
    if (session && (!session.isChannelOpen || !session.isChannelOpen())) {
      try { session.close(); } catch { }
      session = null;
    }

    connectingPromisePubKey = remotePubKey;
    connectingPromise = (async () => {
      show(dom.connectBanner);
      dom.connectBannerText.textContent = `Connecting with ${getContactDisplayName(remotePubKey)}…`;
      const dots = dom.connectProgress?.children;
      if (dots) {
        dots[0]?.classList.add('done');
        dots[1]?.classList.add('active');
      }

      if (activeContactPubkey === remotePubKey) {
        dom.chatContactStatus.textContent = 'Connecting via Nostr…';
        dom.chatContactStatus.className = 'chat-header__status chat-header__status--connecting';
        hide(dom.btnAudioCall);
        hide(dom.btnVideoCall);
        hide(dom.btnRemoteDesktop);
        hide(dom.btnConnectPeer);
      }

      try {
        nostrActiveSessionId = await NostrSignaling.startSession(remotePubKey);
        sessionRemotePubKey = remotePubKey;
        if (dots) {
          dots[1]?.classList.replace('active', 'done');
          dots[2]?.classList.add('active');
        }
        dom.connectBannerText.textContent = 'Waiting for peer response…';
      } catch (err) {
        console.error('[ensurePeerConnected] Failed to start session:', err);
        if (dots) dots[1]?.classList.replace('active', 'error');
        dom.connectBannerText.textContent = 'Connection failed';
        setTimeout(() => hide(dom.connectBanner), 3000);
        if (activeContactPubkey === remotePubKey) {
          dom.chatContactStatus.textContent = 'Offline';
          dom.chatContactStatus.className = 'chat-header__status';
          show(dom.btnConnectPeer);
        }
        return false;
      }

      // Wait for the session channel to open
      const startTime = Date.now();
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (session && sessionRemotePubKey === remotePubKey && typeof session.isChannelOpen === 'function' && session.isChannelOpen()) {
            cleanup();
            hide(dom.connectBanner);
            if (activeContactPubkey === remotePubKey) {
              dom.chatContactStatus.textContent = 'Connected';
              dom.chatContactStatus.className = 'chat-header__status chat-header__status--online';
              show(dom.btnAudioCall);
              show(dom.btnVideoCall);
              show(dom.btnRemoteDesktop);
              hide(dom.btnConnectPeer);
            }
            resolve(true);
          } else if (Date.now() - startTime > timeoutMs) {
            cleanup();
            hide(dom.connectBanner);
            if (session && nostrActiveSessionId && sessionRemotePubKey === remotePubKey && (!session.isChannelOpen || !session.isChannelOpen())) {
              try { session.close(); } catch {}
              session = null;
              nostrActiveSessionId = null;
            }
            if (activeContactPubkey === remotePubKey) {
              dom.chatContactStatus.textContent = 'Offline';
              dom.chatContactStatus.className = 'chat-header__status';
              show(dom.btnConnectPeer);
            }
            resolve(false);
          }
        }, 200);

        function cleanup() {
          clearInterval(interval);
        }
      });
    })().finally(() => {
      connectingPromise = null;
      connectingPromisePubKey = null;
    });

    return connectingPromise;
  }

  async function sendSelectedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    // Check if channel is open; if not, attempt auto-reconnect if we have an active contact
    if (!session || !session.isChannelOpen || !session.isChannelOpen()) {
      if (activeContactPubkey && nostrIdentity) {
        toast(`Connecting to peer to send ${files.length} file${files.length > 1 ? 's' : ''}…`);
        const connected = await ensurePeerConnected(activeContactPubkey, { timeoutMs: 25000 });
        if (!connected || !session || !session.isChannelOpen || !session.isChannelOpen()) {
          toast('Could not connect to peer. Peer may be offline.');
          return;
        }
      } else {
        toast('Peer not connected via P2P. Connect first to send files.');
        return;
      }
    }

    dom.fileInput.disabled = true;
    const total = files.length;
    let successCount = 0;

    try {
      for (let i = 0; i < total; i++) {
        const file = files[i];
        try {
          await session.sendFile(file, { fileIndex: i + 1, totalFiles: total });
          successCount++;
          const msg = {
            id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: `Sent file: ${file.name}`,
            sender: 'self',
            ts: Date.now(),
            status: 'delivered',
            type: 'file',
            fileName: file.name,
            fileSize: file.size
          };
          if (activeContactPubkey) {
            ChatStore.addMessage(activeContactPubkey, msg);
            appendChatBubble(msg);
          } else {
            appendChatBubble(msg);
          }
        } catch (err) {
          console.error('File send error:', err);
          toast(`Failed to send ${file.name}: ${err.message || 'Send failed'}`);
          if (!session || !session.isChannelOpen || !session.isChannelOpen()) {
            toast('P2P connection lost during file transfer.');
            break;
          }
        }
      }

      if (activeContactPubkey) {
        renderContacts(dom.contactSearch.value);
      }

      if (total > 1 && successCount > 0) {
        toast(`Sent ${successCount} of ${total} files.`);
      }
    } finally {
      dom.fileInput.disabled = false;
    }
  }

  // ── Screenshot Attachment & Quota Protection ──
  async function processScreenshotFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Please select an image file for screenshot.');
      return;
    }

    toast('Processing screenshot image…');

    // 1. Optimize & scale image on offscreen canvas to keep size under 200 KB
    let optimizedBlob = null;
    try {
      optimizedBlob = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82);
        };
        img.onerror = reject;
        img.src = url;
      });
    } catch (err) {
      console.warn('[Screenshot] Optimization error, using original:', err);
      optimizedBlob = file;
    }

    if (!optimizedBlob) optimizedBlob = file;
    const fileName = `screenshot-${Date.now()}.jpg`;

    // 2. Strict Quota Enforcement
    // Senders MUST NOT send screenshot binaries over Nostr relays!
    const isP2pOpen = session && session.isChannelOpen?.();
    if (isP2pOpen) {
      toast('Streaming screenshot over direct WebRTC DataChannel… ⚡');
      try {
        await session.sendFile(optimizedBlob, fileName);
        const msg = {
          id: 'ss-' + Date.now(),
          text: `📷 Screenshot sent via P2P direct channel (${(optimizedBlob.size / 1024).toFixed(1)} KB)`,
          sender: 'self',
          ts: Date.now(),
          status: 'sent',
          type: 'file',
          fileName,
          fileSize: optimizedBlob.size,
        };
        if (activeContactPubkey) {
          ChatStore.addMessage(activeContactPubkey, msg);
        }
        appendChatBubble(msg);
        toast('Screenshot sent via direct P2P! ⚡');
      } catch (err) {
        toast(`Failed to send screenshot: ${err.message}`);
      }
      return;
    }

    // 3. P2P not yet connected: attempt auto-connection or prompt user
    toast('🔒 Direct P2P channel required for screenshots. Connecting now…');
    if (activeContactPubkey) {
      ensurePeerConnected(activeContactPubkey)
        .then(async () => {
          if (session && session.isChannelOpen?.()) {
            toast('P2P connected! Sending screenshot… ⚡');
            await session.sendFile(optimizedBlob, fileName);
            const msg = {
              id: 'ss-' + Date.now(),
              text: `📷 Screenshot sent via P2P direct channel (${(optimizedBlob.size / 1024).toFixed(1)} KB)`,
              sender: 'self',
              ts: Date.now(),
              status: 'sent',
              type: 'file',
              fileName,
              fileSize: optimizedBlob.size,
            };
            ChatStore.addMessage(activeContactPubkey, msg);
            appendChatBubble(msg);
            toast('Screenshot sent via direct P2P! ⚡');
          }
        })
        .catch(() => {
          toast('Direct P2P channel unavailable. Please click Download Log Package (.json) and email your screenshot to support.');
        });
    }
  }

  function handleChatPaste(e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processScreenshotFile(file);
          break;
        }
      }
    }
  }

  // ── Build Nostr session config (callbacks for PeerSession) ──
  function buildNostrSessionConfig(sessionId, remotePubKey, sessionRole) {
    return {
      onLog: (msg, level) => {
        if (level === 'error') console.error(`[WebRTC] ${msg}`);
        else if (level === 'warn') console.warn(`[WebRTC] ${msg}`);
        else console.log(`[WebRTC] ${msg}`);
      },
      onStateChange: handleStateChange,
      onIceCandidate: () => {},
      onIceCandidateError: (err) => {
        lastIceErrors.push({ url: err.url, code: err.errorCode, text: err.errorText, ts: Date.now() });
        console.warn(`[ICE] Candidate error (${err.url || 'local'}): code ${err.errorCode} ${err.errorText || ''}`);
      },
      onIceComplete: () => {},
      onChannelOpen: () => {
        if (remotePubKey === activeContactPubkey) {
          enableChat();
          hide(dom.connectBanner);
        }
        const isRdMatch = (activeRemoteDesktopDevice && (activeRemoteDesktopDevice.pubkey.toLowerCase() === remotePubKey.toLowerCase())) || (isWaitingForRemoteDesktop && sessionRemotePubKey === remotePubKey);
        if (isRdMatch) {
          hide(dom.connectBanner);
          show(dom.callOverlay);
          dom.callOverlay?.classList.add('call-overlay--rd');
          show(dom.rdToolbar);
          dom.btnRdToggle.disabled = false;
          attachRemoteVideoInputListeners();
          setRdMode('control');
          rdControlGranted = true;
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
        if (sessionId !== nostrActiveSessionId) return;
        if (remotePubKey === activeContactPubkey) {
          disableChat();
        }
        if (mediaActive || activeRemoteDesktopDevice) {
          endMediaCall();
        }
      },
      onCallEnded: () => {
        if (sessionId !== nostrActiveSessionId) return;
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
      onFileProgress: handleFileProgress,
      onFileReceived: (blob, filename, meta) => handleFileReceived(blob, filename, meta, remotePubKey),
      onFileAbort: handleFileAbort,
      onInputEvent: handleIncomingInputEvent,
      onRemoteStream: (stream) => {
        // If we already have the call overlay open or active unattended remote desktop or waiting for remote desktop
        const isRdStream = (activeRemoteDesktopDevice && (activeRemoteDesktopDevice.pubkey.toLowerCase() === remotePubKey.toLowerCase())) || isWaitingForRemoteDesktop;
        if (mediaActive || isRdStream) {
          mediaActive = true;
          isWaitingForRemoteDesktop = false;
          dom.remoteVideo.srcObject = stream;
          const playPromise = dom.remoteVideo.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              console.warn('[RD Video] Autoplay with audio was prevented, retrying muted:', err);
              dom.remoteVideo.muted = true;
              dom.remoteVideo.play().catch(e => console.warn('[RD Video] Muted play also failed:', e));
            });
          }
          hide(dom.remoteNoVideo);
          if (!dom.remoteVideo._rdVideoReadyBound) {
            dom.remoteVideo._rdVideoReadyBound = true;
            dom.remoteVideo.addEventListener('loadeddata', () => hide(dom.remoteNoVideo));
            dom.remoteVideo.addEventListener('loadedmetadata', () => hide(dom.remoteNoVideo));
            dom.remoteVideo.addEventListener('playing', () => hide(dom.remoteNoVideo));
          }
          show(dom.callOverlay);
          dom.callOverlay?.classList.add('call-overlay--rd');
          show(dom.rdToolbar);
          dom.btnRdToggle.disabled = false;
          attachRemoteVideoInputListeners();
          setRdMode('control');
          rdControlGranted = true;
          hide(dom.connectBanner);
          const peerName = activeRemoteDesktopDevice ? activeRemoteDesktopDevice.name : getContactDisplayName(remotePubKey);
          toast(`Connected to ${peerName}! Remote Desktop streaming.`);
          return;
        }
        // Otherwise, show incoming call prompt — don't auto-play
        pendingRemoteStream = stream;
        pendingRemoteStreamPubkey = remotePubKey;
        showIncomingCallPrompt(remotePubKey);
      },
      onRemoteStreamEnded: () => {
        if (sessionId !== nostrActiveSessionId) return;
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

  // ── Remote Desktop Subsystem ──
  let rdMode = 'view'; // 'view' | 'pointer' | 'control'
  let rdFitMode = 'contain'; // 'contain' | 'fill' | 'cover'
  let rdKeyboardLocked = false;
  let rdControlGranted = false;
  let rdRemoteLaserTimer = null;
  let localBridgeWs = null;
  let bridgeConnected = false;

  function cycleFitMode() {
    if (rdFitMode === 'contain') {
      rdFitMode = 'native';
      if (dom.remoteVideo) {
        dom.remoteVideo.classList.remove('rd-fit-fill', 'rd-fit-cover');
        dom.remoteVideo.classList.add('rd-fit-native');
      }
      if (dom.rdFitLabel) dom.rdFitLabel.textContent = '1:1';
      toast('Display: 1:1 Native Resolution (Click & drag to pan)');
    } else if (rdFitMode === 'native') {
      rdFitMode = 'fill';
      if (dom.remoteVideo) {
        dom.remoteVideo.classList.remove('rd-fit-native', 'rd-fit-cover');
        dom.remoteVideo.classList.add('rd-fit-fill');
      }
      if (dom.rdFitLabel) dom.rdFitLabel.textContent = 'Stretch';
      toast('Display: Stretch to Fill Window');
    } else if (rdFitMode === 'fill') {
      rdFitMode = 'cover';
      if (dom.remoteVideo) {
        dom.remoteVideo.classList.remove('rd-fit-fill', 'rd-fit-native');
        dom.remoteVideo.classList.add('rd-fit-cover');
      }
      if (dom.rdFitLabel) dom.rdFitLabel.textContent = 'Zoom';
      toast('Display: Zoom / Fill Window');
    } else {
      rdFitMode = 'contain';
      if (dom.remoteVideo) {
        dom.remoteVideo.classList.remove('rd-fit-fill', 'rd-fit-cover', 'rd-fit-native');
      }
      if (dom.rdFitLabel) dom.rdFitLabel.textContent = 'Fit';
      toast('Display: Fit to Window (Best Quality)');
    }
  }

  let rdQualityPreset = 'balanced';

  function setRdQualityPreset(preset) {
    rdQualityPreset = preset;
    dom.rdQualityMenu?.querySelectorAll('.rd-key-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quality === preset);
    });
    if (dom.rdQualityLabel) {
      dom.rdQualityLabel.textContent = preset === 'crisp' ? '15M ▾' : (preset === 'low' ? '2M ▾' : '8M ▾');
    }
    sendRdInput({ t: 'set_quality', preset });
    const desc = preset === 'crisp' ? 'Crisp Text (15 Mbps / 30 FPS)' : (preset === 'low' ? 'Data Saver (2 Mbps / 30 FPS)' : 'Balanced (8 Mbps / 60 FPS)');
    toast(`Stream Quality: ${desc}`);
  }

  // ── Mobile Pinch-to-Zoom Subsystem ──
  let rdZoomScale = 1.0;
  let rdPanX = 0;
  let rdPanY = 0;

  function applyRdZoomTransform(animate = false) {
    if (!dom.remoteVideo) return;
    if (animate) {
      dom.remoteVideo.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1)';
      setTimeout(() => {
        if (dom.remoteVideo) dom.remoteVideo.style.transition = '';
      }, 200);
    } else {
      dom.remoteVideo.style.transition = '';
    }

    if (rdZoomScale > 1.02) {
      dom.remoteVideo.style.transform = `translate(${rdPanX}px, ${rdPanY}px) scale(${rdZoomScale})`;
      if (dom.rdZoomIndicator) {
        show(dom.rdZoomIndicator);
        if (dom.rdZoomLevel) dom.rdZoomLevel.textContent = `${rdZoomScale.toFixed(1)}x`;
      }
    } else {
      dom.remoteVideo.style.transform = '';
      if (dom.rdZoomIndicator) hide(dom.rdZoomIndicator);
    }
  }

  function resetRdZoom(animate = true) {
    rdZoomScale = 1.0;
    rdPanX = 0;
    rdPanY = 0;
    applyRdZoomTransform(animate);
  }

  function setRdMode(mode) {
    rdMode = mode;
    dom.rdModeView?.classList.toggle('active', mode === 'view');
    dom.rdModePointer?.classList.toggle('active', mode === 'pointer');
    dom.rdModeControl?.classList.toggle('active', mode === 'control');

    if (dom.remoteVideo?.parentElement) {
      dom.remoteVideo.parentElement.classList.toggle('rd-control-active', mode === 'control');
    }

    if (mode === 'view') {
      toast('Remote Desktop: View Only mode');
      if (document.pointerLockElement) document.exitPointerLock?.();
    } else if (mode === 'pointer') {
      toast('Remote Desktop: Laser Pointer active');
    } else if (mode === 'control') {
      toast('Remote Desktop: Control active! Clicks and keystrokes will be sent.');
    }
  }

  function getNormalizedVideoCoordinates(e, videoEl) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
    const rect = videoEl.getBoundingClientRect();
    const elWidth = rect.width;
    const elHeight = rect.height;
    if (elWidth <= 0 || elHeight <= 0) return null;

    const videoRatio = videoEl.videoWidth / videoEl.videoHeight;
    const elRatio = elWidth / elHeight;

    let actualWidth, actualHeight, offsetX, offsetY;
    if (elRatio > videoRatio) {
      actualHeight = elHeight;
      actualWidth = elHeight * videoRatio;
      offsetX = (elWidth - actualWidth) / 2;
      offsetY = 0;
    } else {
      actualWidth = elWidth;
      actualHeight = elWidth / videoRatio;
      offsetX = 0;
      offsetY = (elHeight - actualHeight) / 2;
    }

    const pt = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const clientX = pt.clientX !== undefined ? pt.clientX : e.clientX;
    const clientY = pt.clientY !== undefined ? pt.clientY : e.clientY;

    const clickX = clientX - rect.left - offsetX;
    const clickY = clientY - rect.top - offsetY;

    if (clickX < 0 || clickX > actualWidth || clickY < 0 || clickY > actualHeight) {
      return null;
    }

    return {
      x: Math.max(0, Math.min(1, clickX / actualWidth)),
      y: Math.max(0, Math.min(1, clickY / actualHeight)),
    };
  }

  function sendRdInput(evt) {
    if (session && typeof session.sendInput === 'function') {
      return session.sendInput(evt);
    }
    return false;
  }

  function handleIncomingInputEvent(evt) {
    if (!evt || !evt.t) return;

    if (evt.t === 'host_status') {
      if (evt.warning) {
        toast(evt.warning, 'warn');
        if (dom.remoteNoVideo) {
          dom.remoteNoVideo.innerHTML = `
            <div style="text-align:center;max-width:340px;line-height:1.5;padding:16px;">
              <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
              <div style="font-weight:600;font-size:0.95rem;margin-bottom:6px;color:#fff;">Host Screen Capture Inactive</div>
              <div style="font-size:0.8rem;color:#aeb7c4;">${escapeHtml(evt.warning)}</div>
            </div>
          `;
          show(dom.remoteNoVideo);
        }
      } else {
        if (dom.remoteNoVideo) {
          dom.remoteNoVideo.textContent = 'Waiting for peer video…';
        }
      }
      return;
    }

    if (evt.t === 'remote_desktop_request') {
      const peerName = sessionRemotePubKey ? getContactDisplayName(sessionRemotePubKey) : 'Peer';
      SoundEngine.playNotification();
      if (confirm(`${peerName} requested to view and control your desktop screen.\n\nDo you want to start screen sharing and allow remote control?`)) {
        startRemoteDesktopSession(true).then(() => {
          sendRdInput({ t: 'control_granted' });
        }).catch(err => {
          toast('Screen sharing cancelled: ' + (err.message || ''));
        });
      }
      return;
    }

    if (evt.t === 'control_request') {
      const peerName = sessionRemotePubKey ? getContactDisplayName(sessionRemotePubKey) : 'Peer';
      if (dom.rdHostPromptText) dom.rdHostPromptText.textContent = `${peerName} requested remote control of your desktop.`;
      show(dom.rdHostPrompt);
      SoundEngine.playNotification();
      return;
    }

    if (evt.t === 'control_granted') {
      rdControlGranted = true;
      toast('Remote control granted! You can now control the peer screen.');
      setRdMode('control');
      return;
    }

    if (evt.t === 'control_revoked') {
      rdControlGranted = false;
      toast('Peer revoked remote control.');
      setRdMode('view');
      return;
    }

    if (evt.t === 'clipboard') {
      if (evt.text && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(evt.text).then(() => {
          toast('Copied remote clipboard text to local clipboard!');
        }).catch(() => {
          toast('Clipboard received from host.');
        });
      }
      return;
    }

    if (evt.t === 'clipboard_ack') {
      toast('Remote host received clipboard text.');
      return;
    }

    if (evt.t === 'monitors') {
      const monitors = Array.isArray(evt.monitors) ? evt.monitors : [];
      if (dom.rdDisplaysMenu) {
        let html = '';
        if (monitors.length > 0) {
          html = monitors.map(m => `
            <button class="rd-key-item" data-display="${escapeHtml(String(m.id))}">🖥️ ${escapeHtml(m.name)}</button>
          `).join('');
        } else {
          html = `<button class="rd-key-item active" data-display="all">🖥️ Main Display</button>`;
        }
        html += `<div style="border-top:1px solid var(--c-border);margin:3px 0;"></div>
                 <button class="rd-key-item" data-display="reselect">🔄 Change Screen on Host</button>`;
        dom.rdDisplaysMenu.innerHTML = html;
        attachDisplaysMenuListeners();
      }
      return;
    }

    if (evt.t === 'quality_ack') {
      const desc = evt.preset === 'crisp' ? '15 Mbps / 30 FPS' : (evt.preset === 'low' ? '2 Mbps / 30 FPS' : '8 Mbps / 60 FPS');
      toast(`Host adjusted video stream to ${desc}`);
      return;
    }

    // Laser pointer visualization
    if (evt.t === 'pointer' || evt.t === 'mouse_move') {
      renderRemoteLaser(evt.x, evt.y);
    }

    // Forward to local OS bridge if active
    if (rdControlGranted && bridgeConnected && localBridgeWs && localBridgeWs.readyState === WebSocket.OPEN) {
      try {
        localBridgeWs.send(JSON.stringify(evt));
      } catch (err) {
        console.warn('[Bridge] Forward error:', err);
      }
    }
  }

  function renderRemoteLaser(normX, normY) {
    if (!dom.rdLaserPointer) return;
    const targetVideo = session?.isScreenSharing?.() ? dom.localVideo : dom.remoteVideo;
    if (!targetVideo || !targetVideo.videoWidth || !targetVideo.videoHeight) return;

    const rect = targetVideo.getBoundingClientRect();
    const videoRatio = targetVideo.videoWidth / targetVideo.videoHeight;
    const elRatio = rect.width / rect.height;

    let actualWidth, actualHeight, offsetX, offsetY;
    if (elRatio > videoRatio) {
      actualHeight = rect.height;
      actualWidth = rect.height * videoRatio;
      offsetX = (rect.width - actualWidth) / 2;
      offsetY = 0;
    } else {
      actualWidth = rect.width;
      actualHeight = rect.width / videoRatio;
      offsetX = 0;
      offsetY = (rect.height - actualHeight) / 2;
    }

    const pixelX = rect.left + offsetX + (normX * actualWidth);
    const pixelY = rect.top + offsetY + (normY * actualHeight);

    show(dom.rdLaserPointer);
    dom.rdLaserPointer.style.left = `${pixelX}px`;
    dom.rdLaserPointer.style.top = `${pixelY}px`;

    if (sessionRemotePubKey && dom.rdLaserPointerLabel) {
      dom.rdLaserPointerLabel.textContent = getContactDisplayName(sessionRemotePubKey);
    }

    if (rdRemoteLaserTimer) clearTimeout(rdRemoteLaserTimer);
    rdRemoteLaserTimer = setTimeout(() => {
      hide(dom.rdLaserPointer);
    }, 3000);
  }

  function attachDisplaysMenuListeners() {
    dom.rdDisplaysMenu?.querySelectorAll('.rd-key-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hide(dom.rdDisplaysMenu);
        const action = btn.dataset.display;
        if (action === 'reselect') {
          sendRdInput({ t: 'reselect_screen' });
          toast('Requested host to re-select screen / window.');
        } else {
          dom.rdDisplaysMenu?.querySelectorAll('.rd-key-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (dom.rdDisplaysLabel) dom.rdDisplaysLabel.textContent = `Disp ${action} ▾`;
          sendRdInput({ t: 'switch_display', displayId: action });
          toast(`Switched display view.`);
        }
      });
    });
  }

  let rdReconnectTimer = null;
  let rdReconnectCountdown = 4;

  function showRdReconnectBanner() {
    if (!dom.callOverlay?.classList.contains('call-overlay--rd')) return;
    if (dom.rdReconnectBanner) {
      show(dom.rdReconnectBanner);
      rdReconnectCountdown = 4;
      updateRdReconnectCountdown();
      if (rdReconnectTimer) clearInterval(rdReconnectTimer);
      rdReconnectTimer = setInterval(() => {
        rdReconnectCountdown--;
        if (rdReconnectCountdown <= 0) {
          clearInterval(rdReconnectTimer);
          rdReconnectTimer = null;
          attemptRdReconnect();
        } else {
          updateRdReconnectCountdown();
        }
      }, 1000);
    }
  }

  function hideRdReconnectBanner() {
    if (rdReconnectTimer) {
      clearInterval(rdReconnectTimer);
      rdReconnectTimer = null;
    }
    hide(dom.rdReconnectBanner);
  }

  function updateRdReconnectCountdown() {
    if (dom.rdReconnectStatus) {
      dom.rdReconnectStatus.textContent = `Auto-reconnecting in ${rdReconnectCountdown}s…`;
    }
  }

  async function attemptRdReconnect() {
    if (!activeRemoteDesktopDevice) return;
    toast(`Attempting to resume connection with ${activeRemoteDesktopDevice.name}…`);
    if (dom.rdReconnectStatus) dom.rdReconnectStatus.textContent = 'Connecting to host…';
    try {
      if (!NostrTransport.isConnected()) await NostrTransport.connect();
      nostrActiveSessionId = await NostrSignaling.startSession(activeRemoteDesktopDevice.pubkey, {
        pin: activeRemoteDesktopDevice.pin || '',
        isUnattended: true,
      });
      sessionRemotePubKey = activeRemoteDesktopDevice.pubkey;
    } catch (e) {
      toast(`Reconnect failed: ${e.message}`);
      if (dom.rdReconnectStatus) dom.rdReconnectStatus.textContent = 'Reconnect failed. Tap Reconnect to retry.';
    }
  }

  function attachRemoteVideoInputListeners() {
    const v = dom.remoteVideo;
    if (!v || v._rdListenersAttached) return;
    v._rdListenersAttached = true;

    let lastMoveTime = 0;
    v.addEventListener('mousemove', (e) => {
      if (rdMode === 'view') return;
      const now = performance.now();
      if (now - lastMoveTime < 16) return; // ~60fps
      lastMoveTime = now;

      const coords = getNormalizedVideoCoordinates(e, v);
      if (!coords) return;

      if (rdMode === 'pointer') {
        sendRdInput({ t: 'pointer', x: coords.x, y: coords.y, active: true });
      } else if (rdMode === 'control') {
        sendRdInput({ t: 'mouse_move', x: coords.x, y: coords.y });
      }
    });

    v.addEventListener('mousedown', (e) => {
      if (rdMode === 'view') return;
      const coords = getNormalizedVideoCoordinates(e, v);
      if (!coords) return;

      if (rdMode === 'pointer') {
        sendRdInput({ t: 'pointer', x: coords.x, y: coords.y, click: true });
      } else if (rdMode === 'control') {
        sendRdInput({ t: 'mouse_down', btn: e.button, x: coords.x, y: coords.y });
      }
    });

    v.addEventListener('mouseup', (e) => {
      if (rdMode === 'control') {
        const coords = getNormalizedVideoCoordinates(e, v);
        sendRdInput({ t: 'mouse_up', btn: e.button, x: coords ? coords.x : 0, y: coords ? coords.y : 0 });
      }
    });

    v.addEventListener('contextmenu', (e) => {
      if (rdMode === 'control') {
        e.preventDefault();
      }
    });

    v.addEventListener('wheel', (e) => {
      if (rdMode === 'control') {
        e.preventDefault();
        sendRdInput({ t: 'wheel', dx: e.deltaX, dy: e.deltaY });
      }
    }, { passive: false });

    v.addEventListener('dblclick', (e) => {
      if (rdMode === 'control') {
        const coords = getNormalizedVideoCoordinates(e, v);
        if (coords) {
          sendRdInput({ t: 'mouse_click', btn: e.button, dbl: true, x: coords.x, y: coords.y });
        }
      }
    });

    // Touch event support for mobile & tablet remote desktop control
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let longPressTimer = null;
    let isLongPress = false;
    let lastTapTime = 0;
    let lastTapCoords = null;

    // Two-finger pinch-to-zoom and pan variables
    let isPinching = false;
    let initialPinchDistance = 0;
    let initialPinchScale = 1.0;
    let initialPinchMidX = 0;
    let initialPinchMidY = 0;
    let initialPanX = 0;
    let initialPanY = 0;
    let lastPinchMidY = null;
    let pinchMovedSignificantly = false;

    v.addEventListener('touchstart', (e) => {
      if (rdMode === 'view') return;
      if (e.touches.length === 1) {
        isPinching = false;
        touchStartTime = Date.now();
        const t0 = e.touches[0];
        touchStartX = t0.clientX;
        touchStartY = t0.clientY;
        touchMoved = false;
        isLongPress = false;

        const coords = getNormalizedVideoCoordinates(t0, v);
        if (coords) {
          if (rdMode === 'pointer') {
            sendRdInput({ t: 'pointer', x: coords.x, y: coords.y, active: true });
          } else if (rdMode === 'control') {
            sendRdInput({ t: 'mouse_move', x: coords.x, y: coords.y });
          }

          // Long press timer (500ms) for Right Click
          clearTimeout(longPressTimer);
          longPressTimer = setTimeout(() => {
            if (!touchMoved && e.touches.length === 1) {
              isLongPress = true;
              navigator.vibrate?.(60);
              if (rdMode === 'control') {
                sendRdInput({ t: 'mouse_click', btn: 2, x: coords.x, y: coords.y });
                toast('Right Click sent', 'info');
              }
            }
          }, 500);
        }
      } else if (e.touches.length === 2) {
        clearTimeout(longPressTimer);
        isPinching = true;
        pinchMovedSignificantly = false;
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialPinchScale = rdZoomScale;
        initialPinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        initialPinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        initialPanX = rdPanX;
        initialPanY = rdPanY;
        lastPinchMidY = initialPinchMidY;
      }
    }, { passive: false });

    v.addEventListener('touchmove', (e) => {
      if (rdMode === 'view') return;
      e.preventDefault(); // Prevent page bounce/zoom while interacting

      if (e.touches.length === 1 && !isPinching) {
        const t0 = e.touches[0];
        const dist = Math.hypot(t0.clientX - touchStartX, t0.clientY - touchStartY);
        if (dist > 8) {
          touchMoved = true;
          clearTimeout(longPressTimer);
        }

        const now = performance.now();
        if (now - lastMoveTime < 16) return;
        lastMoveTime = now;

        const coords = getNormalizedVideoCoordinates(t0, v);
        if (!coords) return;

        if (rdMode === 'pointer') {
          sendRdInput({ t: 'pointer', x: coords.x, y: coords.y, active: true });
        } else if (rdMode === 'control') {
          sendRdInput({ t: 'mouse_move', x: coords.x, y: coords.y });
        }
      } else if (e.touches.length === 2 && isPinching) {
        clearTimeout(longPressTimer);
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const currentDistance = Math.hypot(dx, dy);
        const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        const distanceDiff = Math.abs(currentDistance - initialPinchDistance);
        if (distanceDiff > 12) pinchMovedSignificantly = true;

        if (initialPinchDistance > 10) {
          const scaleFactor = currentDistance / initialPinchDistance;
          let newScale = Math.min(5.0, Math.max(1.0, initialPinchScale * scaleFactor));

          // If zoomed in, allow panning with two fingers
          if (newScale > 1.05 || initialPinchScale > 1.05) {
            const panDeltaX = currentMidX - initialPinchMidX;
            const panDeltaY = currentMidY - initialPinchMidY;
            rdPanX = initialPanX + panDeltaX;
            rdPanY = initialPanY + panDeltaY;

            // Clamping pan bounds to prevent video flying off screen
            const parent = v.parentElement;
            const pWidth = parent ? parent.clientWidth : window.innerWidth;
            const pHeight = parent ? parent.clientHeight : window.innerHeight;
            const maxPanX = (pWidth * (newScale - 1)) / 1.8;
            const maxPanY = (pHeight * (newScale - 1)) / 1.8;
            rdPanX = Math.max(-maxPanX, Math.min(maxPanX, rdPanX));
            rdPanY = Math.max(-maxPanY, Math.min(maxPanY, rdPanY));
            rdZoomScale = newScale;
            applyRdZoomTransform(false);
          } else {
            // Not zoomed in and distance not changing much -> Two-finger vertical scroll
            if (!pinchMovedSignificantly && lastPinchMidY !== null) {
              const scrollDy = (lastPinchMidY - currentMidY) * 2;
              if (Math.abs(scrollDy) > 2) {
                sendRdInput({ t: 'wheel', dy: scrollDy });
              }
            }
          }
          lastPinchMidY = currentMidY;
        }
      }
    }, { passive: false });

    v.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);
      if (rdMode === 'view') return;

      if (e.touches.length === 0) {
        isPinching = false;
        lastPinchMidY = null;

        // If zoom is very close to 1.0, snap back cleanly
        if (rdZoomScale < 1.08) {
          resetRdZoom(true);
        }

        if (isLongPress) {
          isLongPress = false;
          return;
        }

        if (!touchMoved) {
          const elapsed = Date.now() - touchStartTime;
          if (elapsed < 350) {
            const lastTouch = e.changedTouches[0];
            const coords = getNormalizedVideoCoordinates(lastTouch, v);
            if (coords) {
              const now = Date.now();
              if (now - lastTapTime < 320 && lastTapCoords && Math.hypot(coords.x - lastTapCoords.x, coords.y - lastTapCoords.y) < 0.05) {
                // Double tap -> Double click
                lastTapTime = 0;
                lastTapCoords = null;
                if (rdMode === 'control') {
                  sendRdInput({ t: 'mouse_move', x: coords.x, y: coords.y });
                  sendRdInput({ t: 'mouse_click', btn: 0, dbl: true, x: coords.x, y: coords.y });
                }
              } else {
                // Single tap -> Left click
                lastTapTime = now;
                lastTapCoords = coords;
                if (rdMode === 'pointer') {
                  sendRdInput({ t: 'pointer', x: coords.x, y: coords.y, click: true });
                } else if (rdMode === 'control') {
                  sendRdInput({ t: 'mouse_move', x: coords.x, y: coords.y });
                  sendRdInput({ t: 'mouse_click', btn: 0, x: coords.x, y: coords.y });
                }
              }
            }
          }
        }
      } else if (e.touches.length === 1) {
        // One finger lifted from two-finger pinch
        isPinching = false;
        lastPinchMidY = null;
      }
    }, { passive: false });

    v.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      isLongPress = false;
      touchMoved = false;
      isPinching = false;
      lastPinchMidY = null;
    });
  }

  // Window keydown & keyup listeners for remote desktop control
  window.addEventListener('keydown', (e) => {
    if (rdMode !== 'control' || !mediaActive) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Clipboard auto-sync on Paste (Ctrl+V / Cmd+V)
    if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
      if (localStorage.getItem('rd-clip-autosync') === 'true' && navigator.clipboard?.readText) {
        navigator.clipboard.readText().then(text => {
          if (text) sendRdInput({ t: 'clipboard', text });
        }).catch(() => {});
      }
    }

    sendRdInput({
      t: 'key_down',
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey
    });

    if (rdKeyboardLocked || e.key === 'Tab' || e.key === 'Alt') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (rdMode !== 'control' || !mediaActive) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    sendRdInput({
      t: 'key_up',
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey
    });
  });

  async function startRemoteDesktopSession(forceShare = false) {
    if (!session) { toast('Connect to peer first.'); return; }

    const canShare = !!(navigator.mediaDevices?.getDisplayMedia);

    if (!forceShare && !mediaActive) {
      if (!canShare) {
        // Mobile or unsupported browser: automatically request remote screen
        toast('Requesting desktop screen from peer…');
        isWaitingForRemoteDesktop = true;
        sendRdInput({ t: 'remote_desktop_request' });
        return;
      }

      // On desktop: ask whether user wants to share their own screen or view/control peer's screen
      const peerName = sessionRemotePubKey ? getContactDisplayName(sessionRemotePubKey) : 'Peer';
      const choice = confirm(`Remote Desktop with ${peerName}:\n\n• Click OK to share YOUR screen with ${peerName}.\n• Click Cancel to request ${peerName}'s desktop screen.`);
      if (!choice) {
        toast(`Requested desktop screen from ${peerName}…`);
        isWaitingForRemoteDesktop = true;
        sendRdInput({ t: 'remote_desktop_request' });
        return;
      }
    }

    if (!mediaActive) {
      try {
        const stream = await session.startScreenShare({ captureAudio: true, highFps: true });
        dom.localVideo.srcObject = stream;
        mediaActive = true;
        show(dom.callOverlay);
        dom.callOverlay?.classList.add('call-overlay--rd');
        populateDeviceSelectors();
        dom.btnToggleAudio.disabled = false;
        dom.btnToggleVideo.disabled = false;
        dom.btnScreenShare.disabled = false;
        dom.btnScreenShare.classList.add('call-btn--sharing');
        dom.btnRdToggle.disabled = false;
        dom.btnEndCall.disabled = false;
        show(dom.rdToolbar);
        toast('Screen sharing started! Peer can now view your desktop.');
        connectLocalBridge(true);
      } catch (err) {
        console.error('Remote Desktop start error:', err);
        toast('Could not start screen sharing: ' + (err.message || ''));
        throw err;
      }
    } else {
      if (dom.rdToolbar) {
        dom.rdToolbar.classList.toggle('hidden');
      }
    }
  }

  function exitRemoteDesktopMode() {
    recordRdSessionEnd();
    hideRdReconnectBanner();
    setRdMode('view');
    hide(dom.rdToolbar);
    dom.rdToolbar?.classList.remove('rd-toolbar--collapsed');
    hide(dom.rdHostPrompt);
    hide(dom.rdHostActiveBar);
    hide(dom.rdLaserPointer);
    resetRdZoom(false);
    dom.callOverlay?.classList.remove('call-overlay--rd');
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (rdKeyboardLocked && navigator.keyboard?.unlock) {
      navigator.keyboard.unlock();
      rdKeyboardLocked = false;
    }
  }

  function disconnectRemoteDesktop() {
    toast('Disconnecting Remote Desktop…');
    sendRdInput({ t: 'session_ended' });
    recordRdSessionEnd();
    hideRdReconnectBanner();
    if (activeRemoteDesktopDevice || isWaitingForRemoteDesktop) {
      if (nostrActiveSessionId) {
        try {
          NostrSignaling.closeSession(nostrActiveSessionId);
        } catch (e) {
          console.warn('[disconnectRemoteDesktop] Error closing nostr session:', e);
        }
      }
    }
    endMediaCall(true);
    if (session) {
      try { session.close(); } catch {}
      session = null;
    }
    activeRemoteDesktopDevice = null;
    isWaitingForRemoteDesktop = false;
    exitRemoteDesktopMode();
    dom.callOverlay?.classList.remove('call-overlay--rd');
    hide(dom.callOverlay);
    hide(dom.connectBanner);
    toast('Remote Desktop session disconnected.');
  }

  function connectLocalBridge(silent = false) {
    if (localBridgeWs && localBridgeWs.readyState === WebSocket.OPEN) return;
    try {
      localBridgeWs = new WebSocket('ws://127.0.0.1:9999');
      localBridgeWs.onopen = () => {
        bridgeConnected = true;
        updateBridgeUI(true);
        if (!silent) toast('Host OS Bridge connected! Native OS control active.');
      };
      localBridgeWs.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.t === 'connected' || msg.t === 'auth_ok') {
            bridgeConnected = true;
            updateBridgeUI(true);
          }
        } catch {}
      };
      localBridgeWs.onclose = () => {
        bridgeConnected = false;
        updateBridgeUI(false);
      };
      localBridgeWs.onerror = () => {
        bridgeConnected = false;
        updateBridgeUI(false);
      };
    } catch {
      bridgeConnected = false;
      updateBridgeUI(false);
    }
  }

  function disconnectLocalBridge() {
    if (localBridgeWs) {
      try { localBridgeWs.close(); } catch {}
      localBridgeWs = null;
    }
    bridgeConnected = false;
    updateBridgeUI(false);
    toast('Host OS Bridge disconnected.');
  }

  function updateBridgeUI(connected) {
    if (dom.bridgeStatusPill) {
      dom.bridgeStatusPill.className = 'badge ' + (connected ? 'badge--connected' : 'badge--idle');
      dom.bridgeStatusPill.textContent = connected ? 'Active (ws://127.0.0.1:9999)' : 'Disconnected (ws://127.0.0.1:9999)';
    }
    if (dom.btnToggleBridge) {
      dom.btnToggleBridge.textContent = connected ? 'Disconnect Bridge' : 'Connect Bridge';
      dom.btnToggleBridge.className = 'btn btn--small ' + (connected ? 'btn--outline' : 'btn--primary');
    }
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
      if (navigator.mediaDevices?.getDisplayMedia) {
        dom.btnScreenShare.disabled = false;
        dom.btnRdToggle.disabled = false;
      }
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
        if (navigator.mediaDevices?.getDisplayMedia) {
          dom.btnScreenShare.disabled = false;
          dom.btnRdToggle.disabled = false;
        }
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
    activeRemoteDesktopDevice = null;
    pendingRemoteStream = null;
    pendingRemoteStreamPubkey = null;
    hide(dom.callOverlay);
    hide(dom.incomingCall);
    dom.btnToggleAudio.disabled = true;
    dom.btnToggleVideo.disabled = true;
    dom.btnScreenShare.disabled = true;
    dom.btnRdToggle.disabled = true;
    dom.btnEndCall.disabled = true;
    exitRemoteDesktopMode();
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
    if (navigator.mediaDevices?.getDisplayMedia) {
      dom.btnScreenShare.disabled = false;
      dom.btnRdToggle.disabled = false;
    }
    show(dom.rdToolbar);
    attachRemoteVideoInputListeners();
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
      onIceCandidateError: (err) => {
        lastIceErrors.push({ url: err.url, code: err.errorCode, text: err.errorText, ts: Date.now() });
      },
      onChannelOpen: () => { enableChat(); hide(dom.manualPanel); show(dom.chatActive); toast('Connected!'); },
      onChannelClose: () => { disableChat(); },
      onMessage: (data) => { try { const p = JSON.parse(data); if (p._ack) { markDelivered(p._ack); return; } appendChatBubble({ id: p.id, text: p.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' }); session.send(JSON.stringify({ _ack: p.id })); } catch {} },
      onError: () => {},
      onInputEvent: handleIncomingInputEvent,
      onFileProgress: handleFileProgress,
      onFileReceived: (blob, filename, meta) => handleFileReceived(blob, filename, meta, null),
      onFileAbort: handleFileAbort,
      onRemoteStream: (stream) => {
        if (mediaActive) {
          dom.remoteVideo.srcObject = stream;
          dom.remoteVideo.play().catch(() => {});
          hide(dom.remoteNoVideo);
          show(dom.rdToolbar);
          dom.btnRdToggle.disabled = false;
          attachRemoteVideoInputListeners();
          return;
        }
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
      onIceCandidateError: (err) => {
        lastIceErrors.push({ url: err.url, code: err.errorCode, text: err.errorText, ts: Date.now() });
      },
      onChannelOpen: () => { enableChat(); hide(dom.manualPanel); show(dom.chatActive); toast('Connected!'); },
      onChannelClose: () => { disableChat(); },
      onMessage: (data) => { try { const p = JSON.parse(data); if (p._ack) { markDelivered(p._ack); return; } appendChatBubble({ id: p.id, text: p.text, sender: 'peer', ts: Date.now(), status: 'delivered', type: 'text' }); session.send(JSON.stringify({ _ack: p.id })); } catch {} },
      onError: () => {},
      onInputEvent: handleIncomingInputEvent,
      onFileProgress: handleFileProgress,
      onFileReceived: (blob, filename, meta) => handleFileReceived(blob, filename, meta, null),
      onFileAbort: handleFileAbort,
      onRemoteStream: (stream) => {
        if (mediaActive) {
          dom.remoteVideo.srcObject = stream;
          dom.remoteVideo.play().catch(() => {});
          hide(dom.remoteNoVideo);
          show(dom.rdToolbar);
          dom.btnRdToggle.disabled = false;
          attachRemoteVideoInputListeners();
          return;
        }
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

  // Remote Computer Modal
  dom.btnAddRemoteDevice?.addEventListener('click', () => {
    if (dom.remoteDeviceToken) dom.remoteDeviceToken.value = '';
    if (dom.remoteDeviceNickname) dom.remoteDeviceNickname.value = '';
    if (dom.remoteDevicePin) dom.remoteDevicePin.value = '';
    if (dom.clientIdDisplay && nostrIdentity) {
      dom.clientIdDisplay.textContent = nostrIdentity.publicKey;
    }
    show(dom.addRemoteDeviceModal);
  });
  dom.btnCloseAddRemoteDevice?.addEventListener('click', () => hide(dom.addRemoteDeviceModal));
  dom.btnCopyClientId?.addEventListener('click', () => {
    if (nostrIdentity) copyText(nostrIdentity.publicKey, 'Client ID');
  });

  const btnToggleClientPin = document.getElementById('btn-toggle-client-pin-visibility');
  btnToggleClientPin?.addEventListener('click', () => {
    if (!dom.remoteDevicePin) return;
    const isPass = dom.remoteDevicePin.type === 'password';
    dom.remoteDevicePin.type = isPass ? 'text' : 'password';
    btnToggleClientPin.innerHTML = isPass ?
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` :
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  function parseRemoteDeviceToken(val) {
    if (!val) return;
    const trimmed = val.trim();
    if (trimmed.startsWith('P2P-HOST:')) {
      const parts = trimmed.split(':');
      const pubkey = parts[1] || '';
      const name = parts[2] ? decodeURIComponent(parts[2]) : '';
      if (dom.remoteDeviceToken) dom.remoteDeviceToken.value = pubkey;
      if (name && dom.remoteDeviceNickname && !dom.remoteDeviceNickname.value) {
        dom.remoteDeviceNickname.value = name;
      }
    }
  }

  dom.remoteDeviceToken?.addEventListener('input', (e) => parseRemoteDeviceToken(e.target.value));
  dom.remoteDeviceToken?.addEventListener('paste', () => {
    setTimeout(() => parseRemoteDeviceToken(dom.remoteDeviceToken?.value || ''), 50);
  });

  dom.btnScanRemoteQr?.addEventListener('click', () => {
    openQrScanner((token) => {
      parseRemoteDeviceToken(token);
      toast('Host QR scanned!');
    });
  });

  dom.btnSaveRemoteDevice?.addEventListener('click', () => {
    parseRemoteDeviceToken(dom.remoteDeviceToken?.value || '');
    const pubkey = dom.remoteDeviceToken?.value.trim().toLowerCase();
    if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) {
      toast('Invalid public key (must be 64-character hex or P2P-HOST token).');
      return;
    }
    const name = dom.remoteDeviceNickname?.value.trim() || `Host-${pubkey.slice(0, 6)}`;
    const pin = dom.remoteDevicePin?.value.trim() || '';
    const icon = dom.remoteDeviceIcon?.value || '🖥️';

    const existing = loadRemoteDevices().find(d => d.pubkey === pubkey);
    addOrUpdateRemoteDevice(pubkey, name, pin, icon);
    hide(dom.addRemoteDeviceModal);
    if (dom.remoteDeviceToken) dom.remoteDeviceToken.value = '';
    if (dom.remoteDeviceNickname) dom.remoteDeviceNickname.value = '';
    if (dom.remoteDevicePin) dom.remoteDevicePin.value = '';
    toast(existing ? `Updated computer "${name}"!` : `Saved computer "${name}"!`);
  });

  // ── Edit Remote Computer Modal Bindings ──
  dom.btnCloseEditRemoteDevice?.addEventListener('click', () => hide(dom.editRemoteDeviceModal));
  dom.btnCancelEditRemoteDevice?.addEventListener('click', () => hide(dom.editRemoteDeviceModal));

  dom.btnToggleEditPinVisibility?.addEventListener('click', () => {
    if (!dom.editRemoteDevicePin) return;
    const isPass = dom.editRemoteDevicePin.type === 'password';
    dom.editRemoteDevicePin.type = isPass ? 'text' : 'password';
    const btn = dom.btnToggleEditPinVisibility;
    btn.innerHTML = isPass ?
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` :
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  dom.btnCopyEditPubkey?.addEventListener('click', () => {
    const pk = dom.editRemoteDeviceOriginalPubkey?.value;
    if (pk) copyText(pk, 'Host public key');
  });

  dom.btnCopyQuickConnectLink?.addEventListener('click', () => {
    const pk = dom.editRemoteDeviceOriginalPubkey?.value;
    if (!pk) return;
    const pin = dom.editRemoteDevicePin?.value?.trim() || '';
    const cleanUrl = `${window.location.origin}${window.location.pathname}?remoteHost=${pk}${pin ? '#pin=' + encodeURIComponent(pin) : ''}`;
    copyText(cleanUrl, '1-Click Quick Connect Link');
  });

  dom.btnTestRemoteDevice?.addEventListener('click', () => {
    const pk = dom.editRemoteDeviceOriginalPubkey?.value;
    if (pk) testRemoteDeviceReachability(pk);
  });

  dom.btnDeleteFromEdit?.addEventListener('click', () => {
    const pk = dom.editRemoteDeviceOriginalPubkey?.value;
    if (!pk) return;
    const dev = loadRemoteDevices().find(d => d.pubkey === pk);
    const name = dev ? dev.name : 'this computer';
    if (confirm(`Delete "${name}" from your saved computers?`)) {
      removeRemoteDevice(pk);
      hide(dom.editRemoteDeviceModal);
      toast(`Deleted "${name}".`);
    }
  });

  dom.btnSaveEditRemoteDevice?.addEventListener('click', () => {
    const pk = dom.editRemoteDeviceOriginalPubkey?.value;
    if (!pk) return;
    const name = dom.editRemoteDeviceNickname?.value.trim() || `Host-${pk.slice(0, 6)}`;
    const icon = dom.editRemoteDeviceIcon?.value || '🖥️';
    const pin = dom.editRemoteDevicePin?.value?.trim() || '';

    const devices = loadRemoteDevices();
    const dev = devices.find(d => d.pubkey === pk);
    if (dev) {
      dev.name = name;
      dev.icon = icon;
      dev.pin = pin;
      saveRemoteDevices(devices);
      hide(dom.editRemoteDeviceModal);
      toast(`Saved changes for "${name}"!`);
    }
  });

  function checkUrlRemoteHostParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const remoteHost = params.get('remoteHost');
      if (remoteHost && /^[0-9a-f]{64}$/i.test(remoteHost.trim())) {
        const pk = remoteHost.trim().toLowerCase();
        let pin = '';
        if (window.location.hash && window.location.hash.includes('pin=')) {
          const match = window.location.hash.match(/pin=([^&]+)/);
          if (match) pin = decodeURIComponent(match[1]);
        }
        addOrUpdateRemoteDevice(pk, `Host-${pk.slice(0, 6)}`, pin);
        toast(`Configured remote computer from link!`, 'info');
        const dev = loadRemoteDevices().find(d => d.pubkey === pk);
        if (dev) {
          setTimeout(() => connectToRemoteDevice(dev), 800);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('[Remote Host URL Param Error]', e);
    }
  }

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
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) {
      await sendSelectedFiles(files);
    }
  });

  // Screenshot attachment & clipboard paste
  dom.chatInput?.addEventListener('paste', handleChatPaste);
  dom.chatMessages?.addEventListener('paste', handleChatPaste);

  dom.btnAttachScreenshot?.addEventListener('click', () => {
    if (dom.screenshotInput) dom.screenshotInput.click();
  });

  dom.screenshotInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      await processScreenshotFile(file);
    }
  });

  dom.btnChatSendDiag?.addEventListener('click', () => {
    if (dom.btnSendAiAgent) dom.btnSendAiAgent.click();
  });

  // Drag and drop multiple files
  ['dragenter', 'dragover'].forEach(eventName => {
    dom.chatActive?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (session && session.isChannelOpen && session.isChannelOpen()) {
        dom.chatActive.classList.add('chat-active--dragover');
      }
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dom.chatActive?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.chatActive.classList.remove('chat-active--dragover');
    });
  });

  dom.chatActive?.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.chatActive.classList.remove('chat-active--dragover');
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      await sendSelectedFiles(dt.files);
    }
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
    
    const ok = await ensurePeerConnected(activeContactPubkey);
    if (!ok) {
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
        dom.localVideo.play().catch(() => {});
        dom.btnScreenShare.classList.add('call-btn--sharing');
        ss.getVideoTracks()[0].onended = () => {
          const ls = session.getLocalStream();
          if (ls) {
            dom.localVideo.srcObject = ls;
            dom.localVideo.play().catch(() => {});
          }
          dom.btnScreenShare.classList.remove('call-btn--sharing');
        };
      } catch (err) { 
        console.error('Screen share error:', err);
        const msg = !navigator.mediaDevices?.getDisplayMedia
          ? 'Screen sharing is not supported on this device.'
          : 'Screen share failed.';
        toast(msg); 
      }
    }
  });

  // ── Remote Desktop Listeners ──
  dom.btnRemoteDesktop?.addEventListener('click', () => startRemoteDesktopSession());
  dom.btnRdToggle?.addEventListener('click', () => {
    if (dom.rdToolbar) {
      dom.rdToolbar.classList.toggle('hidden');
    }
  });

  dom.rdModeView?.addEventListener('click', () => setRdMode('view'));
  dom.rdModePointer?.addEventListener('click', () => setRdMode('pointer'));
  dom.rdModeControl?.addEventListener('click', () => {
    if (!rdControlGranted) {
      toast('Requesting remote control permission from peer…');
      sendRdInput({ t: 'control_request' });
    } else {
      setRdMode('control');
    }
  });

  dom.rdBtnPointerLock?.addEventListener('click', () => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
      dom.rdBtnPointerLock.classList.remove('active');
    } else {
      dom.remoteVideo?.requestPointerLock?.();
      dom.rdBtnPointerLock.classList.add('active');
    }
  });
  document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === dom.remoteVideo;
    dom.rdBtnPointerLock?.classList.toggle('active', isLocked);
  });

  dom.rdBtnKeyboardLock?.addEventListener('click', async () => {
    if (rdKeyboardLocked) {
      if (navigator.keyboard?.unlock) navigator.keyboard.unlock();
      rdKeyboardLocked = false;
      dom.rdBtnKeyboardLock.classList.remove('active');
      toast('Keyboard unlocked');
    } else {
      if (navigator.keyboard?.lock) {
        try {
          await navigator.keyboard.lock(['Escape', 'Tab', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
          rdKeyboardLocked = true;
          dom.rdBtnKeyboardLock.classList.add('active');
          toast('Keyboard locked to remote desktop (Esc, Tab, Alt captured)');
        } catch {
          toast('Keyboard lock requires fullscreen mode');
        }
      } else {
        toast('Keyboard lock API not supported in this browser');
      }
    }
  });

  dom.rdBtnSyncClipboard?.addEventListener('click', (e) => {
    e.stopPropagation();
    hide(dom.rdKeysMenu);
    hide(dom.rdQualityMenu);
    hide(dom.rdDisplaysMenu);
    dom.rdClipboardMenu?.classList.toggle('hidden');
  });

  dom.rdClipSend?.addEventListener('click', async (e) => {
    e.stopPropagation();
    hide(dom.rdClipboardMenu);
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          sendRdInput({ t: 'clipboard', text });
          toast('Clipboard text sent to remote host!');
        } else {
          toast('Clipboard is empty.');
        }
      } else {
        toast('Clipboard read not permitted in this browser.');
      }
    } catch (e) {
      toast('Clipboard read error: ' + (e.message || ''));
    }
  });

  dom.rdClipFetch?.addEventListener('click', (e) => {
    e.stopPropagation();
    hide(dom.rdClipboardMenu);
    sendRdInput({ t: 'get_clipboard' });
    toast('Requested remote host clipboard…');
  });

  if (dom.rdClipAutoSync) {
    dom.rdClipAutoSync.checked = localStorage.getItem('rd-clip-autosync') === 'true';
    dom.rdClipAutoSync.addEventListener('change', () => {
      localStorage.setItem('rd-clip-autosync', dom.rdClipAutoSync.checked ? 'true' : 'false');
      toast(dom.rdClipAutoSync.checked ? 'Clipboard auto-sync enabled on Ctrl+V' : 'Clipboard auto-sync disabled');
    });
  }

  dom.rdBtnQuality?.addEventListener('click', (e) => {
    e.stopPropagation();
    hide(dom.rdKeysMenu);
    hide(dom.rdClipboardMenu);
    hide(dom.rdDisplaysMenu);
    dom.rdQualityMenu?.classList.toggle('hidden');
  });

  dom.rdQualityMenu?.querySelectorAll('.rd-key-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hide(dom.rdQualityMenu);
      const quality = btn.dataset.quality;
      if (quality) setRdQualityPreset(quality);
    });
  });

  dom.rdBtnDisplays?.addEventListener('click', (e) => {
    e.stopPropagation();
    hide(dom.rdKeysMenu);
    hide(dom.rdClipboardMenu);
    hide(dom.rdQualityMenu);
    dom.rdDisplaysMenu?.classList.toggle('hidden');
    sendRdInput({ t: 'get_monitors' });
  });
  attachDisplaysMenuListeners();

  dom.rdBtnSpecialKeys?.addEventListener('click', (e) => {
    e.stopPropagation();
    hide(dom.rdClipboardMenu);
    hide(dom.rdQualityMenu);
    hide(dom.rdDisplaysMenu);
    dom.rdKeysMenu?.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    hide(dom.rdKeysMenu);
    hide(dom.rdClipboardMenu);
    hide(dom.rdQualityMenu);
    hide(dom.rdDisplaysMenu);
  });

  dom.rdKeysMenu?.querySelectorAll('.rd-key-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.key;
      hide(dom.rdKeysMenu);
      if (action) {
        sendRdInput({ t: 'special_key', key: action });
        toast(`Sent ${btn.textContent} to remote machine`);
      }
    });
  });

  dom.btnRdReconnectNow?.addEventListener('click', () => {
    attemptRdReconnect();
  });

  dom.btnRdReconnectCancel?.addEventListener('click', () => {
    disconnectRemoteDesktop();
  });

  dom.btnExportFleet?.addEventListener('click', () => exportFleet());
  dom.btnImportFleet?.addEventListener('click', () => dom.fleetImportFile?.click());
  dom.fleetImportFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) importFleet(file);
  });

  dom.btnOpenSleepGuide?.addEventListener('click', () => show(dom.hostSleepGuideModal));
  dom.btnCloseSleepGuide?.addEventListener('click', () => hide(dom.hostSleepGuideModal));
  dom.btnAckSleepGuide?.addEventListener('click', () => hide(dom.hostSleepGuideModal));

  dom.rdBtnFit?.addEventListener('click', () => cycleFitMode());

  dom.rdBtnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      dom.callOverlay?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  dom.rdBtnDisconnect?.addEventListener('click', () => {
    disconnectRemoteDesktop();
  });

  dom.rdBtnCollapse?.addEventListener('click', () => {
    dom.rdToolbar?.classList.toggle('rd-toolbar--collapsed');
  });

  dom.rdBtnResetZoom?.addEventListener('click', () => {
    resetRdZoom(true);
  });

  dom.rdBtnKeyboard?.addEventListener('click', () => {
    const text = prompt('Enter text to type on the remote desktop:');
    if (text) {
      sendRdInput({ t: 'type_text', text });
      for (const ch of text) {
        sendRdInput({ t: 'key_down', key: ch });
        sendRdInput({ t: 'key_up', key: ch });
      }
      toast('Text sent to remote host.');
    }
  });

  dom.rdBtnGrantControl?.addEventListener('click', () => {
    hide(dom.rdHostPrompt);
    rdControlGranted = true;
    show(dom.rdHostActiveBar);
    sendRdInput({ t: 'control_granted' });
    toast('Remote control granted to peer');
    connectLocalBridge(true);
  });

  dom.rdBtnDenyControl?.addEventListener('click', () => {
    hide(dom.rdHostPrompt);
    sendRdInput({ t: 'control_revoked' });
    toast('Remote control request denied');
  });

  dom.rdBtnRevokeControl?.addEventListener('click', () => {
    hide(dom.rdHostActiveBar);
    rdControlGranted = false;
    sendRdInput({ t: 'control_revoked' });
    toast('Remote control revoked');
  });

  dom.btnToggleBridge?.addEventListener('click', () => {
    if (bridgeConnected) {
      disconnectLocalBridge();
    } else {
      connectLocalBridge(false);
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

  // Test ICE Connectivity
  dom.btnTestIce?.addEventListener('click', async () => {
    dom.btnTestIce.disabled = true;
    dom.btnTestIce.textContent = 'Testing connectivity…';
    show(dom.iceTestResults);
    dom.iceTestResults.innerHTML = '<span style="color:#aeb7c4;">Gathering STUN & TURN candidates across configured servers…</span>';
    
    try {
      const res = await PeerSession.testIceServers(buildIceServers(), 7000);
      let html = '<div style="display:flex;flex-direction:column;gap:6px;">';
      
      // STUN Status
      if (res.stunWorking) {
        html += `<div><b style="color:#4caf50;">✓ STUN Discovery: Working</b> (Public IP: <code>${escapeHtml(res.publicIp || 'detected')}</code>)</div>`;
      } else {
        html += `<div><b style="color:#ef5350;">✗ STUN Discovery: Failed</b> (Unable to discover public IP)</div>`;
      }
      
      // TURN Status
      if (res.turnWorking) {
        html += `<div><b style="color:#42a5f5;">✓ TURN Relay: Active</b> (${res.candidates.relay} relay candidate(s) gathered)</div>`;
      } else {
        const hasTurnServer = buildIceServers().some(s => s.urls.startsWith('turn'));
        if (hasTurnServer) {
          html += `<div><b style="color:#ffa726;">⚠ TURN Relay: Inactive / Failed</b> (No relay candidate allocated)</div>`;
        } else {
          html += `<div><span style="color:#888;">ℹ TURN Relay: None configured (Direct P2P / STUN only)</span></div>`;
        }
      }
      
      // Candidates breakdown
      html += `<div style="color:#888;font-size:0.75rem;">Candidates: host=${res.candidates.host}, srflx=${res.candidates.srflx}, relay=${res.candidates.relay}</div>`;
      
      // Errors
      if (res.errors && res.errors.length > 0) {
        const uniqueErrors = Array.from(new Set(res.errors.map(e => `${e.url ? e.url + ': ' : ''}code ${e.errorCode} ${e.errorText}`)));
        html += `<div style="color:#ef5350;font-size:0.75rem;margin-top:2px;">Errors: ${escapeHtml(uniqueErrors.join(' | '))}</div>`;
      }
      
      html += '</div>';
      dom.iceTestResults.innerHTML = html;
    } catch (err) {
      dom.iceTestResults.innerHTML = `<span style="color:#ef5350;">Test failed: ${escapeHtml(err.message)}</span>`;
    } finally {
      dom.btnTestIce.disabled = false;
      dom.btnTestIce.textContent = '⚡ Test Connectivity (STUN / TURN)';
    }
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

  // ── Diagnostics & Logpkg System ──
  let diagLogUnsubscribe = null;

  async function updateDiagnosticsDashboard() {
    // 1. Relays
    const states = NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : [];
    const connectedCount = states.filter(s => s.state === 'connected').length;
    if (dom.diagRelayStatus) {
      dom.diagRelayStatus.textContent = `${connectedCount}/${states.length} Connected`;
      dom.diagRelayStatus.style.color = connectedCount > 0 ? 'var(--c-primary)' : 'var(--c-danger)';
    }
    if (dom.diagRelayDetail) {
      dom.diagRelayDetail.textContent = connectedCount === states.length && states.length > 0
        ? 'All relays healthy & operational'
        : (connectedCount > 0 ? 'Some relays connecting/failed' : 'All relays disconnected');
    }

    // 2. WebRTC P2P Direct
    const isConn = session && session.isChannelOpen && session.isChannelOpen();
    const pc = session && session.getRawPC ? session.getRawPC() : null;
    if (dom.diagWebrtcStatus) {
      if (isConn) {
        dom.diagWebrtcStatus.textContent = '🟢 Connected (Active)';
        dom.diagWebrtcStatus.style.color = 'var(--c-primary)';
      } else if (session && session.getState && session.getState() === 'connecting') {
        dom.diagWebrtcStatus.textContent = '🟡 Connecting…';
        dom.diagWebrtcStatus.style.color = '#e3b341';
      } else {
        dom.diagWebrtcStatus.textContent = '⚪ Offline (Relay Only)';
        dom.diagWebrtcStatus.style.color = 'var(--c-text-dim)';
      }
    }
    if (dom.diagWebrtcDetail) {
      if (isConn) {
        dom.diagWebrtcDetail.textContent = `Peer: ${getContactDisplayName(activeContactPubkey || sessionRemotePubKey || 'Direct Peer')}`;
      } else {
        dom.diagWebrtcDetail.textContent = activeContactPubkey ? `Awaiting P2P with ${getContactDisplayName(activeContactPubkey)}` : 'Select a contact to connect';
      }
    }

    // 3. Candidate Pair & Stats
    if (pc && typeof pc.getStats === 'function') {
      try {
        const stats = await pc.getStats();
        let foundPair = false;
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && (report.selected || report.state === 'succeeded')) {
            foundPair = true;
            const rtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : null;
            if (dom.diagCandidatePair) {
              dom.diagCandidatePair.textContent = `Pair: ${report.state || 'succeeded'}`;
            }
            if (dom.diagCandidateDetail) {
              dom.diagCandidateDetail.textContent = rtt !== null ? `Round-trip latency: ${rtt}ms` : `Bytes Sent: ${report.bytesSent || 0}`;
            }
          }
        });
        if (!foundPair && dom.diagCandidatePair) {
          dom.diagCandidatePair.textContent = 'None active';
          dom.diagCandidateDetail.textContent = 'No selected candidate pair yet';
        }
      } catch { }
    } else {
      if (dom.diagCandidatePair) dom.diagCandidatePair.textContent = 'None active';
      if (dom.diagCandidateDetail) dom.diagCandidateDetail.textContent = 'No active RTCPeerConnection';
    }

    // 4. Render Terminal Logs
    renderDiagLogs();
  }

  function renderDiagLogs() {
    if (!dom.diagLogTerminal) return;
    const filter = dom.diagLogFilter ? dom.diagLogFilter.value : 'all';
    const logs = DiagnosticLogger.getLogs();
    const filtered = logs.filter(l => {
      if (filter === 'error') return l.level === 'error' || l.level === 'warn';
      if (filter === 'WebRTC') return l.tag === 'WebRTC';
      if (filter === 'Signaling') return l.tag === 'Signaling';
      if (filter === 'Nostr') return l.tag.startsWith('Nostr');
      return true;
    });

    const lines = filtered.slice(-150).map(l => {
      const timeStr = l.time ? l.time.slice(11, 19) : '';
      const lvl = l.level.toUpperCase().padEnd(5);
      return `[${timeStr}] [${lvl}] [${l.tag}] ${l.message}`;
    });

    dom.diagLogTerminal.textContent = lines.join('\n') || '(no logs recorded yet)';
    dom.diagLogTerminal.scrollTop = dom.diagLogTerminal.scrollHeight;
  }

  function openDiagnosticsModal() {
    show(dom.diagnosticsModal);
    updateDiagnosticsDashboard();
    if (!diagLogUnsubscribe) {
      diagLogUnsubscribe = DiagnosticLogger.subscribe(() => {
        if (!dom.diagnosticsModal?.classList.contains('hidden')) {
          renderDiagLogs();
        }
      });
    }
  }

  function closeDiagnosticsModal() {
    hide(dom.diagnosticsModal);
  }

  // Diagnostic Modal Button Listeners
  dom.btnHeaderDiagnostics?.addEventListener('click', openDiagnosticsModal);
  dom.btnMenuDiagnostics?.addEventListener('click', () => { hide(dom.chatMenu); openDiagnosticsModal(); });
  dom.btnRdDiagnostics?.addEventListener('click', openDiagnosticsModal);
  dom.btnOpenDiagnosticsFull?.addEventListener('click', () => { hide(dom.settingsModal); openDiagnosticsModal(); });
  dom.btnCloseDiagnostics?.addEventListener('click', closeDiagnosticsModal);
  dom.diagLogFilter?.addEventListener('change', renderDiagLogs);
  dom.btnClearDiagLogs?.addEventListener('click', () => { DiagnosticLogger.clearLogs(); renderDiagLogs(); });

  dom.btnDownloadLogpkg?.addEventListener('click', async () => {
    try {
      toast('Generating diagnostic log package…');
      const pkg = await DiagnosticLogger.generateLogPackage({
        session,
        remotePubKey: activeContactPubkey,
        relayList: NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : [],
        extra: { activeContact: activeContactPubkey, appName: 'P2P Connect' }
      });
      DiagnosticLogger.downloadLogPackage(pkg);
      toast('Diagnostic logpkg downloaded! 📥');
    } catch (err) {
      toast('Export failed: ' + err.message);
    }
  });

  dom.btnCopyDiagSummary?.addEventListener('click', async () => {
    try {
      const pkg = await DiagnosticLogger.generateLogPackage({
        session,
        remotePubKey: activeContactPubkey,
        relayList: NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : []
      });
      const summary = DiagnosticLogger.formatMarkdownSummary(pkg);
      await navigator.clipboard.writeText(summary);
      toast('Diagnostic summary copied to clipboard! 📋');
    } catch (err) {
      toast('Copy failed: ' + err.message);
    }
  });

  dom.btnSendAiAgent?.addEventListener('click', async () => {
    try {
      toast('Transmitting diagnostics to AI Support Agent…');
      const pkg = await DiagnosticLogger.generateLogPackage({
        session,
        remotePubKey: activeContactPubkey,
        relayList: NostrTransport.getRelayStates ? NostrTransport.getRelayStates() : []
      });

      // 1. Try local HTTP endpoint on http://127.0.0.1:9998/api/logpkg (fast 600ms probe)
      let sentLocal = false;
      try {
        const controller = new AbortController();
        const probeTimer = setTimeout(() => controller.abort(), 600);
        const resp = await fetch('http://127.0.0.1:9998/api/logpkg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pkg),
          signal: controller.signal,
        });
        clearTimeout(probeTimer);
        if (resp.ok) {
          const result = await resp.json();
          const status = result.analysis?.overallStatus || 'Analyzed';
          toast(`AI Agent: ${status}! Check terminal suggestions.`);
          DiagnosticLogger.record('info', ['[AI Support Agent] Package ingested locally:', JSON.stringify(result.analysis?.rootCauses || [])]);
          updateDiagnosticsDashboard();
          sentLocal = true;
        }
      } catch {
        // Local server not reachable — proceed to Nostr remote transmission
      }

      if (sentLocal) {
        ensureSupportAgentContact();
        openChat(SUPPORT_AGENT_PUBKEY);
        hide(dom.diagnosticsModal);
        return;
      }

      // 2. Remote User: Transmit over Nostr relays directly to SUPPORT_AGENT_PUBKEY!
      if (nostrIdentity && NostrTransport.isConnected()) {
        toast('Transmitting encrypted diagnostics to AI Support Agent over Nostr…');

        // Quota protection: prune to essential diagnostic telemetry only (< 2 KB)
        const prunedPkg = {
          app: pkg.app,
          version: pkg.version,
          generatedAt: pkg.generatedAt,
          identity: pkg.identity,
          environment: {
            platform: pkg.environment?.platform,
            online: pkg.environment?.online,
            effectiveType: pkg.environment?.connection?.effectiveType,
          },
          relays: pkg.relays,
          webrtc: {
            status: pkg.webrtc?.status,
            connectionState: pkg.webrtc?.connectionState,
            iceConnectionState: pkg.webrtc?.iceConnectionState,
            selectedCandidatePair: pkg.webrtc?.selectedCandidatePair,
          },
          recentLogs: (pkg.recentLogs || [])
            .filter(l => l.level === 'error' || l.level === 'warn')
            .slice(-15),
        };

        // Compress pruned payload with pako deflate
        const jsonStr = JSON.stringify(prunedPkg);
        const compressedBytes = pako.deflate(new TextEncoder().encode(jsonStr), { level: 9 });
        const binary = String.fromCharCode.apply(null, compressedBytes);
        const b64Compressed = btoa(binary);

        await NostrTransport.sendSignal(SUPPORT_AGENT_PUBKEY, {
          type: 'diagnostic_logpkg',
          session: 'diag-' + Date.now(),
          data: b64Compressed,
        });

        toast('Encrypted diagnostics transmitted to AI Support Agent! ⚡');
        DiagnosticLogger.record('info', ['[AI Support Agent] Pruned diagnostics sent over Nostr to', SUPPORT_AGENT_PUBKEY]);

        // Auto-open chat conversation with AI Support Agent
        ensureSupportAgentContact();
        openChat(SUPPORT_AGENT_PUBKEY);
        hide(dom.diagnosticsModal);

        // Record a diagnostic card bubble in the chat store
        const diagMsg = {
          id: 'diag-sub-' + Date.now(),
          text: `📋 Diagnostic Log Package transmitted (Status: ${pkg.webrtc?.connectionState || 'evaluating'}). Awaiting AI review…`,
          sender: 'self',
          ts: Date.now(),
          status: 'sent',
          type: 'text'
        };
        ChatStore.addMessage(SUPPORT_AGENT_PUBKEY, diagMsg);
        appendChatBubble(diagMsg);
        return;
      }

      // 3. Fallback: prompt user to download file
      toast('Nostr not connected. Downloading logpkg instead…');
      DiagnosticLogger.downloadLogPackage(pkg);
    } catch (err) {
      console.error('Diagnostic transmission failed:', err);
      toast('Transmission failed: ' + err.message);
      try {
        const fallbackPkg = await DiagnosticLogger.generateLogPackage();
        DiagnosticLogger.downloadLogPackage(fallbackPkg);
      } catch {}
    }
  });

  dom.btnTestNetworkStun?.addEventListener('click', async () => {
    toast('Testing STUN/TURN servers & discovering public IP…');
    if (dom.btnTestNetworkStun) dom.btnTestNetworkStun.disabled = true;
    try {
      const servers = buildIceServers();
      const result = await PeerSession.testIceServers(servers);
      DiagnosticLogger.record('info', [
        `[Diagnostic Network Test] Discovered ${result.candidates?.length || 0} candidate(s), IPs: ${result.discoveredIps?.join(', ') || 'none'}`,
        result.hasRelay ? 'TURN relay operational ✓' : 'No TURN relay candidates (STUN-only)'
      ]);
      toast(`Discovered ${result.candidates?.length || 0} candidate(s)! Public IP: ${result.discoveredIps?.[0] || 'Unknown'}`);
      updateDiagnosticsDashboard();
    } catch (err) {
      DiagnosticLogger.record('error', [`[Diagnostic Network Test Failed]: ${err.message}`]);
      toast('Network test failed: ' + err.message);
    } finally {
      if (dom.btnTestNetworkStun) dom.btnTestNetworkStun.disabled = false;
    }
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
        onLog: (msg, level) => {
          if (level === 'error') console.error(msg);
          else if (level === 'warn') console.warn(msg);
          else console.log(msg);
        },
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
            // Active chatting: peer is online, auto-establish P2P if not connected
            if (!session || !session.isChannelOpen?.()) {
              ensurePeerConnected(senderPubKey).catch(() => {});
            }
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
        onLog: (msg, level) => {
          if (level === 'error') console.error(msg);
          else if (level === 'warn') console.warn(msg);
          else console.log(msg);
        },
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
          startHeartbeat();
          toast('Connected! ⚡');
          // Update connect progress dots
          const dots = dom.connectProgress?.children;
          if (dots) { for (const d of dots) { d.classList.remove('active'); d.classList.add('done'); } }

          // If this is an unattended remote desktop session, immediately ensure callOverlay & toolbar are displayed!
          if (activeRemoteDesktopDevice) {
            show(dom.callOverlay);
            dom.callOverlay?.classList.add('call-overlay--rd');
            show(dom.rdToolbar);
            dom.btnRdToggle.disabled = false;
            attachRemoteVideoInputListeners();
            setRdMode('control');
            rdControlGranted = true;
          }
        },
        onDisconnected: (sessionId) => {
          if (sessionId !== nostrActiveSessionId) return;
          stopHeartbeat();
          handleStateChange('disconnected');
          disableChat();
        },
        onError: (sessionId, errMsg) => {
          if (sessionId !== nostrActiveSessionId) return;
          hide(dom.connectBanner);
          if (activeRemoteDesktopDevice) {
            toast(`Remote Desktop: ${errMsg}`);
            activeRemoteDesktopDevice = null;
            isWaitingForRemoteDesktop = false;
            hide(dom.callOverlay);
          } else {
            toast('Error: ' + errMsg);
          }
        },
        onIncomingRequest: (senderPubKey) => {
          const name = getContactDisplayName(senderPubKey);
          toast(`Incoming from ${name}`);
        },
      });

      setBadge('idle', 'Online');

      // If user selected a contact before Nostr finished initializing, connect now!
      if (pendingAutoConnectPubKey && pendingAutoConnectPubKey === activeContactPubkey) {
        const pk = pendingAutoConnectPubKey;
        pendingAutoConnectPubKey = null;
        ensurePeerConnected(pk).catch(() => {});
      }
    } catch (err) {
      console.error('[Nostr] Init error:', err);
      if (dom.myPubkeyShort) {
        dom.myPubkeyShort.textContent = 'Error loading ID';
        dom.myPubkeyShort.title = err?.message || String(err);
      }
      setBadge('failed', 'Offline');
      toast('Identity error: ' + (err?.message || err));
    }
  }

  // ── Connection Heartbeat & Lifecycle Management ──
  let heartbeatTimer = null;

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (session && typeof session.sendPing === 'function' && session.isChannelOpen?.()) {
        session.sendPing();
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function handleAppResume() {
    console.log('[Lifecycle] App resumed / tab visible');
    // 1. Ensure Nostr relay WebSockets are connected
    if (nostrIdentity && typeof NostrTransport.ensureConnected === 'function') {
      try {
        await NostrTransport.ensureConnected();
        renderRelayList();
      } catch (err) {
        console.warn('[Lifecycle] Relay reconnection error:', err);
      }
    }

    // 2. Check active P2P session
    if (session) {
      if (session.isChannelOpen?.()) {
        if (typeof session.sendPing === 'function') session.sendPing();
        startHeartbeat();
      } else if (activeContactPubkey && nostrIdentity) {
        // Give transient ICE recovery a brief window
        if (typeof session.waitForOpen === 'function') {
          session.waitForOpen(2500).then(open => {
            if (open) startHeartbeat();
          });
        }
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleAppResume();
    } else {
      stopHeartbeat();
    }
  });

  window.addEventListener('focus', () => {
    handleAppResume();
  });

  // ═══ INIT ═══
  setBadge('connecting', 'Connecting…');
  ensureSupportAgentContact();
  renderContacts();
  renderRemoteDevices();
  initNostr();
  checkUrlRemoteHostParam();

})();
