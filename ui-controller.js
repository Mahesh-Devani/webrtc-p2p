/**
 * ui-controller.js — Wires DOM elements to PeerSession + TokenCodec.
 *
 * Orchestrates the full user flow:
 *   role selection → token exchange → ICE management → chat.
 */

'use strict';

import { TokenCodec } from './token-codec.js';
import { PeerSession } from './webrtc-core.js';

(() => {
  // ── DOM refs ──────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    badge: $('#connection-badge'),
    badgeLabel: $('#connection-label'),

    // TURN
    turnUrl: $('#turn-url'),
    turnUser: $('#turn-user'),
    turnCred: $('#turn-cred'),
    btnSaveTurn: $('#btn-save-turn'),
    turnPanel: $('#turn-panel'),

    // Role
    roleChooser: $('#role-chooser'),
    btnCreate: $('#btn-create'),
    btnJoin: $('#btn-join'),

    // Create flow
    flowCreate: $('#flow-create'),
    offerOut: $('#offer-out'),
    qrOfferOut: $('#qr-offer-out'),
    btnCopyOffer: $('#btn-copy-offer'),
    btnCopyOfferQr: $('#btn-copy-offer-qr'),
    btnShareOfferQr: $('#btn-share-offer-qr'),
    answerIn: $('#answer-in'),
    btnScanAnswer: $('#btn-scan-answer'),
    importAnswer: $('#import-answer'),
    btnAcceptAnswer: $('#btn-accept-answer'),

    // Join flow
    flowJoin: $('#flow-join'),
    offerIn: $('#offer-in'),
    btnScanOffer: $('#btn-scan-offer'),
    importOffer: $('#import-offer'),
    btnAcceptOffer: $('#btn-accept-offer'),
    answerOut: $('#answer-out'),
    qrAnswerOut: $('#qr-answer-out'),
    btnCopyAnswer: $('#btn-copy-answer'),
    btnCopyAnswerQr: $('#btn-copy-answer-qr'),
    btnShareAnswerQr: $('#btn-share-answer-qr'),

    // Inspect
    btnInspectOffer: $('#btn-inspect-offer'),
    btnInspectAnswer: $('#btn-inspect-answer'),
    inspectModal: $('#inspect-modal'),
    btnCloseInspect: $('#btn-close-inspect'),
    inspectType: $('#inspect-type'),
    inspectVersion: $('#inspect-version'),
    inspectTs: $('#inspect-ts'),
    inspectIceCount: $('#inspect-ice-count'),
    inspectSdp: $('#inspect-sdp'),
    inspectCandidates: $('#inspect-candidates'),

    // QR Scanner
    qrModal: $('#qr-modal'),
    btnCloseScanner: $('#btn-close-scanner'),

    // ICE
    iceSection: $('#ice-section'),
    iceOut: $('#ice-out'),
    btnCopyIce: $('#btn-copy-ice'),
    iceIn: $('#ice-in'),
    btnImportIce: $('#btn-import-ice'),

    // Chat & Files
    chatSection: $('#chat-section'),
    chatLog: $('#chat-log'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    btnSend: $('#btn-send'),
    fileInput: $('#file-input'),
    fileProgress: $('#file-progress'),
    fileProgressLabel: $('#file-progress-label'),
    fileProgressBar: $('#file-progress-bar'),

    // Media
    mediaSection: $('#media-section'),
    localVideo: $('#local-video'),
    remoteVideo: $('#remote-video'),
    remoteNoVideo: $('#remote-no-video'),
    btnStartCall: $('#btn-start-call'),
    btnToggleAudio: $('#btn-toggle-audio'),
    btnToggleVideo: $('#btn-toggle-video'),
    btnScreenShare: $('#btn-screenshare'),
    btnEndCall: $('#btn-end-call'),
    deviceControls: $('#device-controls'),
    cameraSelect: $('#camera-select'),
    speakerSelect: $('#speaker-select'),

    // Log
    logPanel: $('#log-panel'),
    logBody: $('#log-body'),
    btnCopyLog: $('#btn-copy-log'),

    // Retry
    retryBar: $('#retry-bar'),
    retryMsg: $('#retry-msg'),
    btnRetry: $('#btn-retry'),
    btnSuggestTurn: $('#btn-suggest-turn'),
  };

  // ── State ────────────────────────────────────────────────────
  let session = null;
  let role = null;   // 'creator' | 'joiner'
  let turnConfig = null;   // { urls, username, credential } | null
  let connState = 'idle';
  let iceExported = false;
  let messageIdCounter = 0;
  let mediaActive = false;

  // ── Helpers ──────────────────────────────────────────────────
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
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
        urls: turnConfig.urls,
        username: turnConfig.username,
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
      onFileProgress: (pct, dir) => {
        show(dom.fileProgress);
        dom.fileProgressLabel.textContent = dir === 'sending' ? 'Sending file...' : 'Receiving file...';
        dom.fileProgressBar.value = pct;
        if (pct >= 100) {
          setTimeout(() => hide(dom.fileProgress), 1000);
        }
      },
      onFileReceived: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.textContent = `Download: ${filename}`;
        a.className = 'btn btn--secondary';
        a.style.display = 'inline-block';
        a.style.marginTop = '4px';

        const msg = document.createElement('div');
        msg.className = `chat-msg chat-msg--peer`;
        msg.innerHTML = `<div>Received file: <strong>${escapeHtml(filename)}</strong></div>`;
        msg.appendChild(a);

        dom.chatLog.appendChild(msg);
        dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
        systemMsg(`File received: ${filename}`);
      },
      onRemoteStream: (stream) => {
        dom.remoteVideo.srcObject = stream;
        // Explicit play() to handle Chrome autoplay policy for unmuted media
        dom.remoteVideo.play().catch((err) => {
          appendLog(`Remote video autoplay blocked: ${err.message} — click anywhere to resume`, 'warn');
          // One-time click handler to resume playback
          const resume = () => {
            dom.remoteVideo.play().catch(() => { });
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
  async function refreshIceOutput() {
    const candidates = session.getLocalCandidates();
    if (candidates.length === 0) return;
    const token = await TokenCodec.encode('ice', null, candidates);
    dom.iceOut.value = token;
    show(dom.iceSection);
  }

  // ── Chat enable / disable ───────────────────────────────────
  function enableChat() {
    show(dom.chatSection);
    dom.chatInput.disabled = false;
    dom.btnSend.disabled = false;
    dom.fileInput.disabled = false;
    dom.chatInput.focus();
  }

  function disableChat() {
    dom.chatInput.disabled = true;
    dom.btnSend.disabled = true;
    dom.fileInput.disabled = true;
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
    const url = dom.turnUrl.value.trim();
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

  // Copy Log
  dom.btnCopyLog.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent panel toggle
    copyText(dom.logBody.innerText, 'Connection Log');
  });

  // ── QR SCANNER ───────────────────────────────────────────────
  let html5QrcodeScanner = null;

  // ── QR SCANNER (CAMERA) ──────────────────────────────────────
  let scannerStream = null;
  let scannerAnimFrame = null;
  let scannerVideo = null;

  function openQrScanner(onSuccess) {
    show(dom.qrModal);

    // Use jsQR for live frame scanning (same decoder that works for paste)
    if (window.jsQR) {
      openJsQrScanner(onSuccess);
      return;
    }

    // Fallback to html5-qrcode (ZXing-based)
    if (!window.Html5Qrcode) {
      toast('Scanner library loading. Try again in a moment.');
      hide(dom.qrModal);
      return;
    }

    if (html5QrcodeScanner) {
      closeQrScanner();
    }

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    const config = {
      fps: 15,
      qrbox: (vw, vh) => {
        const m = Math.min(vw, vh);
        return { width: Math.floor(m * 0.85), height: Math.floor(m * 0.85) };
      },
      aspectRatio: 1.0
    };

    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => { onSuccess(decodedText); closeQrScanner(); },
      () => { }
    ).catch(err => {
      console.error('Failed to start scanner', err);
      toast('Failed to start camera. Need HTTPS/Localhost + permissions.');
      closeQrScanner();
    });
  }

  async function openJsQrScanner(onSuccess) {
    const readerEl = document.getElementById('qr-reader');
    readerEl.innerHTML = ''; // clear previous content

    // Create a <video> element inside the QR reader div
    scannerVideo = document.createElement('video');
    scannerVideo.setAttribute('playsinline', 'true');
    scannerVideo.setAttribute('autoplay', 'true');
    scannerVideo.style.width = '100%';
    scannerVideo.style.maxWidth = '400px';
    scannerVideo.style.borderRadius = 'var(--radius)';
    readerEl.appendChild(scannerVideo);

    // Status indicator
    const statusEl = document.createElement('p');
    statusEl.style.cssText = 'text-align:center; font-size:.82rem; color:#aaa; margin-top:8px;';
    statusEl.textContent = 'Point camera at QR code… (scanning)';
    readerEl.appendChild(statusEl);

    try {
      // Request high resolution — laptop webcams usually support 720p+
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      scannerVideo.srcObject = scannerStream;
      await scannerVideo.play();
    } catch (err) {
      console.error('Camera access failed', err);
      toast('Failed to access camera. Need HTTPS/Localhost + camera permissions.');
      closeQrScanner();
      return;
    }

    // Offscreen canvas for frame extraction
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let frameCount = 0;

    function scanFrame() {
      if (!scannerStream) return; // scanner was closed
      if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA) {
        canvas.width = scannerVideo.videoWidth;
        canvas.height = scannerVideo.videoHeight;
        ctx.drawImage(scannerVideo, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth', // Handle dark mode / screen glare
        });
        frameCount++;
        if (frameCount % 30 === 0) { // Update status every ~1 second
          statusEl.textContent = `Scanning… (${canvas.width}x${canvas.height}, frame ${frameCount})`;
        }
        if (code && code.data) {
          console.log('jsQR live scan detected:', code.data.substring(0, 50) + '...');
          onSuccess(code.data);
          closeQrScanner();
          return;
        }
      }
      scannerAnimFrame = requestAnimationFrame(scanFrame);
    }

    scannerAnimFrame = requestAnimationFrame(scanFrame);
  }

  function closeQrScanner() {
    // Stop jsQR scanner
    if (scannerAnimFrame) {
      cancelAnimationFrame(scannerAnimFrame);
      scannerAnimFrame = null;
    }
    if (scannerStream) {
      scannerStream.getTracks().forEach(t => t.stop());
      scannerStream = null;
    }
    if (scannerVideo) {
      scannerVideo.srcObject = null;
      scannerVideo = null;
    }
    // Stop html5-qrcode scanner
    if (html5QrcodeScanner) {
      if (html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().then(() => {
          html5QrcodeScanner.clear();
          html5QrcodeScanner = null;
        }).catch(err => console.error('Error stopping scanner', err));
      } else {
        try { html5QrcodeScanner.clear(); } catch { }
        html5QrcodeScanner = null;
      }
    }
    // Clean up the reader div
    const readerEl = document.getElementById('qr-reader');
    if (readerEl) readerEl.innerHTML = '';
    hide(dom.qrModal);
  }

  dom.btnCloseScanner.addEventListener('click', closeQrScanner);

  dom.btnScanOffer?.addEventListener('click', () => {
    openQrScanner((text) => {
      dom.offerIn.value = text;
      toast('Invite token scanned successfully!');
    });
  });

  dom.btnScanAnswer?.addEventListener('click', () => {
    openQrScanner((text) => {
      dom.answerIn.value = text;
      toast('Answer token scanned successfully!');
    });
  });

  // ── QR IMAGE COPY / SHARE ───────────────────────────────────────
  async function copyQrImage(canvas, label) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const htmlString = `<img src="${dataUrl}" alt="QR Code">`;
      const htmlBlob = new Blob([htmlString], { type: 'text/html' });

      canvas.toBlob(async (pngBlob) => {
        try {
          const clipboardItem = new ClipboardItem({
            'text/html': htmlBlob,
            'image/png': pngBlob
          });
          await navigator.clipboard.write([clipboardItem]);
          toast(`${label} QR code copied to clipboard! Paste it anywhere (like Teams)`);
        } catch (err) {
          console.error(err);
          // Fallback if writing both types fails
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            toast(`${label} QR code copied to clipboard! (PNG only)`);
          } catch (e) {
            toast('Failed to copy QR image. (Requires HTTPS/Localhost permissions)');
          }
        }
      });
    } catch {
      toast('Failed to generate QR image for copy.');
    }
  }

  async function shareQrImage(canvas, title) {
    if (!navigator.share) {
      toast('Share not supported on this browser.');
      return;
    }
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'qr-code.png', { type: 'image/png' });
      try {
        await navigator.share({
          title: title,
          text: 'Join my P2P Connect session using this QR code or scan it directly.',
          files: [file]
        });
      } catch (err) {
        console.warn('Share intent failed or was cancelled', err);
      }
    });
  }

  dom.btnCopyOfferQr?.addEventListener('click', () => copyQrImage(dom.qrOfferOut, 'Invite'));
  dom.btnShareOfferQr?.addEventListener('click', () => shareQrImage(dom.qrOfferOut, 'P2P Connect Invite'));
  dom.btnCopyAnswerQr?.addEventListener('click', () => copyQrImage(dom.qrAnswerOut, 'Answer'));
  dom.btnShareAnswerQr?.addEventListener('click', () => shareQrImage(dom.qrAnswerOut, 'P2P Connect Answer'));

  // ── TOKEN INSPECTOR ──────────────────────────────────────────
  async function openInspector(tokenStr) {
    if (!tokenStr) { toast('No token to inspect.'); return; }
    try {
      const data = await TokenCodec.decode(tokenStr);
      dom.inspectType.textContent = data.type?.toUpperCase() || 'Unknown';
      dom.inspectVersion.textContent = 'v2 (compressed)';
      dom.inspectTs.textContent = data.ts
        ? new Date(data.ts).toLocaleString()
        : 'N/A';
      dom.inspectIceCount.textContent = `${data.candidates?.length || 0} candidate(s)`;
      dom.inspectSdp.textContent = data.sdp?.sdp || '(no SDP)';
      dom.inspectCandidates.textContent = data.candidates?.length
        ? data.candidates.map((c, i) => `#${i + 1}: ${c.candidate}`).join('\n')
        : '(none)';
      show(dom.inspectModal);
    } catch (err) {
      toast(`Failed to decode token: ${err.message}`);
    }
  }

  dom.btnInspectOffer?.addEventListener('click', () => openInspector(dom.offerOut.value));
  dom.btnInspectAnswer?.addEventListener('click', () => openInspector(dom.answerOut.value));
  dom.btnCloseInspect?.addEventListener('click', () => hide(dom.inspectModal));

  // ── PASTING IMAGES TO DECODE QR ──────────────────────────────
  async function handlePasteEvent(e, textArea) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          scanQrFile(file, textArea);
        }
        break;
      }
    }
  }

  async function scanQrFile(file, textArea) {
    if (!window.Html5Qrcode && !window.jsQR && !('BarcodeDetector' in window)) {
      toast('No QR scanner library available.');
      return;
    }
    toast('Scanning pasted image for QR code...');

    try {
      // Force raw Image decoding to strip weird clipboard MIME types
      const img = new Image();
      const imgUrl = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Draw white background to kill transparent alpha pixels
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(imgUrl);

      // Attempt 1: jsQR (100% reliable for high-density generated canvas pixels)
      if (window.jsQR) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data) {
          textArea.value = code.data;
          toast('QR code decoded successfully from image (jsQR)!');
          return;
        }
      }

      // Attempt 2: Native BarcodeDetector (Chrome/Edge/Android/macOS)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            textArea.value = barcodes[0].rawValue;
            toast('QR code decoded natively from image!');
            return;
          }
        } catch (e) {
          console.warn('Native BarcodeDetector failed', e);
        }
      }

      // Attempt 3: html5-qrcode fallback
      if (!window.Html5Qrcode) {
        toast('Scanner library not loaded and native detector failed to find QR.');
        return;
      }

      const html5QrCode = new Html5Qrcode("hidden-qr-reader");
      try {
        const cleanBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const cleanFile = new File([cleanBlob], 'clipboard-qr.png', { type: 'image/png' });

        const decodedText = await html5QrCode.scanFileV2(cleanFile, true)
          .then(res => res.decodedText)
          .catch(() => html5QrCode.scanFile(cleanFile, true));

        textArea.value = decodedText;
        toast('QR code decoded successfully from image (fallback)!');
      } finally {
        if (typeof html5QrCode.clear === 'function') {
          html5QrCode.clear().catch(e => console.error(e));
        }
      }

    } catch (err) {
      console.warn('QR decode failed completely', err);
      toast('Could not find a valid QR code in the pasted image.');
    }
  }

  dom.offerIn?.addEventListener('paste', (e) => handlePasteEvent(e, dom.offerIn));
  dom.answerIn?.addEventListener('paste', (e) => handlePasteEvent(e, dom.answerIn));

  dom.importOffer?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      scanQrFile(e.target.files[0], dom.offerIn);
      e.target.value = ''; // reset
    }
  });

  dom.importAnswer?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      scanQrFile(e.target.files[0], dom.answerIn);
      e.target.value = ''; // reset
    }
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
      await waitForIceOrTimeout(1500);
      const candidates = session.getLocalCandidates();
      const token = await TokenCodec.encode('offer', offer, candidates);
      dom.offerOut.value = token;
      console.log(`[Token] Offer: ${token.length} chars, ${candidates.length} ICE candidates`);

      // Generate high-resolution QR (800px) so dense tokens don't blur fractional pixels
      if (window.QRCode) {
        QRCode.toCanvas(dom.qrOfferOut, token, { width: 800, margin: 4, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } }, (err) => {
          if (!err) {
            show(dom.qrOfferOut);
            dom.btnCopyOfferQr.disabled = false;
            if (navigator.share) dom.btnShareOfferQr.disabled = false;
          }
        });
      }

      dom.btnCopyOffer.disabled = false;
      dom.btnInspectOffer.disabled = false;
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
      const data = await TokenCodec.decode(raw);
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
      const data = await TokenCodec.decode(raw);
      if (data.type !== 'offer') throw new Error(`Expected offer token, got "${data.type}".`);
      const answer = await session.acceptOffer(data.sdp);
      if (data.candidates.length) {
        await session.addIceCandidates(data.candidates);
      }
      // Wait briefly for some ICE candidates
      await waitForIceOrTimeout(1500);
      const candidates = session.getLocalCandidates();
      const token = await TokenCodec.encode('answer', answer, candidates);
      dom.answerOut.value = token;
      console.log(`[Token] Answer: ${token.length} chars, ${candidates.length} ICE candidates`);

      // Generate high-resolution QR
      if (window.QRCode) {
        QRCode.toCanvas(dom.qrAnswerOut, token, { width: 800, margin: 4, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } }, (err) => {
          if (!err) {
            show(dom.qrAnswerOut);
            dom.btnCopyAnswerQr.disabled = false;
            if (navigator.share) dom.btnShareAnswerQr.disabled = false;
          }
        });
      }

      dom.btnCopyAnswer.disabled = false;
      dom.btnInspectAnswer.disabled = false;
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
      const data = await TokenCodec.decode(raw);
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

  dom.fileInput.addEventListener('change', async (e) => {
    if (!session) return;
    const file = e.target.files[0];
    if (!file) return;

    // reset input
    e.target.value = '';

    try {
      appendChat(`Sending file: ${file.name}...`, 'self');
      dom.fileInput.disabled = true;
      await session.sendFile(file);
      appendChat(`File sent completely: ${file.name}`, 'self', 'Delivered ✓');
    } catch (err) {
      appendLog(`File send error: ${err.message}`, 'error');
      toast('Failed to send file. See log.');
    } finally {
      dom.fileInput.disabled = false;
    }
  });

  // ── MEDIA CALL CONTROLS ──────────────────────────────────────

  // Video double-click controls
  function handleVideoDblClick(videoEl) {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    } else if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => { });
    } else {
      // Try fullscreen first, fallback to PiP
      if (videoEl.requestFullscreen) {
        videoEl.requestFullscreen().catch(() => {
          if (videoEl.requestPictureInPicture) videoEl.requestPictureInPicture().catch(() => { });
        });
      } else if (videoEl.requestPictureInPicture) {
        videoEl.requestPictureInPicture().catch(() => { });
      }
    }
  }

  dom.localVideo.addEventListener('dblclick', () => handleVideoDblClick(dom.localVideo));
  dom.remoteVideo.addEventListener('dblclick', () => handleVideoDblClick(dom.remoteVideo));

  dom.btnStartCall.addEventListener('click', async () => {
    if (!session) { toast('No active session.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      session.addLocalStream(stream);
      dom.localVideo.srcObject = stream;
      mediaActive = true;
      dom.btnStartCall.disabled = true;
      dom.btnToggleAudio.disabled = false;
      dom.btnToggleVideo.disabled = false;
      dom.btnScreenShare.disabled = false;
      dom.btnEndCall.disabled = false;
      updateMediaButtons(true, true);
      appendLog('Local media started (audio + video)', 'success');
      systemMsg('Audio/video call started.');
      show(dom.deviceControls);
      await populateDevices();
    } catch (err) {
      // Try audio-only fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        session.addLocalStream(stream);
        dom.localVideo.srcObject = stream;
        mediaActive = true;
        dom.btnStartCall.disabled = true;
        dom.btnToggleAudio.disabled = false;
        dom.btnToggleVideo.disabled = true;
        dom.btnScreenShare.disabled = false;
        dom.btnEndCall.disabled = false;
        updateMediaButtons(true, false);
        appendLog('Camera unavailable — audio-only call started', 'warn');
        systemMsg('Audio-only call started (camera not available).');
        show(dom.deviceControls);
        await populateDevices();
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
    dom.localVideo.srcObject = null;
    dom.remoteVideo.srcObject = null;
    show(dom.remoteNoVideo);
    mediaActive = false;
    dom.btnStartCall.disabled = false;
    dom.btnToggleAudio.disabled = true;
    dom.btnToggleVideo.disabled = true;
    dom.btnScreenShare.disabled = true;
    dom.btnEndCall.disabled = true;
    dom.btnToggleAudio.textContent = '🎤 Mic On';
    dom.btnToggleVideo.textContent = '📷 Cam On';
    dom.btnScreenShare.textContent = '🖥️ Screen';
    dom.btnToggleAudio.className = 'btn btn--secondary';
    dom.btnToggleVideo.className = 'btn btn--secondary';
    dom.btnScreenShare.classList.remove('btn--screensharing');
    hide(dom.deviceControls);
  }

  // ── DEVICE SWITCHING (Mobile/Desktop) ────────────────────────
  async function populateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const audioOutputDevices = devices.filter(d => d.kind === 'audiooutput');

      dom.cameraSelect.innerHTML = '';
      if (videoDevices.length > 0) {
        videoDevices.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          const stream = session?.getLocalStream();
          const currentDeviceId = stream && stream.getVideoTracks()[0]?.getSettings().deviceId;
          if (currentDeviceId === device.deviceId) {
            option.selected = true;
          }
          option.text = device.label || `Camera ${index + 1}`;
          dom.cameraSelect.appendChild(option);
        });
        dom.cameraSelect.disabled = false;
      } else {
        dom.cameraSelect.innerHTML = '<option value="">No Camera Found</option>';
        dom.cameraSelect.disabled = true;
      }

      dom.speakerSelect.innerHTML = '';
      if (audioOutputDevices.length > 0 && typeof dom.remoteVideo.setSinkId !== 'undefined') {
        audioOutputDevices.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          if (dom.remoteVideo.sinkId === device.deviceId) {
            option.selected = true;
          }
          option.text = device.label || `Speaker ${index + 1}`;
          dom.speakerSelect.appendChild(option);
        });
        dom.speakerSelect.disabled = false;
      } else {
        dom.speakerSelect.innerHTML = '<option value="">System Default (Auto)</option>';
        dom.speakerSelect.disabled = true; // Not supported on Safari/Firefox Desktop without flags
      }
    } catch (err) {
      console.warn('Could not enumerate devices', err);
    }
  }

  dom.cameraSelect.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    const currentStream = session?.getLocalStream();
    if (!deviceId || !currentStream || session?.isScreenSharing()) return;

    dom.cameraSelect.disabled = true;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Tell peer connection to swap track
      await session.replaceVideoTrack(newVideoTrack);

      // Swap track correctly in Local Stream
      const oldVideoTrack = currentStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        currentStream.removeTrack(oldVideoTrack);
      }
      currentStream.addTrack(newVideoTrack);

      dom.localVideo.srcObject = currentStream;
      toast('Camera switched!');
      appendLog('Camera track hot-swapped');
    } catch (err) {
      toast('Failed to jump to selected camera');
      console.error('Camera switch error', err);
    } finally {
      dom.cameraSelect.disabled = false;
    }
  });

  dom.speakerSelect.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    if (typeof dom.remoteVideo.setSinkId !== 'undefined') {
      try {
        await dom.remoteVideo.setSinkId(deviceId);
        toast('Speaker output changed!');
      } catch (err) {
        toast('Error setting audio output device');
        console.error('Speaker device swap error', err);
      }
    }
  });

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
    dom.btnCopyOfferQr.disabled = true;
    dom.btnShareOfferQr.disabled = true;
    dom.btnCopyAnswer.disabled = true;
    dom.btnCopyAnswerQr.disabled = true;
    dom.btnShareAnswerQr.disabled = true;
    hide(dom.qrOfferOut);
    hide(dom.qrAnswerOut);
    hide(dom.deviceControls);
    dom.cameraSelect.innerHTML = '<option value="">Default Camera</option>';
    dom.speakerSelect.innerHTML = '<option value="">Default Speaker</option>';
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
