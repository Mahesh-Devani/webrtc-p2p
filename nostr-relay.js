/**
 * nostr-relay.js — Individual Nostr relay WebSocket connection manager.
 *
 * Each NostrRelay instance manages a single WebSocket connection to one relay,
 * with automatic reconnection, subscription management, and event publishing.
 *
 * Exports: NostrRelay class
 */

'use strict';

/**
 * Connection states for a relay.
 * @enum {string}
 */
export const RelayState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
};

/**
 * Manages a WebSocket connection to a single Nostr relay.
 */
export class NostrRelay {
    /**
     * @param {string} url - Relay WebSocket URL (wss://...)
     * @param {Object} [opts]
     * @param {function(string, string):void} [opts.onLog] - (msg, level) logger
     * @param {function(string, RelayState):void} [opts.onStatusChange] - (url, state)
     */
    constructor(url, opts = {}) {
        this.url = url;
        this.state = RelayState.DISCONNECTED;
        this._ws = null;
        this._subscriptions = new Map(); // subId → { filters, onEvent }
        this._pendingPublishes = [];     // { event, resolve, reject }
        this._reconnectTimer = null;
        this._reconnectDelay = 1000;     // start at 1s, max 30s
        this._manualDisconnect = false;
        this._log = opts.onLog || (() => { });
        this._onStatusChange = opts.onStatusChange || (() => { });
        this._subIdCounter = 0;
    }

    /**
     * Connect to the relay. Resolves when WebSocket is open.
     * @returns {Promise<void>}
     */
    connect() {
        if (this.state === RelayState.CONNECTED && this._ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        this._manualDisconnect = false;
        return this._doConnect();
    }

    /** @private */
    _doConnect() {
        return new Promise((resolve, reject) => {
            this._setState(RelayState.CONNECTING);
            this._log(`Connecting to ${this.url}…`, 'info');

            try {
                this._ws = new WebSocket(this.url);
            } catch (err) {
                this._log(`WebSocket creation failed for ${this.url}: ${err.message}`, 'error');
                this._setState(RelayState.DISCONNECTED);
                this._scheduleReconnect();
                reject(err);
                return;
            }

            const onOpen = () => {
                cleanup();
                this._reconnectDelay = 1000; // reset backoff on success
                this._setState(RelayState.CONNECTED);
                this._log(`Connected to ${this.url}`, 'success');
                this._resubscribeAll();
                resolve();
            };

            const onError = (e) => {
                cleanup();
                this._log(`Connection error for ${this.url}`, 'error');
                this._setState(RelayState.DISCONNECTED);
                this._scheduleReconnect();
                reject(new Error(`Failed to connect to ${this.url}`));
            };

            const cleanup = () => {
                this._ws.removeEventListener('open', onOpen);
                this._ws.removeEventListener('error', onError);
                this._ws.addEventListener('error', () => { }); // swallow future errors until full handler
                this._wireSocket();
            };

            this._ws.addEventListener('open', onOpen);
            this._ws.addEventListener('error', onError);
        });
    }

    /** @private — Wire permanent socket event handlers */
    _wireSocket() {
        this._ws.onmessage = (e) => this._handleMessage(e.data);
        this._ws.onclose = () => {
            this._log(`Disconnected from ${this.url}`);
            this._setState(RelayState.DISCONNECTED);
            if (!this._manualDisconnect) {
                this._scheduleReconnect();
            }
        };
        this._ws.onerror = () => {
            this._log(`Socket error on ${this.url}`, 'error');
        };
    }

    /**
     * Disconnect from the relay. Stops reconnection.
     */
    disconnect() {
        this._manualDisconnect = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._ws) {
            try { this._ws.close(); } catch { }
            this._ws = null;
        }
        this._setState(RelayState.DISCONNECTED);
        this._log(`Disconnected from ${this.url}`);
    }

    /**
     * Publish an event to this relay.
     * @param {Object} event - Signed Nostr event
     * @returns {Promise<void>} - Resolves when relay acknowledges (OK message)
     */
    publish(event) {
        return new Promise((resolve, reject) => {
            if (this.state !== RelayState.CONNECTED || !this._ws || this._ws.readyState !== WebSocket.OPEN) {
                reject(new Error(`Relay ${this.url} not connected`));
                return;
            }
            const msg = JSON.stringify(['EVENT', event]);
            this._ws.send(msg);

            // Set a timeout for relay acknowledgment
            const timeout = setTimeout(() => {
                // Remove from pending — no acknowledgment means failure
                const idx = this._pendingPublishes.findIndex(p => p.eventId === event.id);
                if (idx !== -1) this._pendingPublishes.splice(idx, 1);
                reject(new Error(`Publish timeout on ${this.url}`));
            }, 5000);

            this._pendingPublishes.push({
                eventId: event.id,
                resolve: () => { clearTimeout(timeout); resolve(); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
            });
        });
    }

    /**
     * Subscribe to events matching the given filters.
     * @param {Object[]} filters - Array of Nostr filter objects
     * @param {function(Object):void} onEvent - Called for each matching event
     * @returns {string} - Subscription ID (use to unsubscribe)
     */
    subscribe(filters, onEvent) {
        const subId = `sub-${++this._subIdCounter}-${Date.now()}`;
        this._subscriptions.set(subId, { filters, onEvent });

        if (this.state === RelayState.CONNECTED && this._ws?.readyState === WebSocket.OPEN) {
            this._sendSubscription(subId, filters);
        }
        // If not connected, _resubscribeAll() will handle it on reconnect

        return subId;
    }

    /**
     * Close a subscription.
     * @param {string} subId
     */
    unsubscribe(subId) {
        this._subscriptions.delete(subId);
        if (this._ws?.readyState === WebSocket.OPEN) {
            try {
                this._ws.send(JSON.stringify(['CLOSE', subId]));
            } catch { }
        }
    }

    // ── Private helpers ────────────────────────────────────────────

    /** @private */
    _sendSubscription(subId, filters) {
        try {
            this._ws.send(JSON.stringify(['REQ', subId, ...filters]));
        } catch (err) {
            this._log(`Failed to send subscription to ${this.url}: ${err.message}`, 'error');
        }
    }

    /** @private — Resubscribe all active subscriptions after reconnect */
    _resubscribeAll() {
        for (const [subId, { filters }] of this._subscriptions) {
            this._sendSubscription(subId, filters);
        }
    }

    /** @private */
    _handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return; // malformed message
        }

        if (!Array.isArray(msg) || msg.length < 2) return;

        const type = msg[0];

        if (type === 'EVENT') {
            // ['EVENT', subId, event]
            const subId = msg[1];
            const event = msg[2];
            const sub = this._subscriptions.get(subId);
            if (sub && event) {
                sub.onEvent(event);
            }
        } else if (type === 'OK') {
            // ['OK', eventId, success, message]
            const eventId = msg[1];
            const success = msg[2];
            const reason = msg[3] || '';
            const idx = this._pendingPublishes.findIndex(p => p.eventId === eventId);
            if (idx !== -1) {
                const pending = this._pendingPublishes.splice(idx, 1)[0];
                if (success) {
                    pending.resolve();
                } else {
                    const isRateLimit = reason.toLowerCase().includes('rate');
                    const err = new Error(`Relay rejected event: ${reason}`);
                    err.isRateLimit = isRateLimit;
                    pending.reject(err);
                }
            }
        } else if (type === 'EOSE') {
            // End of stored events — subscription is now live
            // No special handling needed
        } else if (type === 'NOTICE') {
            this._log(`Relay notice (${this.url}): ${msg[1]}`, 'warn');
        }
    }

    /** @private — Auto-reconnect with exponential backoff */
    _scheduleReconnect() {
        if (this._manualDisconnect) return;
        if (this._reconnectTimer) return;

        const delay = this._reconnectDelay;
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 30000);

        this._log(`Reconnecting to ${this.url} in ${(delay / 1000).toFixed(1)}s…`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._doConnect().catch(() => { }); // errors handled internally
        }, delay);
    }

    /** @private */
    _setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this._onStatusChange(this.url, newState);
    }
}
