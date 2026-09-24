/**
 * webrtc-core.js — Peer connection lifecycle, DataChannel, ICE management.
 *
 * Exposes a single factory: PeerSession.create(config)
 * All callbacks are optional; the caller (UI controller) wires them up.
 */

'use strict';

export const PeerSession = (() => {

  // ── Default ICE servers (STUN) ───────────────────────────────
  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com:3478' },
  ];

  /**
   * @typedef {Object} SessionConfig
   * @property {RTCIceServer[]}   [iceServers]
   * @property {function(string,string=):void} [onLog]        – (msg, level)
   * @property {function(string):void}          [onStateChange] – connection state label
   * @property {function(RTCIceCandidate):void} [onIceCandidate]
   * @property {function(RTCIceCandidateErrorEvent):void} [onIceCandidateError]
   * @property {function():void}                [onIceComplete]
   * @property {function():void}                [onChannelOpen]
   * @property {function():void}                [onChannelClose]
   * @property {function(string):void}          [onMessage]
   * @property {function(File|Blob, string, Object=):void} [onFileReceived] - (blob, filename, meta)
   * @property {function(number, string, Object=):void}  [onFileProgress]   - (pct, dir, fileInfo)
   * @property {function(string):void}                  [onFileAbort]      - (filename)
   * @property {function(string):void}          [onError]
   * @property {function(MediaStream):void}     [onRemoteStream] – remote media stream
   * @property {function():void}                [onRemoteStreamEnded]
   */

  /**
   * Create a new PeerSession.
   * @param {SessionConfig} cfg
   */
  function create(cfg = {}) {
    const iceServers = cfg.iceServers && cfg.iceServers.length ? cfg.iceServers : DEFAULT_ICE_SERVERS;
    const log = cfg.onLog || (() => { });
    const stateChange = cfg.onStateChange || (() => { });
    const onError = cfg.onError || (() => { });

    /** @type {RTCIceCandidate[]} */
    const localCandidates = [];
    /** @type {RTCIceCandidate[]} candidates gathered during renegotiation while DC is closed */
    const pendingIceCandidates = [];
    let iceComplete = false;

    // ── Create RTCPeerConnection ───────────────────────────────
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
    });

    /** @type {RTCDataChannel|null} */
    let dcSig = null;
    /** @type {RTCDataChannel|null} */
    let dcChat = null;
    /** @type {RTCDataChannel|null} */
    let dcFiles = null;

    /** @type {MediaStream|null} */
    let localStream = null;
    /** @type {MediaStream|null} */
    let screenStream = null;
    /** @type {Map<string,RTCRtpSender>} track kind → sender */
    const senders = new Map();
    /** @type {MediaStream} assembled remote stream */
    const remoteStream = new MediaStream();

    // ── Renegotiation state (perfect negotiation pattern) ──────
    let isPolite = false;  // set in createOffer / acceptOffer
    let makingOffer = false;
    let ignoreOffer = false;
    let initialSignalingDone = false; // true only after DC opens (initial manual exchange complete)

    // ── ICE handling ───────────────────────────────────────────
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        localCandidates.push(e.candidate);
        log(`ICE candidate gathered: ${e.candidate.candidate.split(' ')[7] || 'unknown'} (${e.candidate.type || ''})`);
        if (cfg.onIceCandidate) cfg.onIceCandidate(e.candidate);
        
        // Forward via Signaling DataChannel when open (renegotiation ICE)
        if (dcSig && dcSig.readyState === 'open') {
          try {
            dcSig.send(JSON.stringify({
              _sig: 'ice',
              candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }
            }));
          } catch { }
        } else if (initialSignalingDone) {
          // If connection is established but DC is temporarily closed/connecting, queue it
          pendingIceCandidates.push(e.candidate);
        }
      }
    };

    pc.onicecandidateerror = (e) => {
      log(`ICE candidate error (${e.url || 'local'}): code ${e.errorCode} ${e.errorText || ''}`, 'warn');
      if (cfg.onIceCandidateError) cfg.onIceCandidateError(e);
    };

    pc.onicegatheringstatechange = () => {
      log(`ICE gathering: ${pc.iceGatheringState}`);
      if (pc.iceGatheringState === 'complete') {
        iceComplete = true;
        if (cfg.onIceComplete) cfg.onIceComplete();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log(`ICE connection: ${state}`, state === 'failed' ? 'error' : undefined);
      mapState();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      log(`Peer connection: ${state}`, state === 'failed' ? 'error' : undefined);
      mapState();
    };

    pc.onsignalingstatechange = () => {
      log(`Signaling state: ${pc.signalingState}`);
    };

    function mapState() {
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      if (conn === 'connected' || ice === 'connected') {
        stateChange('connected');
      } else if (conn === 'failed' || ice === 'failed') {
        stateChange('failed');
      } else if (conn === 'disconnected' || ice === 'disconnected') {
        stateChange('disconnected');
      } else if (conn === 'connecting' || ice === 'checking') {
        stateChange('connecting');
      } else if (conn === 'closed' || ice === 'closed') {
        stateChange('closed');
      }
    }

    // ── Internal signaling over DataChannel ────────────────────
    async function handleDcSignaling(data) {
      try {
        if (data._sig === 'offer') {
          const offerCollision = makingOffer || pc.signalingState !== 'stable';
          ignoreOffer = !isPolite && offerCollision;
          if (ignoreOffer) {
            log('Ignoring colliding offer (impolite peer)');
            return;
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (dcSig && dcSig.readyState === 'open') {
            dcSig.send(JSON.stringify({ _sig: 'answer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
          }
          log('Renegotiation: answered remote offer via DataChannel');
        } else if (data._sig === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          log('Renegotiation: accepted remote answer via DataChannel');
        } else if (data._sig === 'ice') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            log(`Renegotiation ICE add failed: ${err.message}`, 'warn');
          }
        } else if (data._sig === 'call_ended') {
          // Graceful call teardown from peer
          if (cfg.onCallEnded) cfg.onCallEnded();
        } else if (data._sig === 'ping') {
          // In-band keepalive ping — reply with pong
          if (dcSig && dcSig.readyState === 'open') {
            try {
              dcSig.send(JSON.stringify({ _sig: 'pong', ts: data.ts }));
            } catch { }
          }
        } else if (data._sig === 'pong') {
          log(`Keepalive pong received (${Date.now() - (data.ts || 0)}ms)`);
        }
      } catch (err) {
        log(`Renegotiation signaling error: ${err.message}`, 'error');
      }
    }

    function sendCallEnded() {
      if (dcSig && dcSig.readyState === 'open') {
        dcSig.send(JSON.stringify({ _sig: 'call_ended' }));
        return true;
      }
      return false;
    }

    function sendPing() {
      if (dcSig && dcSig.readyState === 'open') {
        try {
          dcSig.send(JSON.stringify({ _sig: 'ping', ts: Date.now() }));
          return true;
        } catch { }
      }
      return false;
    }

    // ── Negotiation needed (fires when tracks are added/removed) ─
    pc.onnegotiationneeded = async () => {
      // Suppress during manual signaling phase — only auto-renegotiate
      // after the initial manual offer/answer exchange is complete
      if (!initialSignalingDone) {
        log('Negotiation needed — deferred (initial manual signaling in progress)');
        return;
      }
      if (!dcSig || dcSig.readyState !== 'open') {
        log('Negotiation needed but Signaling DataChannel not open — retrying soon…');
        setTimeout(() => {
          if (pc.signalingState !== 'closed') pc.onnegotiationneeded();
        }, 500);
        return;
      }
      try {
        makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') {
          log('Renegotiation aborted — signaling state changed during offer creation');
          return;
        }
        await pc.setLocalDescription(offer);
        if (dcSig && dcSig.readyState === 'open') {
          dcSig.send(JSON.stringify({ _sig: 'offer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
        }
        log('Renegotiation: sent offer via DataChannel');
      } catch (err) {
        log(`Renegotiation offer failed: ${err.message}`, 'error');
      } finally {
        makingOffer = false;
      }
    };

    // ── File Transfer State ──
    let incomingFileChunks = [];
    let incomingFileMeta = null;
    let incomingFileBytesReceived = 0;
    let fileSendQueue = Promise.resolve();

    // ── DataChannel wiring helper ──────────────────────────────
    function wireChannel(channel) {
      if (channel.label === 'p2p-sig') {
        dcSig = channel;
        dcSig.onopen = () => {
          initialSignalingDone = true;
          log('Signaling DataChannel open — auto-renegotiation enabled', 'success');
          
          // Flush pending ICE candidates
          while (pendingIceCandidates.length > 0) {
            const c = pendingIceCandidates.shift();
            try {
              dcSig.send(JSON.stringify({
                _sig: 'ice',
                candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }
              }));
            } catch { }
          }
        };
        dcSig.onclose = () => log('Signaling DataChannel closed');
        dcSig.onerror = (err) => log(`Signaling DC error: ${err.error?.message || err}`, 'error');
        dcSig.onmessage = (e) => {
          if (typeof e.data === 'string') {
            try {
              const parsed = JSON.parse(e.data);
              if (parsed._sig) handleDcSignaling(parsed);
            } catch { }
          }
        };
      } else if (channel.label === 'p2p-chat') {
        dcChat = channel;
        dcChat.onopen = () => {
          log('Chat DataChannel open', 'success');
          if (cfg.onChannelOpen) cfg.onChannelOpen();
        };
        dcChat.onclose = () => {
          log('Chat DataChannel closed');
          if (cfg.onChannelClose) cfg.onChannelClose();
        };
        dcChat.onerror = (err) => {
          onError(`Chat DataChannel error: ${err.error?.message || err}`);
        };
        dcChat.onmessage = (e) => {
          if (cfg.onMessage) cfg.onMessage(e.data);
        };
      } else if (channel.label === 'p2p-files') {
        dcFiles = channel;
        dcFiles.binaryType = 'arraybuffer';
        dcFiles.onopen = () => log('Files DataChannel open', 'success');
        dcFiles.onclose = () => log('Files DataChannel closed');
        dcFiles.onmessage = (e) => {
          if (typeof e.data === 'string') {
            try {
              const meta = JSON.parse(e.data);
              if (meta._fileStart) {
                // If a previous file never completed (e.g. sender error), clean up partial chunks
                if (incomingFileMeta) {
                  log(`Previous file incomplete (${incomingFileMeta.name}), resetting for new file: ${meta.name}`, 'warn');
                }
                incomingFileMeta = meta;
                incomingFileChunks = [];
                incomingFileBytesReceived = 0;
                log(`Incoming file started: ${meta.name} (${meta.size} bytes)`);
                if (cfg.onFileProgress) {
                  cfg.onFileProgress(0, 'receiving', {
                    fileName: meta.name,
                    size: meta.size,
                    fileIndex: meta.fileIndex,
                    totalFiles: meta.totalFiles
                  });
                }
              } else if (meta._fileAbort) {
                log(`Incoming file aborted: ${meta.name}`, 'warn');
                incomingFileMeta = null;
                incomingFileChunks = [];
                incomingFileBytesReceived = 0;
                if (cfg.onFileAbort) cfg.onFileAbort(meta.name);
              } else if (meta._fileEnd) {
                if (!incomingFileMeta) return;
                const blob = new Blob(incomingFileChunks, { type: incomingFileMeta.type });
                log(`Incoming file complete: ${incomingFileMeta.name}`);
                if (cfg.onFileReceived) cfg.onFileReceived(blob, incomingFileMeta.name, incomingFileMeta);
                incomingFileMeta = null;
                incomingFileChunks = [];
                incomingFileBytesReceived = 0;
              }
            } catch { }
          } else {
            // Binary chunk
            if (!incomingFileMeta) return;
            incomingFileChunks.push(e.data);
            incomingFileBytesReceived += e.data.byteLength;
            if (cfg.onFileProgress) {
              const pct = incomingFileMeta.size === 0 ? 100 : Math.round((incomingFileBytesReceived / incomingFileMeta.size) * 100);
              cfg.onFileProgress(pct, 'receiving', {
                fileName: incomingFileMeta.name,
                size: incomingFileMeta.size,
                fileIndex: incomingFileMeta.fileIndex,
                totalFiles: incomingFileMeta.totalFiles
              });
            }
          }
        };
      }
    }

    // Answerer receives DataChannels from offerer
    pc.ondatachannel = (e) => {
      log(`Remote DataChannel received: ${e.channel.label}`);
      wireChannel(e.channel);
    };

    // ── Remote media tracks ────────────────────────────────────
    pc.ontrack = (e) => {
      log(`Remote track received: ${e.track.kind}`);

      // Crucial fix: Clean up any existing tracks of the same kind (e.g. dead tracks from a previous call)
      const existingTracks = remoteStream.getTracks().filter(t => t.kind === e.track.kind);
      for (const t of existingTracks) {
        remoteStream.removeTrack(t);
      }

      remoteStream.addTrack(e.track);
      if (cfg.onRemoteStream) cfg.onRemoteStream(remoteStream);
      e.track.onended = () => {
        remoteStream.removeTrack(e.track);
        log(`Remote track ended: ${e.track.kind}`);
        if (remoteStream.getTracks().length === 0 && cfg.onRemoteStreamEnded) {
          cfg.onRemoteStreamEnded();
        }
      };
      e.track.onmute = () => log(`Remote ${e.track.kind} muted`);
      e.track.onunmute = () => log(`Remote ${e.track.kind} unmuted`);
    };

    // ── Public API ──────────────────────────────────── ─────────

    /**
     * Add local media stream (audio/video) and send tracks to remote.
     * If tracks already exist, replaces them (renegotiation‑free via replaceTrack).
     * @param {MediaStream} stream
     */
    function addLocalStream(stream) {
      localStream = stream;
      for (const track of stream.getTracks()) {
        const existingSender = senders.get(track.kind);
        if (existingSender) {
          existingSender.replaceTrack(track);
          log(`Replaced local ${track.kind} track`);
        } else {
          const sender = pc.addTrack(track, stream);
          senders.set(track.kind, sender);
          log(`Added local ${track.kind} track`);
        }
      }
    }

    /**
     * Stop and remove all local media tracks.
     */
    function removeMedia() {
      if (localStream) {
        for (const track of localStream.getTracks()) {
          track.stop();
        }
        localStream = null;
      }
      if (screenStream) {
        for (const track of screenStream.getTracks()) {
          track.stop();
        }
        screenStream = null;
      }
      for (const [kind, sender] of senders) {
        try { pc.removeTrack(sender); } catch { }
      }
      senders.clear();
      log('All local media removed');
    }

    /**
     * Toggle local audio track (mute/unmute).
     * @returns {boolean} new enabled state
     */
    function toggleAudio() {
      const sender = senders.get('audio');
      const track = (sender && sender.track) ? sender.track : (localStream ? localStream.getAudioTracks()[0] : null);
      if (!track) return false;
      track.enabled = !track.enabled;
      log(`Audio ${track.enabled ? 'unmuted' : 'muted'}`);
      return track.enabled;
    }

    /**
     * Toggle local video track (enable/disable).
     * @returns {boolean} new enabled state
     */
    function toggleVideo() {
      const sender = senders.get('video');
      const track = (sender && sender.track) ? sender.track : (localStream ? localStream.getVideoTracks()[0] : null);
      if (!track) return false;
      track.enabled = !track.enabled;
      log(`Video ${track.enabled ? 'enabled' : 'disabled'}`);
      return track.enabled;
    }

    /**
     * Replace video track with screen capture (screen share).
     * @returns {Promise<MediaStream>}
     */
    async function startScreenShare() {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStream = stream;
      const screenTrack = stream.getVideoTracks()[0];
      const videoSender = senders.get('video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        log('Screen share started (replaced camera track)');
      } else {
        const sender = pc.addTrack(screenTrack, stream);
        senders.set('video', sender);
        log('Screen share started (new video track)');
      }
      // When user stops sharing via browser UI
      screenTrack.onended = () => {
        stopScreenShare();
      };
      return stream;
    }

    /**
     * Stop screen sharing and restore camera track if available.
     */
    async function stopScreenShare() {
      if (screenStream) {
        for (const t of screenStream.getTracks()) t.stop();
        screenStream = null;
      }
      // restore camera
      const videoSender = senders.get('video');
      if (videoSender) {
        const camTrack = localStream ? localStream.getVideoTracks()[0] : null;
        if (camTrack) {
          await videoSender.replaceTrack(camTrack);
          log('Camera restored after screen share');
        } else {
          // No camera track to restore - replace with null to stop transmission
          await videoSender.replaceTrack(null);
          log('Screen share stopped (no camera to restore)');
        }
      } else {
        log('Screen share ended');
      }
    }

    /**
     * Replaces the running video track (used for camera switching).
     * @param {MediaStreamTrack} newTrack
     */
    async function replaceVideoTrack(newTrack) {
      const videoSender = senders.get('video');
      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
        log('Camera track replaced on connection');
      } else if (localStream) {
        const sender = pc.addTrack(newTrack, localStream);
        senders.set('video', sender);
        log('Camera track added mid-call (upgrade from audio-only)');
      }
    }

    /** @returns {MediaStream|null} */
    function getLocalStream() { return localStream; }

    /** @returns {MediaStream} */
    function getRemoteStream() { return remoteStream; }

    /** @returns {boolean} */
    function isScreenSharing() { return !!screenStream; }

    /**
     * Create an offer (caller / session creator).
     * Creates a DataChannel and returns the local SDP offer.
     * @returns {Promise<RTCSessionDescription>}
     */
    async function createOffer() {
      isPolite = false; // creator is the impolite peer

      const sigChannel = pc.createDataChannel('p2p-sig', { negotiated: false });
      wireChannel(sigChannel);

      const chatChannel = pc.createDataChannel('p2p-chat', { negotiated: false, ordered: true });
      wireChannel(chatChannel);

      const fileChannel = pc.createDataChannel('p2p-files', { negotiated: false, ordered: true });
      wireChannel(fileChannel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log(`Local offer created (signaling state: ${pc.signalingState})`);
      if (pc.signalingState !== 'have-local-offer') {
        log(`WARNING: Expected have-local-offer but got ${pc.signalingState}`, 'error');
      }
      stateChange('gathering');
      return pc.localDescription;
    }

    /**
     * Accept a remote offer and produce an answer (joiner).
     * @param {RTCSessionDescriptionInit} offerSdp
     * @returns {Promise<RTCSessionDescription>}
     */
    async function acceptOffer(offerSdp) {
      isPolite = true; // joiner is the polite peer
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      log('Remote offer accepted');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log('Local answer created');
      stateChange('gathering');
      return pc.localDescription;
    }

    /**
     * Accept a remote answer (caller, after receiving answer back).
     * @param {RTCSessionDescriptionInit} answerSdp
     */
    async function acceptAnswer(answerSdp) {
      const state = pc.signalingState;
      if (state === 'stable') {
        // Connection may have already been negotiated via another path
        log('Signaling state already stable — connection may be established, adding remote description as informational');
        // Still try — some browsers allow re-setting in stable state
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
          log('Remote answer accepted (from stable state)');
        } catch {
          log('Remote description skipped (already stable) — waiting for ICE connectivity');
        }
        stateChange('connecting');
        return;
      }
      if (state !== 'have-local-offer') {
        throw new Error(`Cannot accept answer in signaling state "${state}" (expected "have-local-offer"). Try creating a new session.`);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
      log('Remote answer accepted');
      stateChange('connecting');
    }

    /**
     * Add remote ICE candidates.
     * @param {RTCIceCandidateInit[]} candidates
     */
    async function addIceCandidates(candidates) {
      let added = 0;
      for (const c of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
          added++;
        } catch (err) {
          log(`Failed to add ICE candidate: ${err.message}`, 'warn');
        }
      }
      log(`Added ${added}/${candidates.length} remote ICE candidate(s)`);
    }

    /**
     * Send a message over the DataChannel.
     * @param {string} msg
     * @returns {boolean} true if sent
     */
    function send(msg) {
      if (!dcChat || dcChat.readyState !== 'open') return false;
      dcChat.send(msg);
      return true;
    }

    const CHUNK_SIZE = 16 * 1024; // 16KB max for universal WebRTC compatibility
    const BUFFER_HIGH = 256 * 1024; // 256KB threshold to pause queuing (prevents SCTP buffer exhaustion)
    const BUFFER_LOW = 64 * 1024;  // 64KB threshold to resume queuing

    /**
     * Wait for the DataChannel buffer to drain below a target threshold.
     * Uses the native bufferedamountlow event with fallback polling.
     * @param {RTCDataChannel} dc
     * @param {number} targetBytes
     * @param {number} [timeoutMs=60000]
     * @returns {Promise<void>}
     */
    function waitForBufferDrain(dc, targetBytes = 0, timeoutMs = 60000) {
      if (!dc || dc.readyState !== 'open' || dc.bufferedAmount <= targetBytes) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        let timer = null;
        let timeoutTimer = null;
        let lastBuffered = dc.bufferedAmount;
        let lastProgressTime = Date.now();

        const cleanup = () => {
          if (timer) { clearInterval(timer); timer = null; }
          if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
          dc.removeEventListener('bufferedamountlow', onLow);
          dc.removeEventListener('close', onClose);
          dc.removeEventListener('error', onError);
        };

        const onLow = () => {
          if (!dc || dc.readyState !== 'open') {
            cleanup();
            reject(new Error('DataChannel closed'));
            return;
          }
          if (dc.bufferedAmount <= targetBytes) {
            cleanup();
            resolve();
          }
        };

        const onClose = () => {
          cleanup();
          reject(new Error('DataChannel closed while waiting for buffer drain'));
        };

        const onError = (err) => {
          cleanup();
          reject(err.error || new Error('DataChannel error while waiting for buffer drain'));
        };

        dc.bufferedAmountLowThreshold = targetBytes;
        dc.addEventListener('bufferedamountlow', onLow);
        dc.addEventListener('close', onClose);
        dc.addEventListener('error', onError);

        // Fallback polling interval in case bufferedamountlow event is missed
        timer = setInterval(() => {
          if (!dc || dc.readyState !== 'open') {
            cleanup();
            reject(new Error('DataChannel closed'));
            return;
          }
          if (dc.bufferedAmount < lastBuffered) {
            lastBuffered = dc.bufferedAmount;
            lastProgressTime = Date.now();
          }
          if (dc.bufferedAmount <= targetBytes) {
            cleanup();
            resolve();
            return;
          }
          // If no buffer drain progress for 30s, reject
          if (Date.now() - lastProgressTime > 30000) {
            cleanup();
            reject(new Error('Buffer drain timed out (transfer stalled)'));
          }
        }, 25);

        timeoutTimer = setTimeout(() => {
          cleanup();
          reject(new Error('Buffer drain timed out'));
        }, timeoutMs);
      });
    }

    /**
     * Send a single file via the p2p-files DataChannel.
     * Sequentially queues transfers with true backpressure so buffer limits are never breached.
     * @param {File} file
     * @param {Object} [extraMeta] Optional batch metadata (e.g. { fileIndex, totalFiles })
     * @returns {Promise<void>}
     */
    function sendFile(file, extraMeta = {}) {
      const run = async () => {
        if (!dcFiles || dcFiles.readyState !== 'open') throw new Error('File channel not open');

        // Wait until any previous pending data in the channel has drained
        await waitForBufferDrain(dcFiles, BUFFER_LOW);

        dcFiles.send(JSON.stringify({
          _fileStart: true,
          name: file.name,
          size: file.size,
          type: file.type,
          ...extraMeta
        }));

        const buffer = await file.arrayBuffer();
        let offset = 0;

        try {
          while (offset < buffer.byteLength) {
            if (dcFiles.readyState !== 'open') {
              throw new Error('File channel closed during transfer');
            }

            // Apply backpressure: pause if buffer is filling up
            if (dcFiles.bufferedAmount > BUFFER_HIGH) {
              await waitForBufferDrain(dcFiles, BUFFER_LOW);
            }

            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            dcFiles.send(chunk);
            offset += chunk.byteLength;

            if (cfg.onFileProgress) {
              // Calculate actual sent bytes (bufferedAmount still in queue has not left the client)
              const unsent = Math.min(offset, dcFiles.bufferedAmount);
              const actualSent = offset - unsent;
              const pct = file.size === 0 ? 100 : Math.min(100, Math.max(0, Math.round((actualSent / file.size) * 100)));
              cfg.onFileProgress(pct, 'sending', {
                fileName: file.name,
                size: file.size,
                ...extraMeta
              });
            }
          }

          // Wait until all file chunks have fully drained out of the network buffer
          await waitForBufferDrain(dcFiles, 0);

          if (cfg.onFileProgress) {
            cfg.onFileProgress(100, 'sending', {
              fileName: file.name,
              size: file.size,
              ...extraMeta
            });
          }

          // Send file end delimiter
          dcFiles.send(JSON.stringify({ _fileEnd: true }));
          log(`Sent file: ${file.name}`, 'success');

          // Wait for end delimiter to drain before resolving
          await waitForBufferDrain(dcFiles, 0);
        } catch (err) {
          // If error occurred during transfer, notify receiver to discard partial state
          try {
            if (dcFiles && dcFiles.readyState === 'open') {
              dcFiles.send(JSON.stringify({ _fileAbort: true, name: file.name }));
            }
          } catch { }
          throw err;
        }
      };

      const currentTask = fileSendQueue.then(run);
      // Ensure failure of one file does not halt subsequent queued files
      fileSendQueue = currentTask.catch(() => {});
      return currentTask;
    }

    /**
     * Send multiple files sequentially.
     * @param {File[]|FileList} files
     * @returns {Promise<File[]>}
     */
    async function sendFiles(files) {
      const list = Array.from(files || []);
      const total = list.length;
      const sent = [];
      for (let i = 0; i < total; i++) {
        const file = list[i];
        await sendFile(file, { fileIndex: i + 1, totalFiles: total });
        sent.push(file);
      }
      return sent;
    }

    /**
     * Get all locally gathered ICE candidates so far.
     * @returns {RTCIceCandidate[]}
     */
    function getLocalCandidates() {
      return [...localCandidates];
    }

    /** @returns {boolean} */
    function isIceComplete() {
      return iceComplete;
    }

    /** Close peer connection and channel. */
    function close() {
      removeMedia();
      if (dcChat) { try { dcChat.close(); } catch { } }
      if (dcSig) { try { dcSig.close(); } catch { } }
      if (dcFiles) { try { dcFiles.close(); } catch { } }
      pc.close();
      log('Session closed');
      stateChange('closed');
    }

    /** @returns {boolean} */
    function isChannelOpen() { 
      return dcChat && dcChat.readyState === 'open' &&
             pc.iceConnectionState !== 'failed' &&
             pc.connectionState !== 'failed' &&
             pc.iceConnectionState !== 'closed' &&
             pc.connectionState !== 'closed'; 
    }

    /**
     * Wait for DataChannel to be open.
     * @param {number} [timeoutMs=5000]
     * @returns {Promise<boolean>} resolves true if open, false if timeout/failed
     */
    function waitForOpen(timeoutMs = 5000) {
      if (isChannelOpen()) return Promise.resolve(true);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        let timer = null;
        let interval = null;
        const cleanup = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          if (interval) { clearInterval(interval); interval = null; }
        };

        const check = () => {
          if (isChannelOpen()) {
            cleanup();
            resolve(true);
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            cleanup();
            resolve(false);
          }
        };

        interval = setInterval(check, 100);
        timer = setTimeout(() => {
          cleanup();
          resolve(isChannelOpen());
        }, timeoutMs);
      });
    }

    /** @returns {string} */
    function getState() { return pc.connectionState; }

    /** @returns {RTCPeerConnection} raw peer connection (escape hatch) */
    function getRawPC() { return pc; }

    return {
      createOffer,
      acceptOffer,
      acceptAnswer,
      addIceCandidates,
      send,
      sendFile,
      sendFiles,
      sendCallEnded,
      sendPing,
      getLocalCandidates,
      isIceComplete,
      isChannelOpen,
      waitForOpen,
      getState,
      close,
      getRawPC,
      // Media
      addLocalStream,
      removeMedia,
      toggleAudio,
      toggleVideo,
      replaceVideoTrack,
      startScreenShare,
      stopScreenShare,
      getLocalStream,
      getRemoteStream,
      isScreenSharing,
    };
  }

  /**
   * Diagnostic function to test ICE servers (STUN discovery and TURN relay allocation).
   * @param {RTCIceServer[]} iceServers
   * @param {number} [timeoutMs=8000]
   * @returns {Promise<{
   *   success: boolean,
   *   stunWorking: boolean,
   *   turnWorking: boolean,
   *   publicIp: string|null,
   *   candidates: { host: number, srflx: number, relay: number },
   *   errors: Array<{ url: string, errorCode: number, errorText: string }>
   * }>}
   */
  async function testIceServers(iceServers, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let pc = null;
      let timer = null;
      const result = {
        success: false,
        stunWorking: false,
        turnWorking: false,
        publicIp: null,
        candidates: { host: 0, srflx: 0, relay: 0 },
        errors: [],
      };

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (pc) {
          try { pc.close(); } catch { }
          pc = null;
        }
      };

      try {
        pc = new RTCPeerConnection({ iceServers });
        pc.createDataChannel('ice-diag');

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            const type = e.candidate.type;
            if (type in result.candidates) {
              result.candidates[type]++;
            }
            if (type === 'srflx') {
              result.stunWorking = true;
              if (!result.publicIp && e.candidate.address) {
                result.publicIp = e.candidate.address;
              }
            }
            if (type === 'relay') {
              result.turnWorking = true;
            }
          } else {
            cleanup();
            result.success = result.stunWorking || result.turnWorking;
            resolve(result);
          }
        };

        pc.onicecandidateerror = (e) => {
          result.errors.push({
            url: e.url || '',
            errorCode: e.errorCode,
            errorText: e.errorText || '',
          });
        };

        pc.createOffer().then(offer => {
          return pc.setLocalDescription(offer);
        }).catch(err => {
          result.errors.push({ url: '', errorCode: -1, errorText: err.message });
          cleanup();
          resolve(result);
        });

        timer = setTimeout(() => {
          cleanup();
          result.success = result.stunWorking || result.turnWorking;
          resolve(result);
        }, timeoutMs);

      } catch (err) {
        cleanup();
        result.errors.push({ url: '', errorCode: -1, errorText: err.message });
        resolve(result);
      }
    });
  }

  return { create, testIceServers };
})();
