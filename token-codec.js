/**
 * token-codec.js — Encode / decode signaling tokens.
 *
 * Tokens are base64url‑encoded JSON payloads containing:
 *   { type, sdp, candidates[], ts, v }
 *
 * "v" is a codec version for forward compatibility.
 */

'use strict';

const TokenCodec = (() => {
  const VERSION = 1;
  const PREFIX  = 'P2P1-'; // human‑recognisable prefix

  /**
   * Encode an object into a shareable token string.
   * @param {'offer'|'answer'|'ice'} type
   * @param {RTCSessionDescription|null} sdp
   * @param {RTCIceCandidate[]} candidates
   * @returns {string}
   */
  function encode(type, sdp, candidates = []) {
    const payload = {
      v: VERSION,
      t: type,
      ts: Date.now(),
      s: sdp ? { type: sdp.type, sdp: sdp.sdp } : null,
      c: candidates.map(c => ({
        candidate:     c.candidate,
        sdpMid:        c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      })),
    };
    const json = JSON.stringify(payload);
    const b64  = btoa(unescape(encodeURIComponent(json)));
    // base64url: replace +/ with -_ and strip padding
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return PREFIX + b64url;
  }

  /**
   * Decode a token string back into its payload.
   * @param {string} token
   * @returns {{ type: string, sdp: RTCSessionDescriptionInit|null, candidates: RTCIceCandidateInit[], ts: number }}
   * @throws {Error} on invalid input
   */
  function decode(token) {
    if (typeof token !== 'string') throw new Error('Token must be a string.');
    token = token.trim();
    if (!token.startsWith(PREFIX)) throw new Error('Invalid token format — missing prefix.');
    let b64url = token.slice(PREFIX.length);
    // restore base64 from base64url
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    let json;
    try {
      json = decodeURIComponent(escape(atob(b64)));
    } catch {
      throw new Error('Token decoding failed — corrupted data.');
    }
    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      throw new Error('Token contains invalid JSON.');
    }
    if (payload.v !== VERSION) {
      throw new Error(`Unsupported token version (got ${payload.v}, expected ${VERSION}).`);
    }
    if (!['offer', 'answer', 'ice'].includes(payload.t)) {
      throw new Error(`Unknown token type: "${payload.t}".`);
    }
    return {
      type:       payload.t,
      sdp:        payload.s,
      candidates: Array.isArray(payload.c) ? payload.c : [],
      ts:         payload.ts,
    };
  }

  return { encode, decode };
})();
