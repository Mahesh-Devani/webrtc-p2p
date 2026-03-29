/**
 * chat-store.js — Persistent chat storage using localStorage.
 *
 * Stores messages per contact (keyed by pubkey).
 * Provides import/export for backup/restore.
 *
 * Message schema:
 *   { id, text, sender, ts, status, type, fileName? }
 *
 * Exports: ChatStore singleton
 */

'use strict';

const CHAT_PREFIX = 'chat-';
const MAX_MESSAGES_PER_CONTACT = 500;

export const ChatStore = (() => {

    /**
     * Get all messages for a contact.
     * @param {string} pubkey - Contact's public key (hex)
     * @returns {Array<Object>} Array of message objects, sorted by timestamp
     */
    function getMessages(pubkey) {
        try {
            const raw = localStorage.getItem(CHAT_PREFIX + pubkey);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }

    /**
     * Save all messages for a contact.
     * @private
     * @param {string} pubkey
     * @param {Array} messages
     */
    function _saveMessages(pubkey, messages) {
        // Trim to max limit (keep most recent)
        if (messages.length > MAX_MESSAGES_PER_CONTACT) {
            messages = messages.slice(-MAX_MESSAGES_PER_CONTACT);
        }
        try {
            localStorage.setItem(CHAT_PREFIX + pubkey, JSON.stringify(messages));
        } catch (e) {
            console.error('[ChatStore] Storage full or error:', e);
        }
    }

    /**
     * Add a message to a contact's chat history.
     * @param {string} pubkey - Contact's public key
     * @param {Object} message - { id, text, sender, ts, status, type, fileName? }
     */
    function addMessage(pubkey, message) {
        const messages = getMessages(pubkey);
        // Prevent duplicates
        if (message.id && messages.some(m => m.id === message.id)) return;
        messages.push(message);
        _saveMessages(pubkey, messages);
    }

    /**
     * Update a message's status (e.g., sent → delivered).
     * @param {string} pubkey
     * @param {string} messageId
     * @param {string} newStatus
     */
    function updateMessageStatus(pubkey, messageId, newStatus) {
        const messages = getMessages(pubkey);
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
            msg.status = newStatus;
            _saveMessages(pubkey, messages);
        }
    }

    /**
     * Get the last message for a contact (for list preview).
     * @param {string} pubkey
     * @returns {Object|null}
     */
    function getLastMessage(pubkey) {
        const messages = getMessages(pubkey);
        return messages.length > 0 ? messages[messages.length - 1] : null;
    }

    /**
     * Clear all messages for a contact.
     * @param {string} pubkey
     */
    function clearChat(pubkey) {
        localStorage.removeItem(CHAT_PREFIX + pubkey);
    }

    /**
     * Get all pubkeys that have stored chats.
     * @returns {string[]}
     */
    function getAllChatPubkeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(CHAT_PREFIX)) {
                keys.push(key.slice(CHAT_PREFIX.length));
            }
        }
        return keys;
    }

    /**
     * Export all chats as a JSON-serializable object.
     * @returns {Object} { version, exportedAt, chats: { pubkey: messages[] } }
     */
    function exportAllChats() {
        const chats = {};
        const pubkeys = getAllChatPubkeys();
        for (const pk of pubkeys) {
            chats[pk] = getMessages(pk);
        }
        return {
            version: 1,
            exportedAt: Date.now(),
            chats,
        };
    }

    /**
     * Import chats from a backup object. Merges with existing.
     * @param {Object} backup - { version, chats: { pubkey: messages[] } }
     * @param {boolean} replace - If true, replace existing chats. Otherwise merge.
     */
    function importChats(backup, replace = false) {
        if (!backup || backup.version !== 1 || !backup.chats) {
            throw new Error('Invalid backup format');
        }
        for (const [pubkey, messages] of Object.entries(backup.chats)) {
            if (!Array.isArray(messages)) continue;
            if (replace) {
                _saveMessages(pubkey, messages);
            } else {
                // Merge: add messages not already present
                const existing = getMessages(pubkey);
                const existingIds = new Set(existing.map(m => m.id));
                for (const msg of messages) {
                    if (!existingIds.has(msg.id)) {
                        existing.push(msg);
                    }
                }
                existing.sort((a, b) => a.ts - b.ts);
                _saveMessages(pubkey, existing);
            }
        }
    }

    /**
     * Get approximate storage usage.
     * @returns {{ used: number, chatBytes: number }}
     */
    function getStorageUsage() {
        let chatBytes = 0;
        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key);
            const size = (key.length + val.length) * 2; // UTF-16
            totalBytes += size;
            if (key.startsWith(CHAT_PREFIX)) {
                chatBytes += size;
            }
        }
        return { used: totalBytes, chatBytes };
    }

    return {
        getMessages,
        addMessage,
        updateMessageStatus,
        getLastMessage,
        clearChat,
        getAllChatPubkeys,
        exportAllChats,
        importChats,
        getStorageUsage,
    };
})();
