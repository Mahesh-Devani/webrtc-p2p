/**
 * nostr-signaling.js — Bridge between NostrTransport and WebRTC PeerSession.
 *
 * Automates the full WebRTC signaling flow over Nostr:
 *   1. Creator sends offer → remote receives → creates answer → sends back
 *   2. ICE candidates exchanged as separate events
 *   3. Signaling stops once peer connection is established
 *
 * Uses pako (globally loaded via CDN) for SDP compression to reduce
 * Nostr event payload size.
 *
 * Exports: NostrSignaling singleton
 */

'use strict';

import { NostrTransport } from './nostr-transport.js';
import { PeerSession } from './webrtc-core.js';

// ── Constants ─────────────────────────────────────────────────────
const SESSION_TIMEOUT_MS = 120_000; // 2 minutes — auto-cleanup stale sessions

export const NostrSignaling = (() => {

    // ── Session State ──────────────────────────────────────────────
    /**
     * @type {Map<string, {
     *   session: Object,         // PeerSession instance
     *   remotePubKey: string,    // hex pubkey of remote peer
     *   state: string,           // 'pending'|'connecting'|'connected'|'closed'
     *   role: string,            // 'creator'|'joiner'
     *   createdAt: number,       // Date.now()
     * }>}
     */
    const _sessions = new Map();

    // ── Callbacks (set by UI controller) ───────────────────────────
    let _onSessionCreated = null;  // (sessionId, peerSession, remotePubKey, role) => void
    let _onConnected = null;       // (sessionId) => void
    let _onDisconnected = null;    // (sessionId) => void
    let _onError = null;           // (sessionId, error) => void
    let _onIncomingRequest = null; // (senderPubKey, sessionId) => void
    let _log = () => { };
    let _buildIceServers = null;   // () => RTCIceServer[]
    let _getSessionConfig = null;  // (sessionId, remotePubKey, role) => partial SessionConfig
    let _cleanupTimer = null;

    /**
     * Initialize callbacks.
     * @param {Object} opts
     * @param {function} opts.onSessionCreated   - (sessionId, session, remotePubKey, role)
     * @param {function} opts.onConnected        - (sessionId)
     * @param {function} opts.onDisconnected     - (sessionId)
     * @param {function} opts.onError            - (sessionId, errMsg)
     * @param {function} opts.onIncomingRequest  - (senderPubKey, sessionId) → auto-accepts
     * @param {function} opts.onLog              - (msg, level)
     * @param {function} opts.buildIceServers    - () => RTCIceServer[]
     * @param {function} opts.getSessionConfig   - (sessionId, remotePubKey, role) => partial SessionConfig
     */
    function init(opts = {}) {
        _onSessionCreated = opts.onSessionCreated || null;
        _onConnected = opts.onConnected || null;
        _onDisconnected = opts.onDisconnected || null;
        _onError = opts.onError || null;
        _onIncomingRequest = opts.onIncomingRequest || null;
        _log = opts.onLog || (() => { });
        _buildIceServers = opts.buildIceServers || (() => []);
        _getSessionConfig = opts.getSessionConfig || (() => ({}));

        // Listen for incoming signals
        NostrTransport.subscribeSignals(_handleSignal);

        // Start session cleanup timer
        if (_cleanupTimer) clearInterval(_cleanupTimer);
        _cleanupTimer = setInterval(_cleanupStaleSessions, 30_000);

        _log('[Signaling] Initialized — listening for incoming connections', 'info');
    }

    /**
     * Initiate a connection to a remote peer.
     * Creates PeerSession, generates offer, sends via Nostr.
     * @param {string} remotePubKey - hex pubkey of remote peer
     * @returns {Promise<string>} sessionId
     */
    async function startSession(remotePubKey) {
        const sessionId = _generateSessionId();
        _log(`[Signaling] Starting session ${sessionId.slice(0, 8)} → ${remotePubKey.slice(0, 8)}…`, 'info');

        // Create PeerSession
        const peerSession = _createPeerSession(sessionId, remotePubKey, 'creator');

        // Create offer
        const offer = await peerSession.createOffer();

        // Wait briefly for ICE candidates
        await _waitForIce(peerSession, 1500);
        const candidates = peerSession.getLocalCandidates();

        // Compress SDP + candidates
        const data = _compressSignalData({
            sdp: { type: offer.type, sdp: offer.sdp },
            candidates: candidates.map(c => ({
                candidate: c.candidate,
                sdpMid: c.sdpMid,
                sdpMLineIndex: c.sdpMLineIndex,
            })),
        });

        // Send offer via Nostr
        await NostrTransport.sendSignal(remotePubKey, {
            type: 'offer',
            session: sessionId,
            data,
        });

        _log(`[Signaling] Offer sent (${candidates.length} ICE candidates bundled)`, 'info');
        return sessionId;
    }

    /**
     * Handle an incoming signal message from NostrTransport.
     * @private
     * @param {Object} signal - { type, session, data, ts, senderPubKey }
     */
    async function _handleSignal(signal) {
        const { type, session: sessionId, data, senderPubKey } = signal;

        switch (type) {
            case 'offer':
                await _handleOffer(sessionId, data, senderPubKey);
                break;
            case 'answer':
                await _handleAnswer(sessionId, data, senderPubKey);
                break;
            case 'ice':
                await _handleIce(sessionId, data, senderPubKey);
                break;
            case 'close':
                _handleClose(sessionId, senderPubKey);
                break;
        }
    }

    /**
     * Handle incoming offer — create session, accept offer, send answer.
     * @private
     */
    async function _handleOffer(sessionId, compressedData, senderPubKey) {
        _log(`[Signaling] Incoming offer from ${senderPubKey.slice(0, 8)}… (session ${sessionId.slice(0, 8)})`, 'info');

        // Check if we already have this session (duplicate)
        if (_sessions.has(sessionId)) {
            _log('[Signaling] Duplicate offer — ignoring', 'warn');
            return;
        }

        // Notify UI of incoming request
        if (_onIncomingRequest) {
            _onIncomingRequest(senderPubKey, sessionId);
        }

        try {
            // Decompress the offer data
            const { sdp, candidates } = _decompressSignalData(compressedData);

            // Create PeerSession as joiner
            const peerSession = _createPeerSession(sessionId, senderPubKey, 'joiner');

            // Accept offer
            const answer = await peerSession.acceptOffer(sdp);

            // Add remote ICE candidates
            if (candidates && candidates.length) {
                await peerSession.addIceCandidates(candidates);
            }

            // Wait for our ICE candidates
            await _waitForIce(peerSession, 1500);
            const localCandidates = peerSession.getLocalCandidates();

            // Compress answer + our candidates
            const answerData = _compressSignalData({
                sdp: { type: answer.type, sdp: answer.sdp },
                candidates: localCandidates.map(c => ({
                    candidate: c.candidate,
                    sdpMid: c.sdpMid,
                    sdpMLineIndex: c.sdpMLineIndex,
                })),
            });

            // Send answer via Nostr
            await NostrTransport.sendSignal(senderPubKey, {
                type: 'answer',
                session: sessionId,
                data: answerData,
            });

            _log(`[Signaling] Answer sent (${localCandidates.length} ICE candidates)`, 'info');
        } catch (err) {
            _log(`[Signaling] Failed to handle offer: ${err.message}`, 'error');
            if (_onError) _onError(sessionId, err.message);
        }
    }

    /**
     * Handle incoming answer — apply to existing session.
     * @private
     */
    async function _handleAnswer(sessionId, compressedData, senderPubKey) {
        const sessionEntry = _sessions.get(sessionId);
        if (!sessionEntry) {
            _log(`[Signaling] Answer for unknown session ${sessionId.slice(0, 8)}`, 'warn');
            return;
        }

        if (sessionEntry.remotePubKey !== senderPubKey) {
            _log('[Signaling] Answer from unexpected peer — ignoring', 'warn');
            return;
        }

        try {
            const { sdp, candidates } = _decompressSignalData(compressedData);

            await sessionEntry.session.acceptAnswer(sdp);

            if (candidates && candidates.length) {
                await sessionEntry.session.addIceCandidates(candidates);
            }

            sessionEntry.state = 'connecting';
            _log(`[Signaling] Answer accepted (${candidates?.length || 0} ICE candidates)`, 'info');
        } catch (err) {
            _log(`[Signaling] Failed to handle answer: ${err.message}`, 'error');
            if (_onError) _onError(sessionId, err.message);
        }
    }

    /**
     * Handle incoming ICE candidate — add to existing session.
     * @private
     */
    async function _handleIce(sessionId, compressedData, senderPubKey) {
        const sessionEntry = _sessions.get(sessionId);
        if (!sessionEntry) return; // ignore ICE for unknown sessions

        if (sessionEntry.remotePubKey !== senderPubKey) return;

        try {
            const { candidates } = _decompressSignalData(compressedData);
            if (candidates && candidates.length) {
                await sessionEntry.session.addIceCandidates(candidates);
                _log(`[Signaling] Added ${candidates.length} remote ICE candidate(s)`, 'info');
            }
        } catch (err) {
            _log(`[Signaling] ICE handling error: ${err.message}`, 'warn');
        }
    }

    /**
     * Handle close signal — tear down session.
     * @private
     */
    function _handleClose(sessionId, senderPubKey) {
        const sessionEntry = _sessions.get(sessionId);
        if (!sessionEntry) return;
        if (sessionEntry.remotePubKey !== senderPubKey) return;

        _log(`[Signaling] Remote peer closed session ${sessionId.slice(0, 8)}`, 'info');
        sessionEntry.session.close();
        sessionEntry.state = 'closed';
        NostrTransport.clearSession(sessionId);
        _sessions.delete(sessionId);
        if (_onDisconnected) _onDisconnected(sessionId);
    }

    /**
     * Close a session and notify remote.
     * @param {string} sessionId
     */
    async function closeSession(sessionId) {
        const sessionEntry = _sessions.get(sessionId);
        if (!sessionEntry) return;

        try {
            await NostrTransport.sendSignal(sessionEntry.remotePubKey, {
                type: 'close',
                session: sessionId,
                data: '',
            });
        } catch { }

        sessionEntry.session.close();
        sessionEntry.state = 'closed';
        NostrTransport.clearSession(sessionId);
        _sessions.delete(sessionId);
    }

    // ── PeerSession factory ───────────────────────────────────────

    /**
     * Create and configure a PeerSession for a Nostr signaling session.
     * @private
     */
    function _createPeerSession(sessionId, remotePubKey, role) {
        const iceServers = _buildIceServers ? _buildIceServers() : [];

        // Get extra config from UI (chat callbacks, media callbacks, file callbacks, etc.)
        const uiConfig = _getSessionConfig ? _getSessionConfig(sessionId, remotePubKey, role) : {};

        const peerSession = PeerSession.create({
            iceServers,
            // UI-provided callbacks (onMessage, onChannelOpen, onChannelClose, etc.)
            ...uiConfig,
            // Override these with signaling-aware versions that chain to UI callbacks
            onLog: (msg, level) => {
                _log(msg, level);
                if (uiConfig.onLog) uiConfig.onLog(msg, level);
            },
            onStateChange: (state) => {
                const entry = _sessions.get(sessionId);
                if (!entry) return;

                if (state === 'connected') {
                    entry.state = 'connected';
                    _log(`[Signaling] ✅ P2P connected (session ${sessionId.slice(0, 8)})`, 'success');
                    if (_onConnected) _onConnected(sessionId);
                } else if (state === 'failed' || state === 'disconnected') {
                    entry.state = state;
                    if (_onDisconnected) _onDisconnected(sessionId);
                }
                if (uiConfig.onStateChange) uiConfig.onStateChange(state);
            },
            onIceCandidate: (candidate) => {
                // Send ICE candidate via Nostr (delayed batch)
                _sendIceCandidate(sessionId, remotePubKey, candidate);
                if (uiConfig.onIceCandidate) uiConfig.onIceCandidate(candidate);
            },
        });

        _sessions.set(sessionId, {
            session: peerSession,
            remotePubKey,
            state: 'pending',
            role,
            createdAt: Date.now(),
        });

        // Notify UI
        if (_onSessionCreated) {
            _onSessionCreated(sessionId, peerSession, remotePubKey, role);
        }

        return peerSession;
    }

    // ── ICE candidate batching ────────────────────────────────────
    const _iceBatchTimers = new Map(); // sessionId → timer
    const _iceBatchQueues = new Map(); // sessionId → candidates[]

    /**
     * Queue an ICE candidate and send in batch (200ms debounce).
     * @private
     */
    function _sendIceCandidate(sessionId, remotePubKey, candidate) {
        if (!_iceBatchQueues.has(sessionId)) {
            _iceBatchQueues.set(sessionId, []);
        }
        _iceBatchQueues.get(sessionId).push({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
        });

        // Debounce: send batch after 200ms of no new candidates
        if (_iceBatchTimers.has(sessionId)) {
            clearTimeout(_iceBatchTimers.get(sessionId));
        }
        _iceBatchTimers.set(sessionId, setTimeout(async () => {
            const candidates = _iceBatchQueues.get(sessionId) || [];
            _iceBatchQueues.delete(sessionId);
            _iceBatchTimers.delete(sessionId);

            if (candidates.length === 0) return;

            const data = _compressSignalData({ candidates });
            try {
                await NostrTransport.sendSignal(remotePubKey, {
                    type: 'ice',
                    session: sessionId,
                    data,
                });
                _log(`[Signaling] Sent ${candidates.length} ICE candidate(s)`, 'info');
            } catch (err) {
                _log(`[Signaling] Failed to send ICE: ${err.message}`, 'warn');
            }
        }, 200));
    }

    // ── Compression helpers ────────────────────────────────────────
    // Uses pako (global, loaded via CDN in index.html) for deflate compression,
    // then base64url encodes for compact transport.

    /**
     * Compress signal data (SDP + candidates) for transport.
     * @private
     * @param {Object} obj - { sdp?, candidates? }
     * @returns {string} - base64url encoded compressed data
     */
    function _compressSignalData(obj) {
        const json = JSON.stringify(obj);
        const bytes = new TextEncoder().encode(json);
        const compressed = pako.deflate(bytes, { level: 9 });
        const binary = String.fromCharCode.apply(null, compressed);
        const b64 = btoa(binary);
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /**
     * Decompress signal data.
     * @private
     * @param {string} b64url - base64url encoded compressed data
     * @returns {Object} - { sdp?, candidates? }
     */
    function _decompressSignalData(b64url) {
        let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) b64 += '=';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decompressed = pako.inflate(bytes);
        const json = new TextDecoder().decode(decompressed);
        return JSON.parse(json);
    }

    // ── Utility ───────────────────────────────────────────────────

    function _generateSessionId() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    function _waitForIce(peerSession, timeoutMs) {
        return new Promise(resolve => {
            if (peerSession.isIceComplete()) {
                resolve();
                return;
            }
            const timer = setTimeout(resolve, timeoutMs);
            // Check periodically
            const check = setInterval(() => {
                if (peerSession.isIceComplete()) {
                    clearTimeout(timer);
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    function _cleanupStaleSessions() {
        const now = Date.now();
        for (const [sessionId, entry] of _sessions) {
            if (entry.state !== 'connected' && (now - entry.createdAt) > SESSION_TIMEOUT_MS) {
                _log(`[Signaling] Cleaning up stale session ${sessionId.slice(0, 8)}`, 'info');
                entry.session.close();
                NostrTransport.clearSession(sessionId);
                _sessions.delete(sessionId);
            }
        }
    }

    /**
     * Get the PeerSession for a given sessionId.
     * @param {string} sessionId
     * @returns {Object|null} PeerSession or null
     */
    function getSession(sessionId) {
        const entry = _sessions.get(sessionId);
        return entry ? entry.session : null;
    }

    /**
     * Get all active sessions.
     * @returns {Array<{sessionId, remotePubKey, state, role}>}
     */
    function getActiveSessions() {
        return Array.from(_sessions.entries()).map(([id, e]) => ({
            sessionId: id,
            remotePubKey: e.remotePubKey,
            state: e.state,
            role: e.role,
        }));
    }

    /**
     * Tear down everything.
     */
    function destroy() {
        if (_cleanupTimer) clearInterval(_cleanupTimer);
        for (const [id, entry] of _sessions) {
            entry.session.close();
        }
        _sessions.clear();
        _iceBatchQueues.clear();
        for (const timer of _iceBatchTimers.values()) clearTimeout(timer);
        _iceBatchTimers.clear();
    }

    return {
        init,
        startSession,
        closeSession,
        getSession,
        getActiveSessions,
        destroy,
    };
})();
