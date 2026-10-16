#!/usr/bin/env node
/**
 * P2P Connect — Native OS Remote Desktop Bridge (Node.js)
 * --------------------------------------------------------
 * Translates WebRTC p2p-input events from P2P Connect into native OS
 * mouse clicks, cursor moves, and keystrokes using @nut-tree/nut-js.
 *
 * Requirements:
 *   npm install ws @nut-tree/nut-js
 *
 * Usage:
 *   node bridge.js
 */

import { WebSocketServer } from 'ws';
import { mouse, keyboard, Key, Button, Point } from '@nut-tree/nut-js';

const PORT = process.env.PORT || 9999;
const HOST = '127.0.0.1';

// Fast mouse motion
mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 2000;

let screenWidth = 1920;
let screenHeight = 1080;

try {
  screenWidth = await mouse.screen.width();
  screenHeight = await mouse.screen.height();
} catch (e) {
  console.log('[*] Defaulting to screen size 1920x1080');
}

const wss = new WebSocketServer({ host: HOST, port: PORT });

console.log('='.repeat(60));
console.log('  P2P Connect — Node.js Remote Desktop Bridge');
console.log(`  Listening on: ws://${HOST}:${PORT}`);
console.log(`  Screen Resolution: ${screenWidth} x ${screenHeight}`);
console.log('='.repeat(60));

const BUTTON_MAP = {
  0: Button.LEFT,
  1: Button.MIDDLE,
  2: Button.RIGHT,
};

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`\n[+] Browser connected from ${ip} — OS Remote Control Active!`);

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.t === 'mouse_move') {
        const x = Math.round(data.x * screenWidth);
        const y = Math.round(data.y * screenHeight);
        await mouse.setPosition(new Point(x, y));
      } else if (data.t === 'mouse_down') {
        const btn = BUTTON_MAP[data.btn] || Button.LEFT;
        await mouse.pressButton(btn);
      } else if (data.t === 'mouse_up') {
        const btn = BUTTON_MAP[data.btn] || Button.LEFT;
        await mouse.releaseButton(btn);
      } else if (data.t === 'mouse_click') {
        const btn = BUTTON_MAP[data.btn] || Button.LEFT;
        if (data.dbl) {
          await mouse.doubleClick(btn);
        } else {
          await mouse.click(btn);
        }
      } else if (data.t === 'wheel') {
        if (data.dy > 0) {
          await mouse.scrollDown(Math.abs(Math.round(data.dy / 20)));
        } else if (data.dy < 0) {
          await mouse.scrollUp(Math.abs(Math.round(data.dy / 20)));
        }
      } else if (data.t === 'special_key') {
        if (data.key === 'esc') await keyboard.type(Key.Escape);
        else if (data.key === 'enter') await keyboard.type(Key.Return);
      }
    } catch {
      // Ignore individual event error
    }
  });

  ws.on('close', () => {
    console.log(`[-] Browser disconnected (${ip})`);
  });
});
