/**
 * ui-controller.js — Wires DOM elements to PeerSession + TokenCodec.
 *
 * Orchestrates the full user flow:
 *   role selection → token exchange → ICE management → chat.
 */

'use strict';

(() => {
  // ── DOM refs ──────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    badge:          $('#connection-badge'),
    badgeLabel:     $('#connection-label'),

    // TURN
    turnUrl:        $('#turn-url'),
    turnUser:       $('#turn-user'),
    turnCred:       $('#turn-cred'),
    btnSaveTurn:    $('#btn-save-turn'),
    turnPanel:      $('#turn-panel'),

    // Role
    roleChooser:    $('#role-chooser'),
    btnCreate:      $('#btn-create'),
    btnJoin:        $('#btn-join'),

    // Create flow
    flowCreate:     $('#flow-create'),
    offerOut:       $('#offer-out'),
    btnCopyOffer:   $('#btn-copy-offer'),
    answerIn:       $('#answer-in'),
    btnAcceptAnswer:$('#btn-accept-answer'),

    // Join flow
    flowJoin:       $('#flow-join'),
    offerIn:        $('#offer-in'),
    btnAcceptOffer: $('#btn-accept-offer'),
    answerOut:      $('#answer-out'),
    btnCopyAnswer:  $('#btn-copy-answer'),

    // ICE
    iceSection:     $('#ice-section'),
    iceOut:         $('#ice-out'),
    btnCopyIce:     $('#btn-copy-ice'),
    iceIn:          $('#ice-in'),
    btnImportIce:   $('#btn-import-ice'),

    // Chat
    chatSection:    $('#chat-section'),
    chatLog:        $('#chat-log'),
    chatForm:       $('#chat-form'),
    chatInput:      $('#chat-input'),
    btnSend:        $('#btn-send'),

    // Media
    mediaSection:   $('#media-section'),
    localVideo:     $('#local-video'),
    remoteVideo:    $('#remote-video'),
    remoteNoVideo:  $('#remote-no-video'),
    btnStartCall:   $('#btn-start-call'),
    btnToggleAudio: $('#btn-toggle-audio'),
    btnToggleVideo: $('#btn-toggle-video'),
    btnScreenShare: $('#btn-screenshare'),
    btnEndCall:     $('#btn-end-call'),

    // Log
    logBody:        $('#log-body'),

    // Retry
    retryBar:       $('#retry-bar'),
    retryMsg:       $('#retry-msg'),
    btnRetry:       $('#btn-retry'),
    btnSuggestTurn: $('#btn-suggest-turn'),
  };

  // ── State ────────────────────────────────────────────────────
  let session       = null;
  let role          = null;   // 'creator' | 'joiner'
  let turnConfig    = null;   // { urls, username, credential } | null
  let connState     = 'idle';
  let iceExported   = false;
  let messageIdCounter = 0;
  let mediaActive   = false;

  // ── Helpers ──────────────────────────────────────────────────
  function show(el)  { el.classList.remove('hidden'); }
  function hide(el)  { el.classList.add('hidden'); }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function setBadge(state, label) {
    connState = state;
    dom.badge.className = `badge badge--${state}`;
    dom.badgeLabel.textContent = label;
  }

  function appendLog(msg, level = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level ? 'log-entry--' + level : ''}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-entry__time">${time}</span><span>${escapeHtml(msg)}</span>`;
    dom.logBody.appendChild(entry);
    dom.logBody.scrollTop = dom.logBody.scrollHeight;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function appendChat(text, who, statusText = '') {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg--${who}`;
    msg.innerHTML = `<div>${escapeHtml(text)}</div>`;
    if (statusText) {
      const st = document.createElement('div');
      st.className = 'chat-msg__status';
      st.textContent = statusText;
      msg.appendChild(st);
    }
    dom.chatLog.appendChild(msg);
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    return msg;
  }

  function systemMsg(text) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--system';
    msg.textContent = text;
    dom.chatLog.appendChild(msg);
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied to clipboard!`);
    } catch {
      // fallback: select textarea
      toast('Copy failed — please select and copy manually.');
    }
  }

  // ── Build ICE servers array ──────────────────────────────────
  function buildIceServers() {
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (turnConfig) {
      servers.push({
        urls:       turnConfig.urls,
        username:   turnConfig.username,
        credential: turnConfig.credential,
      });
      appendLog('TURN server configured as fallback relay');
    }
    return servers;
  }

  // ── Create PeerSession with all callbacks ─────────────────────
  function initSession() {
    session = PeerSession.create({
      iceServers: buildIceServers(),
      onLog: (msg, level) => appendLog(msg, level),
      onStateChange: handleStateChange,
      onIceCandidate: () => refreshIceOutput(),
      onIceComplete: () => {
        refreshIceOutput();
        appendLog('All ICE candidates gathered', 'success');
        setBadge('waiting', 'Waiting for Remote');
      },
      onChannelOpen: () => {
        enableChat();
        hide(dom.retryBar);
        show(dom.mediaSection);
        dom.btnStartCall.disabled = false;
        systemMsg('Secure P2P connection established. Messages are end‑to‑end encrypted (DTLS).');
      },
      onChannelClose: () => {
        disableChat();
        endMediaCall();
        systemMsg('Connection closed by remote peer.');
      },
      onMessage: (data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed._ack) {
            markDelivered(parsed._ack);
            return;
          }
          appendChat(parsed.text, 'peer');
          // send delivery ack
          session.send(JSON.stringify({ _ack: parsed.id }));
        } catch {
          appendChat(data, 'peer');
        }
      },
      onError: (err) => appendLog(err, 'error'),
      onRemoteStream: (stream) => {
        dom.remoteVideo.srcObject = stream;
        // Explicit play() to handle Chrome autoplay policy for unmuted media
        dom.remoteVideo.play().catch((err) => {
          appendLog(`Remote video autoplay blocked: ${err.message} — click anywhere to resume`, 'warn');
          // One-time click handler to resume playback
          const resume = () => {
            dom.remoteVideo.play().catch(() => {});
            document.removeEventListener('click', resume);
          };
          document.addEventListener('click', resume);
        });
        hide(dom.remoteNoVideo);
        appendLog('Remote media stream received', 'success');
      },
      onRemoteStreamEnded: () => {
        dom.remoteVideo.srcObject = null;
        show(dom.remoteNoVideo);
        appendLog('Remote media stream ended');
      },
    });
  }

  // ── State mapping ────────────────────────────────────────────
  function handleStateChange(state) {
    switch (state) {
      case 'gathering':
        setBadge('gathering', 'Gathering ICE');
        break;
      case 'connecting':
        setBadge('connecting', 'Connecting');
        break;
      case 'connected':
        setBadge('connected', 'Connected');
        show(dom.chatSection);
        show(dom.mediaSection);
        break;
      case 'failed':
        setBadge('failed', 'Failed');
        showRetryBar('Connection failed. ICE could not establish a path.');
        break;
      case 'disconnected':
        setBadge('failed', 'Disconnected');
        showRetryBar('Peer disconnected.');
        break;
      case 'closed':
        setBadge('closed', 'Closed');
        break;
    }
  }

  function showRetryBar(msg) {
    dom.retryMsg.textContent = msg;
    show(dom.retryBar);
  }

  // ── ICE output refresh ───────────────────────────────────────
  function refreshIceOutput() {
    const candidates = session.getLocalCandidates();
    if (candidates.length === 0) return;
    const token = TokenCodec.encode('ice', null, candidates);
    dom.iceOut.value = token;
    show(dom.iceSection);
  }

  // ── Chat enable / disable ───────────────────────────────────
  function enableChat() {
    show(dom.chatSection);
    dom.chatInput.disabled = false;
    dom.btnSend.disabled   = false;
    dom.chatInput.focus();
  }

  function disableChat() {
    dom.chatInput.disabled = true;
    dom.btnSend.disabled   = true;
  }

  /** Track pending messages for delivery status. */
  const pendingMsgs = new Map(); // id → DOM element

  function markDelivered(id) {
    const el = pendingMsgs.get(id);
    if (el) {
      const st = el.querySelector('.chat-msg__status');
      if (st) st.textContent = 'Delivered ✓';
      pendingMsgs.delete(id);
    }
  }

  // ── Event Bindings ───────────────────────────────────────────

  // TURN config
  dom.btnSaveTurn.addEventListener('click', () => {
    const url  = dom.turnUrl.value.trim();
    const user = dom.turnUser.value.trim();
    const cred = dom.turnCred.value.trim();
    if (!url) {
      toast('Please enter a TURN URL.');
      return;
    }
    turnConfig = { urls: url, username: user, credential: cred };
    toast('TURN configuration saved.');
    appendLog(`TURN saved: ${url}`);
    dom.turnPanel.removeAttribute('open');
  });

  // ── ROLE: CREATE ─────────────────────────────────────────────
  dom.btnCreate.addEventListener('click', async () => {
    role = 'creator';
    hide(dom.roleChooser);
    show(dom.flowCreate);
    initSession();

    try {
      const offer = await session.createOffer();
      // Wait briefly for some ICE candidates to accumulate
      await waitForIceOrTimeout(3000);
      const candidates = session.getLocalCandidates();
      const token = TokenCodec.encode('offer', offer, candidates);
      dom.offerOut.value = token;
      dom.btnCopyOffer.disabled = false;
      appendLog(`Offer token generated (${token.length} chars, ${candidates.length} ICE candidates bundled)`);
    } catch (err) {
      appendLog(`Offer creation failed: ${err.message}`, 'error');
      toast('Failed to create offer. See log.');
    }
  });

  dom.btnCopyOffer.addEventListener('click', () => copyText(dom.offerOut.value, 'Invite token'));

  dom.btnAcceptAnswer.addEventListener('click', async () => {
    const raw = dom.answerIn.value.trim();
    if (!raw) { toast('Please paste the answer token.'); return; }
    try {
      const data = TokenCodec.decode(raw);
      if (data.type !== 'answer') throw new Error(`Expected answer token, got "${data.type}".`);
      await session.acceptAnswer(data.sdp);
      if (data.candidates.length) {
        await session.addIceCandidates(data.candidates);
      }
      appendLog('Answer accepted — establishing connection…', 'success');
    } catch (err) {
      appendLog(`Invalid answer token: ${err.message}`, 'error');
      toast(err.message);
    }
  });

  // ── ROLE: JOIN ───────────────────────────────────────────────
  dom.btnJoin.addEventListener('click', () => {
    role = 'joiner';
    hide(dom.roleChooser);
    show(dom.flowJoin);
    initSession();
  });

  dom.btnAcceptOffer.addEventListener('click', async () => {
    const raw = dom.offerIn.value.trim();
    if (!raw) { toast('Please paste the invite token.'); return; }
    try {
      const data = TokenCodec.decode(raw);
      if (data.type !== 'offer') throw new Error(`Expected offer token, got "${data.type}".`);
      const answer = await session.acceptOffer(data.sdp);
      if (data.candidates.length) {
        await session.addIceCandidates(data.candidates);
      }
      // Wait briefly for some ICE candidates
      await waitForIceOrTimeout(3000);
      const candidates = session.getLocalCandidates();
      const token = TokenCodec.encode('answer', answer, candidates);
      dom.answerOut.value = token;
      dom.btnCopyAnswer.disabled = false;
      appendLog(`Answer token generated (${token.length} chars, ${candidates.length} ICE candidates bundled)`);
    } catch (err) {
      appendLog(`Invalid offer token: ${err.message}`, 'error');
      toast(err.message);
    }
  });

  dom.btnCopyAnswer.addEventListener('click', () => copyText(dom.answerOut.value, 'Answer token'));

  // ── ICE EXCHANGE ─────────────────────────────────────────────
  dom.btnCopyIce.addEventListener('click', () => {
    copyText(dom.iceOut.value, 'ICE candidates');
    iceExported = true;
  });

  dom.btnImportIce.addEventListener('click', async () => {
    const raw = dom.iceIn.value.trim();
    if (!raw) { toast('Paste remote ICE candidates first.'); return; }
    try {
      const data = TokenCodec.decode(raw);
      if (data.type !== 'ice') throw new Error(`Expected ICE token, got "${data.type}".`);
      if (!data.candidates.length) throw new Error('Token contains no ICE candidates.');
      await session.addIceCandidates(data.candidates);
      dom.iceIn.value = '';
      toast(`Imported ${data.candidates.length} ICE candidate(s).`);
    } catch (err) {
      appendLog(`ICE import error: ${err.message}`, 'error');
      toast(err.message);
    }
  });

  // ── CHAT ─────────────────────────────────────────────────────
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = dom.chatInput.value.trim();
    if (!text) return;

    const id = `m${++messageIdCounter}-${Date.now()}`;
    const payload = JSON.stringify({ id, text });
    const sent = session.send(payload);
    if (sent) {
      const el = appendChat(text, 'self', 'Sent');
      pendingMsgs.set(id, el);
      dom.chatInput.value = '';
      dom.chatInput.focus();
    } else {
      toast('Cannot send — channel not open.');
    }
  });

  // ── MEDIA CALL CONTROLS ──────────────────────────────────────

  dom.btnStartCall.addEventListener('click', async () => {
    if (!session) { toast('No active session.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      session.addLocalStream(stream);
      dom.localVideo.srcObject = stream;
      mediaActive = true;
      dom.btnStartCall.disabled   = true;
      dom.btnToggleAudio.disabled = false;
      dom.btnToggleVideo.disabled = false;
      dom.btnScreenShare.disabled = false;
      dom.btnEndCall.disabled     = false;
      updateMediaButtons(true, true);
      appendLog('Local media started (audio + video)', 'success');
      systemMsg('Audio/video call started.');
    } catch (err) {
      // Try audio-only fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        mediaActive = true;
        dom.btnStartCall.disabled   = true;
        dom.btnToggleAudio.disabled = false;
        dom.btnToggleVideo.disabled = true;
        dom.btnScreenShare.disabled = false;
        dom.btnEndCall.disabled     = false;
        updateMediaButtons(true, false);
        appendLog('Camera unavailable — audio-only call started', 'warn');
        systemMsg('Audio-only call started (camera not available).');
      } catch (err2) {
        appendLog(`Media access denied: ${err2.message}`, 'error');
        toast('Cannot access microphone/camera. Check browser permissions.');
      }
    }
  });

  dom.btnToggleAudio.addEventListener('click', () => {
    if (!session) return;
    const enabled = session.toggleAudio();
    updateMediaButtons(enabled, null);
  });

  dom.btnToggleVideo.addEventListener('click', () => {
    if (!session) return;
    const enabled = session.toggleVideo();
    updateMediaButtons(null, enabled);
  });

  dom.btnScreenShare.addEventListener('click', async () => {
    if (!session) return;
    if (session.isScreenSharing()) {
      session.stopScreenShare();
      // Restore local video to camera
      const ls = session.getLocalStream();
      if (ls) dom.localVideo.srcObject = ls;
      dom.btnScreenShare.textContent = '🖥️ Screen';
      dom.btnScreenShare.classList.remove('btn--screensharing');
      toast('Screen sharing stopped.');
    } else {
      try {
        const screenStream = await session.startScreenShare();
        dom.localVideo.srcObject = screenStream;
        dom.btnScreenShare.textContent = '🖥️ Stop Share';
        dom.btnScreenShare.classList.add('btn--screensharing');
        // Auto-restore when track ends via browser stop button
        screenStream.getVideoTracks()[0].onended = () => {
          const ls = session.getLocalStream();
          if (ls) dom.localVideo.srcObject = ls;
          dom.btnScreenShare.textContent = '🖥️ Screen';
          dom.btnScreenShare.classList.remove('btn--screensharing');
          toast('Screen sharing ended.');
        };
      } catch (err) {
        appendLog(`Screen share failed: ${err.message}`, 'error');
        toast('Screen share cancelled or failed.');
      }
    }
  });

  dom.btnEndCall.addEventListener('click', () => {
    endMediaCall();
    toast('Call ended.');
  });

  function endMediaCall() {
    if (session) session.removeMedia();
    dom.localVideo.srcObject  = null;
    dom.remoteVideo.srcObject = null;
    show(dom.remoteNoVideo);
    mediaActive = false;
    dom.btnStartCall.disabled   = false;
    dom.btnToggleAudio.disabled = true;
    dom.btnToggleVideo.disabled = true;
    dom.btnScreenShare.disabled = true;
    dom.btnEndCall.disabled     = true;
    dom.btnToggleAudio.textContent = '🎤 Mic On';
    dom.btnToggleVideo.textContent = '📷 Cam On';
    dom.btnScreenShare.textContent = '🖥️ Screen';
    dom.btnToggleAudio.className = 'btn btn--secondary';
    dom.btnToggleVideo.className = 'btn btn--secondary';
    dom.btnScreenShare.classList.remove('btn--screensharing');
  }

  function updateMediaButtons(audioEnabled, videoEnabled) {
    if (audioEnabled !== null && audioEnabled !== undefined) {
      dom.btnToggleAudio.textContent = audioEnabled ? '🎤 Mic On' : '🎤 Mic Off';
      dom.btnToggleAudio.className = audioEnabled
        ? 'btn btn--secondary btn--active-mic'
        : 'btn btn--secondary btn--muted-mic';
    }
    if (videoEnabled !== null && videoEnabled !== undefined) {
      dom.btnToggleVideo.textContent = videoEnabled ? '📷 Cam On' : '📷 Cam Off';
      dom.btnToggleVideo.className = videoEnabled
        ? 'btn btn--secondary btn--active-cam'
        : 'btn btn--secondary btn--muted-cam';
    }
  }

  // ── RETRY ────────────────────────────────────────────────────
  dom.btnRetry.addEventListener('click', () => {
    hide(dom.retryBar);
    if (session) session.close();
    // Reset to role chooser
    resetUI();
    toast('Session reset. Start a new session.');
  });

  dom.btnSuggestTurn.addEventListener('click', () => {
    hide(dom.retryBar);
    dom.turnPanel.setAttribute('open', '');
    dom.turnUrl.focus();
    toast('Configure a TURN server, then start a new session.');
    if (session) session.close();
    resetUI();
  });

  function resetUI() {
    show(dom.roleChooser);
    hide(dom.flowCreate);
    hide(dom.flowJoin);
    hide(dom.iceSection);
    hide(dom.chatSection);
    hide(dom.mediaSection);
    dom.offerOut.value = '';
    dom.answerIn.value = '';
    dom.offerIn.value = '';
    dom.answerOut.value = '';
    dom.iceOut.value = '';
    dom.iceIn.value = '';
    dom.btnCopyOffer.disabled = true;
    dom.btnCopyAnswer.disabled = true;
    disableChat();
    endMediaCall();
    dom.chatLog.innerHTML = '';
    setBadge('idle', 'Idle');
    session = null;
    role = null;
  }

  // ── ICE wait helper ──────────────────────────────────────────
  function waitForIceOrTimeout(ms) {
    return new Promise((resolve) => {
      if (session.isIceComplete()) { resolve(); return; }
      const timer = setTimeout(resolve, ms);
      // Also resolve early if ICE completes
      const check = setInterval(() => {
        if (session.isIceComplete()) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  // ── Init ─────────────────────────────────────────────────────
  appendLog('App initialised — ready to create or join a session');
  setBadge('idle', 'Idle');

})();
