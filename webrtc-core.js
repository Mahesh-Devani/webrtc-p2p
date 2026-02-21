/**
 * webrtc-core.js — Peer connection lifecycle, DataChannel, ICE management.
 *
 * Exposes a single factory: PeerSession.create(config)
 * All callbacks are optional; the caller (UI controller) wires them up.
 */

'use strict';

const PeerSession = (() => {

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
   * @property {function(string):void}          [onError]
   * @property {function(MediaStream):void}     [onRemoteStream] – remote media stream
   * @property {function():void}                [onRemoteStreamEnded]
   */

  /**
   * Create a new PeerSession.
   * @param {SessionConfig} cfg
   */
  function create(cfg = {}) {
    const iceServers  = cfg.iceServers && cfg.iceServers.length ? cfg.iceServers : DEFAULT_ICE_SERVERS;
    const log         = cfg.onLog         || (() => {});
    const stateChange = cfg.onStateChange || (() => {});
    const onError     = cfg.onError       || (() => {});

    /** @type {RTCIceCandidate[]} */
    const localCandidates = [];
    let iceComplete = false;

    // ── Create RTCPeerConnection ───────────────────────────────
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
    });

    /** @type {RTCDataChannel|null} */
    let dc = null;

    /** @type {MediaStream|null} */
    let localStream = null;
    /** @type {MediaStream|null} */
    let screenStream = null;
    /** @type {Map<string,RTCRtpSender>} track kind → sender */
    const senders = new Map();
    /** @type {MediaStream} assembled remote stream */
    const remoteStream = new MediaStream();

    // ── Renegotiation state (perfect negotiation pattern) ──────
    let isPolite     = false;  // set in createOffer / acceptOffer
    let makingOffer  = false;
    let ignoreOffer  = false;

    // ── ICE handling ───────────────────────────────────────────
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        localCandidates.push(e.candidate);
        log(`ICE candidate gathered: ${e.candidate.candidate.split(' ')[7] || 'unknown'} (${e.candidate.type || ''})`);
        if (cfg.onIceCandidate) cfg.onIceCandidate(e.candidate);
        // Forward via DataChannel when open (renegotiation ICE)
        if (dc && dc.readyState === 'open') {
          try {
            dc.send(JSON.stringify({
              _sig: 'ice',
              candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }
            }));
          } catch {}
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
      const ice  = pc.iceConnectionState;
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
          dc.send(JSON.stringify({ _sig: 'answer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
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
        }
      } catch (err) {
        log(`Renegotiation signaling error: ${err.message}`, 'error');
      }
    }

    // ── Negotiation needed (fires when tracks are added/removed) ─
    pc.onnegotiationneeded = async () => {
      if (!dc || dc.readyState !== 'open') {
        log('Negotiation needed but DataChannel not open — will negotiate on manual exchange');
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
        dc.send(JSON.stringify({ _sig: 'offer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }));
        log('Renegotiation: sent offer via DataChannel');
      } catch (err) {
        log(`Renegotiation offer failed: ${err.message}`, 'error');
      } finally {
        makingOffer = false;
      }
    };

    // ── DataChannel wiring helper ──────────────────────────────
    function wireChannel(channel) {
      dc = channel;
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => {
        log('DataChannel open', 'success');
        if (cfg.onChannelOpen) cfg.onChannelOpen();
      };
      dc.onclose = () => {
        log('DataChannel closed');
        if (cfg.onChannelClose) cfg.onChannelClose();
      };
      dc.onerror = (err) => {
        log(`DataChannel error: ${err.error?.message || err}`, 'error');
        onError(`DataChannel error: ${err.error?.message || err}`);
      };
      dc.onmessage = (e) => {
        // Intercept internal signaling messages
        if (typeof e.data === 'string') {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed._sig) {
              handleDcSignaling(parsed);
              return;
            }
          } catch {}
        }
        if (cfg.onMessage) cfg.onMessage(e.data);
      };
    }

    // Answerer receives DataChannel from offerer
    pc.ondatachannel = (e) => {
      log('Remote DataChannel received');
      wireChannel(e.channel);
    };

    // ── Remote media tracks ────────────────────────────────────
    pc.ontrack = (e) => {
      log(`Remote track received: ${e.track.kind}`);
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
        try { pc.removeTrack(sender); } catch {}
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
      const channel = pc.createDataChannel('p2p-chat', {
        ordered: true,
      });
      wireChannel(channel);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log('Local offer created');
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
      if (!dc || dc.readyState !== 'open') return false;
      dc.send(msg);
      return true;
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
      if (dc) { try { dc.close(); } catch {} }
      pc.close();
      log('Session closed');
      stateChange('closed');
    }

    /** @returns {RTCPeerConnection} raw peer connection (escape hatch) */
    function getRawPC() { return pc; }

    return {
      createOffer,
      acceptOffer,
      acceptAnswer,
      addIceCandidates,
      send,
      getLocalCandidates,
      isIceComplete,
      close,
      getRawPC,
      // Media
      addLocalStream,
      removeMedia,
      toggleAudio,
      toggleVideo,
      startScreenShare,
      stopScreenShare,
      getLocalStream,
      getRemoteStream,
      isScreenSharing,
    };
  }

  return { create };
})();
