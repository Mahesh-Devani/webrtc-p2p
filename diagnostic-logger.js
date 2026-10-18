/**
 * diagnostic-logger.js — Structured In-Memory Diagnostic Logger & Logpkg Generator
 *
 * Provides a 1,000-event rolling ring buffer, console telemetry interception,
 * WebRTC stats harvesting, and 1-click diagnostic package export with strict
 * privacy redaction (zero private keys or message bodies exported).
 */

export const DiagnosticLogger = (() => {
  const MAX_LOGS = 1000;
  const _logs = [];
  const _listeners = new Set();

  // Known private key patterns to redact
  const REDACT_KEYS = [
    'nostr-privkey',
    'p2p-host-privkey',
    'p2p-client-privkey',
  ];

  let _installed = false;
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  /**
   * Redact sensitive private keys, PINs, and passwords from log strings.
   * @param {string} text
   * @returns {string}
   */
  function redact(text) {
    if (typeof text !== 'string') {
      try {
        text = JSON.stringify(text);
      } catch {
        text = String(text);
      }
    }

    // Redact stored private keys from localStorage if present
    for (const storageKey of REDACT_KEYS) {
      try {
        const secret = localStorage.getItem(storageKey);
        if (secret && secret.length >= 16) {
          text = text.replaceAll(secret, '[REDACTED_PRIVKEY]');
        }
      } catch { }
    }

    // Redact nsec / private key hex patterns (64-char hex following privkey/secret/pin)
    text = text.replace(/(?:pin|password|privkey|nsec)[\s:=]+["']?([a-zA-Z0-9_\-!@#$%^&*]{4,})["']?/gi, (m, val) => {
      return m.replace(val, '[REDACTED]');
    });

    return text;
  }

  /**
   * Determine tag category from message content
   * @param {string} msg
   * @returns {string}
   */
  function extractTag(msg) {
    if (typeof msg !== 'string') return 'System';
    if (msg.includes('[Nostr Security]')) return 'Nostr-Security';
    if (msg.includes('[Nostr]')) return 'Nostr';
    if (msg.includes('[Signaling]')) return 'Signaling';
    if (msg.includes('[WebRTC]')) return 'WebRTC';
    if (msg.includes('[Host]')) return 'Host';
    if (msg.includes('[Bridge]')) return 'Bridge';
    if (msg.includes('[Lifecycle]')) return 'Lifecycle';
    if (msg.includes('[RD]')) return 'RemoteDesktop';
    if (msg.includes('[FileTransfer]')) return 'FileTransfer';
    return 'General';
  }

  /**
   * Format any argument into a readable string, preserving Error message and stack.
   * @param {any} a
   * @returns {string}
   */
  function formatArg(a) {
    if (a instanceof Error) {
      const name = a.name || 'Error';
      const msg = a.message || '';
      const stack = a.stack ? `\n${a.stack}` : '';
      return `${name}: ${msg}${stack}`;
    }
    if (typeof a === 'object' && a !== null) {
      if (a.message && (a.stack || a.name)) {
        return `${a.name || 'Error'}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      }
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  }

  /**
   * Record a structured log event in the ring buffer.
   * @param {'info'|'warn'|'error'|'debug'} level
   * @param {Array<any>} args
   */
  function record(level, args) {
    try {
      const parts = args.map(a => redact(formatArg(a)));
      const message = parts.join(' ');
      const tag = extractTag(message);

      const entry = {
        id: _logs.length + 1,
        ts: Date.now(),
        time: new Date().toISOString(),
        level,
        tag,
        message,
      };

      _logs.push(entry);
      if (_logs.length > MAX_LOGS) {
        _logs.shift();
      }

      for (const listener of _listeners) {
        try { listener(entry); } catch { }
      }
    } catch { }
  }

  /**
   * Intercept window.console methods
   */
  function installConsoleInterceptor() {
    if (_installed) return;
    _installed = true;

    console.log = (...args) => {
      record('info', args);
      originalConsole.log(...args);
    };
    console.info = (...args) => {
      record('info', args);
      originalConsole.info(...args);
    };
    console.warn = (...args) => {
      record('warn', args);
      originalConsole.warn(...args);
    };
    console.error = (...args) => {
      record('error', args);
      originalConsole.error(...args);
    };

    record('info', ['[DiagnosticLogger] Console telemetry interceptor installed (1000-event ring buffer active)']);
  }

  /**
   * Subscribe to new log events (e.g. for live UI log stream)
   * @param {function(Object):void} callback
   * @returns {function():void} unsubscribe
   */
  function subscribe(callback) {
    _listeners.add(callback);
    return () => _listeners.delete(callback);
  }

  /**
   * Get all cached log entries
   * @returns {Array<Object>}
   */
  function getLogs() {
    return [..._logs];
  }

  /**
   * Clear in-memory logs
   */
  function clearLogs() {
    _logs.length = 0;
  }

  /**
   * Inspect active WebRTC PeerSession and harvest candidate pair & telemetry stats
   * @param {Object} [session] PeerSession instance
   * @returns {Promise<Object>}
   */
  async function harvestWebRtcStats(session) {
    if (!session || typeof session.getRawPC !== 'function') {
      return { status: 'No active WebRTC session' };
    }

    const pc = session.getRawPC();
    if (!pc) return { status: 'RTCPeerConnection not available' };

    const info = {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      iceGatheringState: pc.iceGatheringState,
      isChannelOpen: session.isChannelOpen ? session.isChannelOpen() : false,
      localCandidates: [],
      remoteCandidates: [],
      selectedCandidatePair: null,
      stats: {},
    };

    try {
      if (typeof session.getLocalCandidates === 'function') {
        info.localCandidates = session.getLocalCandidates().map(c => ({
          type: c.candidate?.split(' ')?.[7] || 'unknown',
          protocol: c.candidate?.split(' ')?.[2] || 'udp',
          candidate: redact(c.candidate),
        }));
      }

      if (typeof pc.getStats === 'function') {
        const stats = await pc.getStats();
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && (report.selected || report.state === 'succeeded')) {
            info.selectedCandidatePair = {
              state: report.state,
              currentRoundTripTimeMs: report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : null,
              bytesSent: report.bytesSent,
              bytesReceived: report.bytesReceived,
              requestsSent: report.requestsSent,
              responsesReceived: report.responsesReceived,
            };
          } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
            info.stats.videoInbound = {
              framesDecoded: report.framesDecoded,
              framesDropped: report.framesDropped,
              jitter: report.jitter,
              packetsLost: report.packetsLost,
            };
          }
        });
      }
    } catch (err) {
      info.statsError = err.message;
    }

    return info;
  }

  /**
   * Build a comprehensive diagnostic package bundle
   * @param {Object} opts
   * @param {Object} [opts.session] Active PeerSession
   * @param {string} [opts.remotePubKey] Target remote pubkey
   * @param {Array<Object>} [opts.relayList] Relay status list
   * @param {Object} [opts.extra] Additional metadata (e.g. host info)
   * @returns {Promise<Object>}
   */
  async function generateLogPackage({ session, remotePubKey, relayList = [], extra = {} } = {}) {
    const webrtcInfo = await harvestWebRtcStats(session);

    const clientPubKey = (() => {
      try { return localStorage.getItem('nostr-pubkey') || localStorage.getItem('p2p-host-pubkey') || 'unknown'; } catch { return 'unknown'; }
    })();

    const packageBundle = {
      app: 'P2P Connect',
      version: 'v7-multi-flow',
      generatedAt: new Date().toISOString(),
      timestamp: Date.now(),
      identity: {
        clientPubKey,
        targetPubKey: remotePubKey || null,
      },
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        online: navigator.onLine,
        screen: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData,
        } : null,
        webRtcSupported: typeof RTCPeerConnection !== 'undefined',
        cryptoSupported: !!(window.crypto && window.crypto.subtle),
      },
      relays: relayList,
      webrtc: webrtcInfo,
      meta: extra,
      recentLogs: getLogs(),
    };

    return packageBundle;
  }

  /**
   * Trigger browser file download of diagnostic logpkg
   * @param {Object} logpkg - Generated package object
   * @param {string} [customFilename]
   */
  function downloadLogPackage(logpkg, customFilename) {
    const jsonStr = JSON.stringify(logpkg, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = customFilename || `p2p-connect-diagnostic-${ts}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Format a markdown summary for copy/pasting into bug reports
   * @param {Object} logpkg
   * @returns {string}
   */
  function formatMarkdownSummary(logpkg) {
    const env = logpkg.environment || {};
    const rtc = logpkg.webrtc || {};
    const relays = (logpkg.relays || []).map(r => `${r.url}: ${r.state || r.status || 'unknown'}`).join('\n- ') || '(none)';
    const candPair = rtc.selectedCandidatePair ? `RTT ${rtc.selectedCandidatePair.currentRoundTripTimeMs}ms, ${rtc.selectedCandidatePair.state}` : 'None active';

    const recentErrors = (logpkg.recentLogs || [])
      .filter(l => l.level === 'error' || l.level === 'warn')
      .slice(-5)
      .map(l => `[${l.level.toUpperCase()}] ${l.tag}: ${l.message}`)
      .join('\n') || '(no errors)';

    return `### 🐞 P2P Connect Diagnostic Summary
- **App Version**: ${logpkg.version || 'v7'}
- **Generated**: ${logpkg.generatedAt || new Date().toISOString()}
- **OS / Platform**: ${env.platform || 'Unknown'} (${env.language || 'en'})
- **Online**: ${env.online}
- **WebRTC Connection**: \`${rtc.connectionState || 'N/A'}\` (ICE: \`${rtc.iceConnectionState || 'N/A'}\`)
- **Selected Candidate Pair**: ${candPair}
- **Connected Relays**:
- ${relays}
- **Recent Warnings / Errors**:
\`\`\`text
${recentErrors}
\`\`\`
`;
  }

  return {
    installConsoleInterceptor,
    record,
    subscribe,
    getLogs,
    clearLogs,
    harvestWebRtcStats,
    generateLogPackage,
    downloadLogPackage,
    formatMarkdownSummary,
    redact,
  };
})();
