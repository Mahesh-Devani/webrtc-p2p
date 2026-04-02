/**
 * nostr-transport.js — Nostr signaling transport orchestrator.
 *
 * Manages multiple relay connections, routes encrypted signaling messages,
 * handles event deduplication, and provides a clean transport API.
 *
 * Event format:
 *   kind: 24133
 *   tags: [["p", receiverPubKey], ["t", "webrtc"], ["v", "1"]]
 *   content: NIP-44 encrypted JSON payload
 *
 * Payload schema:
 *   { v:1, type:"offer"|"answer"|"ice"|"close", session:string, data:string, ts:number }
 *
 * Exports: NostrTransport singleton
 */

'use strict';

import { NostrCrypto } from './nostr-crypto.js';
import { NostrRelay, RelayState } from './nostr-relay.js';

// ── Constants ────────────────────────────────────────────────────
const EVENT_KIND = 24133;
const MAX_PROCESSED_EVENTS = 500;
const ICE_STALE_SECONDS = 60;
const MAX_ICE_PER_SESSION = 20;
const STORAGE_LAST_SEEN_KEY = 'nostr-last-seen';

// ── Relay config storage ─────────────────────────────────────────
const STORAGE_RELAY_KEY = 'nostr-relays';
const DEFAULT_RELAYS = [
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://offchain.pub',
];

export const NostrTransport = (() => {

    // ── State ────────────────────────────────────────────────────
    let _privateKey = null;        // hex
    let _publicKey = null;         // hex
    let _relays = new Map();       // url → NostrRelay instance
    let _signalHandler = null;     // callback for incoming signals
    let _messageHandler = null;    // callback for incoming chat messages
    let _statusHandler = null;     // callback for relay status changes
    let _logHandler = (() => { });  // log callback
    let _processedEvents = new Set();
    let _lastEventTimestamp = 0;
    let _subscriptionIds = new Map(); // url → subId
    let _iceCounters = new Map();    // sessionId → count
    let _connected = false;

    // ── Relay Config ──────────────────────────────────────────────

    /**
     * Get the configured relay list.
     * @returns {string[]} Array of relay URLs
     */
    function getRelayList() {
        const stored = localStorage.getItem(STORAGE_RELAY_KEY);
        if (stored) {
            try {
                const list = JSON.parse(stored);
                if (Array.isArray(list) && list.length > 0) return list;
            } catch { }
        }
        return [...DEFAULT_RELAYS];
    }

    /**
     * Save the relay list to localStorage.
     * @param {string[]} relays
     */
    function saveRelayList(relays) {
        localStorage.setItem(STORAGE_RELAY_KEY, JSON.stringify(relays));
    }

    /**
     * Add a relay URL. Returns true if added (not duplicate).
     * @param {string} url
     * @returns {boolean}
     */
    function addRelay(url) {
        url = url.trim();
        if (!url.startsWith('wss://') && !url.startsWith('ws://')) return false;
        const list = getRelayList();
        if (list.includes(url)) return false;
        list.push(url);
        saveRelayList(list);
        // If already connected, also connect the new relay
        if (_connected) {
            _connectSingleRelay(url);
        }
        return true;
    }

    /**
     * Remove a relay URL.
     * @param {string} url
     * @returns {boolean}
     */
    function removeRelay(url) {
        const list = getRelayList();
        const idx = list.indexOf(url);
        if (idx === -1) return false;
        list.splice(idx, 1);
        saveRelayList(list);
        // Disconnect the relay if connected
        const relay = _relays.get(url);
        if (relay) {
            relay.disconnect();
            _relays.delete(url);
        }
        const subId = _subscriptionIds.get(url);
        if (subId) _subscriptionIds.delete(url);
        return true;
    }

    /**
     * Reset relay list to defaults.
     */
    function resetRelays() {
        saveRelayList([...DEFAULT_RELAYS]);
    }

    // ── Core API ──────────────────────────────────────────────────

    /**
     * Initialize the transport with identity.
     * @param {string} privateKey - hex private key
     * @param {string} publicKey  - hex public key
     * @param {Object} [opts]
     * @param {function(string,string):void} [opts.onLog]
     * @param {function(string, string):void} [opts.onRelayStatus] - (url, state)
     */
    function init(privateKey, publicKey, opts = {}) {
        _privateKey = privateKey;
        _publicKey = publicKey;
        _logHandler = opts.onLog || (() => { });
        _statusHandler = opts.onRelayStatus || (() => { });
        _logHandler('[Nostr] Transport initialized', 'info');
    }

    /**
     * Connect to all configured relays.
     * @returns {Promise<void>}
     */
    async function connect() {
        const relayList = getRelayList();
        _connected = true;

        const results = await Promise.allSettled(
            relayList.map(url => _connectSingleRelay(url))
        );

        const connected = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        _logHandler(`[Nostr] Connected to ${connected}/${relayList.length} relays (${failed} failed)`, 'info');
    }

    /**
     * Connect to a single relay and set up subscriptions.
     * @private
     * @param {string} url
     * @returns {Promise<void>}
     */
    async function _connectSingleRelay(url) {
        if (_relays.has(url)) return;

        const relay = new NostrRelay(url, {
            onLog: (msg, level) => _logHandler(msg, level),
            onStatusChange: (u, state) => {
                if (_statusHandler) _statusHandler(u, state);
                // Re-subscribe on reconnect
                if (state === RelayState.CONNECTED && _signalHandler && _publicKey) {
                    _subscribeOnRelay(relay, url);
                }
            },
        });

        _relays.set(url, relay);

        try {
            await relay.connect();
            // Subscribe if we have a handler
            if (_signalHandler && _publicKey) {
                _subscribeOnRelay(relay, url);
            }
        } catch (err) {
            // Relay will auto-retry via built-in reconnect
            _logHandler(`[Nostr] Initial connection failed for ${url} (will retry)`, 'warn');
        }
    }

    /**
     * Disconnect from all relays.
     */
    function disconnect() {
        _connected = false;
        // Save last-seen timestamp for offline message delivery on next connect
        localStorage.setItem(STORAGE_LAST_SEEN_KEY, String(Math.floor(Date.now() / 1000)));
        for (const [url, relay] of _relays) {
            relay.disconnect();
        }
        _relays.clear();
        _subscriptionIds.clear();
        _signalHandler = null;
        _logHandler('[Nostr] All relays disconnected');
    }

    /**
     * Subscribe to incoming signaling messages for our pubkey.
     * @param {function(Object):void} handler - Called with decoded signal message:
     *   { type, session, data, ts, senderPubKey }
     */
    function subscribeSignals(handler) {
        _signalHandler = handler;

        // Subscribe on all connected relays
        for (const [url, relay] of _relays) {
            if (relay.state === RelayState.CONNECTED) {
                _subscribeOnRelay(relay, url);
            }
        }
    }

    /**
     * @private — Subscribe on a specific relay
     */
    function _subscribeOnRelay(relay, url) {
        // Close existing subscription
        const existingSubId = _subscriptionIds.get(url);
        if (existingSubId) {
            relay.unsubscribe(existingSubId);
        }

        // Use stored 'last seen' timestamp for offline message delivery
        const storedLastSeen = parseInt(localStorage.getItem(STORAGE_LAST_SEEN_KEY) || '0', 10);
        
        let since;
        if (storedLastSeen > 0) {
            // Fetch everything since we were last online, no matter how long ago
            since = storedLastSeen - 5; // 5s safety overlap
        } else {
            // First time running on this device: fetch last 7 days of history
            since = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60); 
        }
        const filters = [{
            kinds: [EVENT_KIND],
            '#p': [_publicKey],
            since,
        }];

        const subId = relay.subscribe(filters, async (event) => {
            await _handleIncomingEvent(event);
        });

        _subscriptionIds.set(url, subId);
    }

    /**
     * Send a signaling message to a remote peer via all connected relays.
     * @param {string} toPubKey - Receiver's public key (hex)
     * @param {Object} message  - Signal payload: { type, session, data }
     * @returns {Promise<void>}
     */
    async function sendSignal(toPubKey, message) {
        if (!_privateKey || !_publicKey) {
            throw new Error('Transport not initialized — call init() first');
        }

        // ICE rate limiting
        if (message.type === 'ice') {
            const count = _iceCounters.get(message.session) || 0;
            if (count >= MAX_ICE_PER_SESSION) {
                _logHandler(`[Nostr] ICE limit reached (${MAX_ICE_PER_SESSION}) for session ${message.session}`, 'warn');
                return;
            }
            _iceCounters.set(message.session, count + 1);
        }

        // Build payload
        const payload = JSON.stringify({
            v: 1,
            type: message.type,
            session: message.session,
            data: message.data,
            ts: Date.now(),
        });

        // Encrypt with NIP-44
        const encrypted = await NostrCrypto.encrypt(payload, _privateKey, toPubKey);

        // Build and sign event
        const tags = [
            ['p', toPubKey],
            ['t', 'webrtc'],
            ['v', '1'],
        ];

        const event = await NostrCrypto.createSignedEvent(encrypted, EVENT_KIND, tags, _privateKey);

        // Try publishing with one retry on failure
        await _publishWithRetry(event, message.type, toPubKey);
    }

    /**
     * Publish an event to all connected relays. If all fail, wait and retry once.
     * @private
     * @param {Object} event - Signed Nostr event
     * @param {string} signalType - For logging
     * @param {string} toPubKey - For logging
     */
    async function _publishWithRetry(event, signalType, toPubKey) {
        const MAX_ATTEMPTS = 2;
        const RETRY_DELAY_MS = 2000;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const publishPromises = [];
            const relayUrls = [];

            for (const [url, relay] of _relays) {
                if (relay.state === RelayState.CONNECTED) {
                    relayUrls.push(url);
                    publishPromises.push(
                        relay.publish(event).catch(err => {
                            _logHandler(`[Nostr] Publish failed on ${url}: ${err.message}`, 'warn');
                            throw err; // re-throw so Promise.any knows this relay failed
                        })
                    );
                }
            }

            if (publishPromises.length === 0) {
                throw new Error('No relays connected — cannot send signal');
            }

            try {
                await Promise.any(publishPromises);
                _logHandler(`[Nostr] Signal sent: ${signalType} → ${NostrCrypto.truncatePubkey(toPubKey)}`, 'info');
                return; // success — at least one relay accepted
            } catch (aggregateErr) {
                // All relays failed
                if (attempt < MAX_ATTEMPTS) {
                    _logHandler(`[Nostr] All ${relayUrls.length} relays rejected (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS}ms…`, 'warn');
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                } else {
                    _logHandler(`[Nostr] All relays rejected after ${MAX_ATTEMPTS} attempts`, 'error');
                    throw new Error('All relays rejected the signaling event');
                }
            }
        }
    }

    /**
     * @private — Handle an incoming Nostr event from any relay
     */
    async function _handleIncomingEvent(event) {
        // ── Deduplication ──
        if (_processedEvents.has(event.id)) return;
        _processedEvents.add(event.id);

        // Cap processed events set size
        if (_processedEvents.size > MAX_PROCESSED_EVENTS) {
            const iter = _processedEvents.values();
            for (let i = 0; i < 100; i++) { // remove oldest 100
                _processedEvents.delete(iter.next().value);
            }
        }

        // ── Verify event ──
        const valid = await NostrCrypto.verifyEvent(event);
        if (!valid) {
            _logHandler('[Nostr] Rejected event with invalid signature', 'warn');
            return;
        }

        // ── Decrypt ──
        let payloadStr;
        try {
            payloadStr = await NostrCrypto.decrypt(event.content, _privateKey, event.pubkey);
        } catch (err) {
            _logHandler(`[Nostr] Decryption failed: ${err.message}`, 'error');
            return;
        }

        // ── Parse payload ──
        let payload;
        try {
            payload = JSON.parse(payloadStr);
        } catch {
            _logHandler('[Nostr] Malformed signal payload (invalid JSON)', 'error');
            return;
        }

        // ── Validate ──
        if (payload.v !== 1) {
            _logHandler(`[Nostr] Unknown payload version: ${payload.v}`, 'warn');
            return;
        }
        if (!['offer', 'answer', 'ice', 'close', 'message'].includes(payload.type)) {
            _logHandler(`[Nostr] Unknown signal type: ${payload.type}`, 'warn');
            return;
        }

        // ── Chat message — dispatch separately ──
        if (payload.type === 'message') {
            if (_messageHandler) {
                _messageHandler({
                    id: payload.data?.id,
                    text: payload.data?.text,
                    ts: payload.ts,
                    senderPubKey: event.pubkey,
                });
            }
            return;
        }

        // ── Staleness check for ICE ──
        if (payload.type === 'ice') {
            const ageSeconds = (Date.now() - payload.ts) / 1000;
            if (ageSeconds > ICE_STALE_SECONDS) {
                _logHandler(`[Nostr] Dropped stale ICE candidate (${ageSeconds.toFixed(0)}s old)`, 'info');
                return;
            }
        }

        // ── Update timestamp ──
        if (event.created_at > _lastEventTimestamp) {
            _lastEventTimestamp = event.created_at;
            localStorage.setItem(STORAGE_LAST_SEEN_KEY, String(event.created_at));
        }

        // ── Dispatch to handler ──
        if (_signalHandler) {
            _signalHandler({
                type: payload.type,
                session: payload.session,
                data: payload.data,
                ts: payload.ts,
                senderPubKey: event.pubkey,
            });
        }

        _logHandler(`[Nostr] Signal received: ${payload.type} from ${NostrCrypto.truncatePubkey(event.pubkey)}`, 'info');
    }

    /**
     * Clean up ICE counters for a session.
     * @param {string} sessionId
     */
    function clearSession(sessionId) {
        _iceCounters.delete(sessionId);
    }

    /**
     * Get current relay states for UI display.
     * @returns {Array<{url: string, state: string}>}
     */
    function getRelayStates() {
        const list = getRelayList();
        return list.map(url => {
            const relay = _relays.get(url);
            return {
                url,
                state: relay ? relay.state : RelayState.DISCONNECTED,
            };
        });
    }

    /**
     * Get our public key.
     * @returns {string|null}
     */
    function getPublicKey() {
        return _publicKey;
    }

    /**
     * Check if at least one relay is connected.
     * @returns {boolean}
     */
    function isConnected() {
        for (const relay of _relays.values()) {
            if (relay.state === RelayState.CONNECTED) return true;
        }
        return false;
    }

    /**
     * Send an encrypted chat message via Nostr (offline delivery).
     * @param {string} toPubKey - Receiver's public key (hex)
     * @param {Object} message  - { id, text }
     * @returns {Promise<void>}
     */
    async function sendMessage(toPubKey, message) {
        if (!_privateKey || !_publicKey) return;
        const payload = JSON.stringify({
            v: 1,
            type: 'message',
            data: { id: message.id, text: message.text },
            ts: Date.now(),
        });
        const encrypted = await NostrCrypto.encrypt(payload, _privateKey, toPubKey);
        const tags = [
            ['p', toPubKey],
            ['t', 'webrtc'],
            ['v', '1'],
        ];
        const event = await NostrCrypto.createSignedEvent(encrypted, EVENT_KIND, tags, _privateKey);
        await _publishWithRetry(event, 'message', toPubKey);
    }

    /**
     * Subscribe to incoming chat messages.
     * @param {function(Object):void} handler - Called with { id, text, ts, senderPubKey }
     */
    function subscribeMessages(handler) {
        _messageHandler = handler;
    }

    return {
        init,
        connect,
        disconnect,
        sendSignal,
        sendMessage,
        subscribeSignals,
        subscribeMessages,
        clearSession,
        getRelayList,
        addRelay,
        removeRelay,
        resetRelays,
        getRelayStates,
        getPublicKey,
        isConnected,
    };
})();
