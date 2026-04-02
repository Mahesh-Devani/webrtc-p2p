/**
 * webrtc-core.js — Peer connection lifecycle, DataChannel, ICE management.
 *
 * Exposes a single factory: PeerSession.create(config)
 * All callbacks are optional; the caller (UI controller) wires them up.
 */

'use strict';

export const PeerSession = (() => {

  // ── Default ICE servers (STUN only) ──────────────────────────
  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  /**
   * @typedef {Object} SessionConfig
   * @property {RTCIceServer[]}   [iceServers]
   * @property {function(string,string=):void} [onLog]        – (msg, level)
   * @property {function(string):void}          [onStateChange] – connection state label
   * @property {function(RTCIceCandidate):void} [onIceCandidate]
   * @property {function():void}                [onIceComplete]
   * @property {function():void}                [onChannelOpen]
   * @property {function():void}                [onChannelClose]
   * @property {function(string):void}          [onMessage]
   * @property {function(File|Blob, string):void} [onFileReceived]
   * @property {function(number, string):void}  [onFileProgress]
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
        }
      }
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

    // ── Negotiation needed (fires when tracks are added/removed) ─
    pc.onnegotiationneeded = async () => {
      // Suppress during manual signaling phase — only auto-renegotiate
      // after the initial manual offer/answer exchange is complete
      if (!initialSignalingDone) {
        log('Negotiation needed — deferred (initial manual signaling in progress)');
        return;
      }
      if (!dcSig || dcSig.readyState !== 'open') {
        log('Negotiation needed but Signaling DataChannel not open');
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

    // ── File Reception State ──
    let incomingFileChunks = [];
    let incomingFileMeta = null;
    let incomingFileBytesReceived = 0;

    // ── DataChannel wiring helper ──────────────────────────────
    function wireChannel(channel) {
      if (channel.label === 'p2p-sig') {
        dcSig = channel;
        dcSig.onopen = () => {
          initialSignalingDone = true;
          log('Signaling DataChannel open — auto-renegotiation enabled', 'success');
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
                incomingFileMeta = meta;
                incomingFileChunks = [];
                incomingFileBytesReceived = 0;
                log(`Incoming file started: ${meta.name} (${meta.size} bytes)`);
              } else if (meta._fileEnd) {
                if (!incomingFileMeta) return;
                const blob = new Blob(incomingFileChunks, { type: incomingFileMeta.type });
                log(`Incoming file complete: ${incomingFileMeta.name}`);
                if (cfg.onFileReceived) cfg.onFileReceived(blob, incomingFileMeta.name);
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
              const pct = Math.round((incomingFileBytesReceived / incomingFileMeta.size) * 100);
              cfg.onFileProgress(pct, 'receiving');
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
     * Toggle local audio track (mute/unmute without renegotiation).
     * @returns {boolean} new enabled state
     */
    function toggleAudio() {
      if (!localStream) return false;
      const track = localStream.getAudioTracks()[0];
      if (!track) return false;
      track.enabled = !track.enabled;
      log(`Microphone ${track.enabled ? 'unmuted' : 'muted'}`);
      return track.enabled;
    }

    /**
     * Toggle local video track (enable/disable without renegotiation).
     * @returns {boolean} new enabled state
     */
    function toggleVideo() {
      if (!localStream) return false;
      const track = localStream.getVideoTracks()[0];
      if (!track) return false;
      track.enabled = !track.enabled;
      log(`Camera ${track.enabled ? 'enabled' : 'disabled'}`);
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
    function stopScreenShare() {
      if (screenStream) {
        for (const t of screenStream.getTracks()) t.stop();
        screenStream = null;
      }
      // restore camera
      if (localStream) {
        const camTrack = localStream.getVideoTracks()[0];
        const videoSender = senders.get('video');
        if (camTrack && videoSender) {
          videoSender.replaceTrack(camTrack);
          log('Camera restored after screen share');
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

    /**
     * Send a file via the p2p-files DataChannel.
     * @param {File} file
     */
    async function sendFile(file) {
      if (!dcFiles || dcFiles.readyState !== 'open') throw new Error('File channel not open');

      dcFiles.send(JSON.stringify({
        _fileStart: true,
        name: file.name,
        size: file.size,
        type: file.type
      }));

      const chunkSize = 16 * 1024; // 16KB max for broad compatibility
      const buffer = await file.arrayBuffer();
      let offset = 0;

      return new Promise((resolve, reject) => {
        const sendBlock = () => {
          while (offset < buffer.byteLength) {
            // Respect buffer limits
            if (dcFiles.bufferedAmount > 16 * 1024 * 1024) { // Don't queue more than 16MB
              // Wait for buffer to drain
              setTimeout(sendBlock, 50);
              return;
            }
            const chunk = buffer.slice(offset, offset + chunkSize);
            try {
              dcFiles.send(chunk);
            } catch (e) {
              reject(e);
              return;
            }
            offset += chunk.byteLength;
            if (cfg.onFileProgress) {
              const pct = Math.round((offset / file.size) * 100);
              cfg.onFileProgress(pct, 'sending');
            }
          }

          dcFiles.send(JSON.stringify({ _fileEnd: true }));
          log(`Sent file: ${file.name}`, 'success');
          resolve();
        };
        sendBlock();
      });
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
             pc.iceConnectionState !== 'disconnected' && 
             pc.iceConnectionState !== 'failed' &&
             pc.connectionState !== 'disconnected' &&
             pc.connectionState !== 'failed'; 
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
      sendCallEnded,
      getLocalCandidates,
      isIceComplete,
      isChannelOpen,
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

  return { create };
})();
