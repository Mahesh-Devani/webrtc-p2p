/**
 * nostr-crypto.js — Nostr identity, key management, NIP-44 encryption, event signing.
 *
 * Uses nostr-tools (loaded from esm.sh CDN) for secp256k1 operations.
 * All keys are hex-encoded strings. Private keys are 32-byte scalars,
 * public keys are 32-byte x-only coordinates (no '02' prefix).
 *
 * Exports: NostrCrypto singleton
 */

'use strict';

// ── Dynamic imports from esm.sh CDN ─────────────────────────────
// These are loaded once on first use and cached.
let _nostrTools = null;
let _nip44 = null;

async function loadNostrTools() {
    if (_nostrTools && _nip44) return { nostrTools: _nostrTools, nip44: _nip44 };
    const [nostrMod, nip44Mod] = await Promise.all([
        import('https://esm.sh/nostr-tools@2.10.4/pure'),
        import('https://esm.sh/nostr-tools@2.10.4/nip44'),
    ]);
    _nostrTools = nostrMod;
    _nip44 = nip44Mod;
    return { nostrTools: _nostrTools, nip44: _nip44 };
}

// ── Storage keys ─────────────────────────────────────────────────
const STORAGE_KEY_PRIV = 'nostr-privkey';
const STORAGE_KEY_PUB = 'nostr-pubkey';

export const NostrCrypto = (() => {

    /**
     * Generate a new Nostr keypair.
     * @returns {Promise<{ privateKey: string, publicKey: string }>}
     *   Both keys are lowercase hex strings (64 chars each).
     */
    async function generateKeypair() {
        const { nostrTools } = await loadNostrTools();
        const sk = nostrTools.generateSecretKey();          // Uint8Array(32)
        const privHex = bytesToHex(sk);
        const pubHex = nostrTools.getPublicKey(sk);          // hex string
        return { privateKey: privHex, publicKey: pubHex };
    }

    /**
     * Load existing identity from localStorage, or generate and persist a new one.
     * @returns {Promise<{ privateKey: string, publicKey: string }>}
     */
    async function loadOrCreateIdentity() {
        let privHex = localStorage.getItem(STORAGE_KEY_PRIV);
        let pubHex = localStorage.getItem(STORAGE_KEY_PUB);

        if (privHex && pubHex) {
            return { privateKey: privHex, publicKey: pubHex };
        }

        const kp = await generateKeypair();
        localStorage.setItem(STORAGE_KEY_PRIV, kp.privateKey);
        localStorage.setItem(STORAGE_KEY_PUB, kp.publicKey);
        return kp;
    }

    /**
     * Replace current identity with a fresh keypair.
     * @returns {Promise<{ privateKey: string, publicKey: string }>}
     */
    async function regenerateIdentity() {
        const kp = await generateKeypair();
        localStorage.setItem(STORAGE_KEY_PRIV, kp.privateKey);
        localStorage.setItem(STORAGE_KEY_PUB, kp.publicKey);
        return kp;
    }

    /**
     * Derive public key from a private key hex string.
     * @param {string} privHex
     * @returns {Promise<string>}
     */
    async function getPublicKey(privHex) {
        const { nostrTools } = await loadNostrTools();
        return nostrTools.getPublicKey(hexToBytes(privHex));
    }

    /**
     * NIP-44 encrypt plaintext for a receiver.
     * @param {string} plaintext   - UTF-8 string to encrypt
     * @param {string} senderPrivHex  - sender's private key (hex)
     * @param {string} receiverPubHex - receiver's public key (hex)
     * @returns {Promise<string>} - NIP-44 encrypted payload (base64)
     */
    async function encrypt(plaintext, senderPrivHex, receiverPubHex) {
        const { nip44 } = await loadNostrTools();
        const convKey = nip44.v2.utils.getConversationKey(
            hexToBytes(senderPrivHex),
            receiverPubHex
        );
        return nip44.v2.encrypt(plaintext, convKey);
    }

    /**
     * NIP-44 decrypt a payload from a sender.
     * @param {string} ciphertext     - NIP-44 encrypted payload (base64)
     * @param {string} receiverPrivHex - receiver's private key (hex)
     * @param {string} senderPubHex    - sender's public key (hex)
     * @returns {Promise<string>} - decrypted UTF-8 string
     */
    async function decrypt(ciphertext, receiverPrivHex, senderPubHex) {
        const { nip44 } = await loadNostrTools();
        const convKey = nip44.v2.utils.getConversationKey(
            hexToBytes(receiverPrivHex),
            senderPubHex
        );
        return nip44.v2.decrypt(ciphertext, convKey);
    }

    /**
     * Create and sign a Nostr event.
     * @param {string} content  - event content (usually encrypted)
     * @param {number} kind     - event kind number
     * @param {string[][]} tags - array of tag arrays e.g. [["p","abc"],["t","webrtc"]]
     * @param {string} privHex  - signer's private key (hex)
     * @returns {Promise<Object>} - signed Nostr event object
     */
    async function createSignedEvent(content, kind, tags, privHex) {
        const { nostrTools } = await loadNostrTools();
        const sk = hexToBytes(privHex);
        const event = {
            kind,
            tags,
            content,
            created_at: Math.floor(Date.now() / 1000),
        };
        return nostrTools.finalizeEvent(event, sk);
    }

    /**
     * Verify a Nostr event's signature.
     * @param {Object} event - Nostr event object with id, sig, pubkey
     * @returns {Promise<boolean>}
     */
    async function verifyEvent(event) {
        const { nostrTools } = await loadNostrTools();
        return nostrTools.verifyEvent(event);
    }

    // ── Hex / byte utilities ─────────────────────────────────────
    function bytesToHex(bytes) {
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    }

    /**
     * Truncate a pubkey for display: first8...last8
     * @param {string} pubHex
     * @returns {string}
     */
    function truncatePubkey(pubHex) {
        if (!pubHex || pubHex.length < 16) return pubHex || '';
        return pubHex.slice(0, 8) + '…' + pubHex.slice(-8);
    }

    /**
     * Preload nostr-tools so subsequent calls are instant.
     * Call this early (e.g. on page load).
     */
    async function preload() {
        await loadNostrTools();
    }

    return {
        generateKeypair,
        loadOrCreateIdentity,
        regenerateIdentity,
        getPublicKey,
        encrypt,
        decrypt,
        createSignedEvent,
        verifyEvent,
        truncatePubkey,
        preload,
    };
})();
