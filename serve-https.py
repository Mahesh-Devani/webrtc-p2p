#!/usr/bin/env python3
"""
serve-https.py — Zero-Config Local HTTPS Static Server for P2P Connect
======================================================================
Enables WebRTC, camera, microphone, screen sharing (getDisplayMedia),
and crypto.subtle APIs across devices on your local network (LAN) by
serving the app over HTTPS.

Features:
  - Auto-generates self-signed TLS certificates (cert.pem, key.pem) with SAN
  - Detects and prints all local LAN IP addresses (e.g. https://192.168.x.x:8443)
  - Multithreaded request handling for fast parallel ES module loading
  - Clean dev cache headers & proper MIME types
"""

import os
import sys
import ssl
import socket
import subprocess
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"
DEFAULT_PORT = 8443


def get_local_ip_addresses():
    """Retrieve all non-loopback IPv4 addresses of this machine."""
    ips = set()

    # Strategy 1: macOS ipconfig getifaddr on common interfaces
    for iface in ["en0", "en1", "en2", "wlan0", "eth0"]:
        try:
            out = subprocess.check_output(["ipconfig", "getifaddr", iface], stderr=subprocess.DEVNULL).decode().strip()
            if out and not out.startswith("127."):
                ips.add(out)
        except Exception:
            pass

    # Strategy 2: Linux hostname -I
    try:
        out = subprocess.check_output(["hostname", "-I"], stderr=subprocess.DEVNULL).decode().strip()
        for ip in out.split():
            if not ip.startswith("127.") and ":" not in ip:
                ips.add(ip)
    except Exception:
        pass

    # Strategy 3: Connect to a public IP (works when internet connected)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    # Strategy 4: Lookup hostname via gethostbyname_ex
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass

    return sorted(list(ips))


def ensure_certificate(ips):
    """Generate self-signed certificate with Subject Alternative Names if missing."""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return

    print("▶ Generating self-signed TLS certificate (cert.pem & key.pem)...")

    # Build SAN string
    san_list = ["DNS:localhost", "IP:127.0.0.1"]
    for ip in ips:
        san_list.append(f"IP:{ip}")
    san_str = ",".join(san_list)

    cmd = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", KEY_FILE,
        "-out", CERT_FILE,
        "-days", "365",
        "-nodes",
        "-subj", "/CN=localhost",
        "-addext", f"subjectAltName={san_str}"
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✓ Created valid certificate for localhost & network IPs.")
    except Exception as e:
        print(f"⚠️  Could not run openssl with -addext: {e}")
        # Fallback without -addext if using older openssl
        fallback_cmd = [
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", KEY_FILE,
            "-out", CERT_FILE,
            "-days", "365",
            "-nodes",
            "-subj", "/CN=localhost"
        ]
        subprocess.run(fallback_cmd, check=True)
        print("✓ Created fallback certificate.")


class DevHandler(SimpleHTTPRequestHandler):
    """HTTP handler with no-cache headers and modern MIME types."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
    }

    def end_headers(self):
        # Disable caching during development so code changes reflect instantly
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress noisy individual asset GET requests; keep console clean
        pass


def main():
    parser = argparse.ArgumentParser(description="P2P Connect HTTPS Dev Server")
    parser.add_argument("-p", "--port", type=int, default=DEFAULT_PORT, help=f"Port to bind (default: {DEFAULT_PORT})")
    parser.add_argument("-b", "--bind", default="0.0.0.0", help="Address to bind (default: 0.0.0.0)")
    args = parser.parse_args()

    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    ips = get_local_ip_addresses()
    ensure_certificate(ips)

    # Setup SSL Context
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)

    server = ThreadingHTTPServer((args.bind, args.port), DevHandler)
    server.socket = ssl_context.wrap_socket(server.socket, server_side=True)

    print("\n" + "=" * 65)
    print(" 🔒  P2P Connect — HTTPS Secure Server Running")
    print("=" * 65)
    print("\n💻 Local Access (This Machine):")
    print(f"   👉 https://localhost:{args.port}/")
    print(f"   👉 https://127.0.0.1:{args.port}/")

    if ips:
        print("\n📱 Network Access (From Other Devices / Laptops / Phones):")
        for ip in ips:
            print(f"   👉 https://{ip}:{args.port}/")
            print(f"      (Host Mode: https://{ip}:{args.port}/host.html)")

    print("\n⚠️  BROWSER SECURITY NOTICE (Self-Signed Certificate):")
    print("   When opening on another device, the browser will display a warning:")
    print("   • Chrome / Edge: Click 'Advanced' -> 'Proceed to <ip> (unsafe)'")
    print("     (or if no proceed link appears, simply type 'thisisunsafe' on keyboard)")
    print("   • Safari: Click 'Show Details' -> 'visit this website' (enter device password)")
    print("   • Firefox: Click 'Advanced' -> 'Accept the Risk and Continue'")
    print("   Once bypassed, WebRTC, Camera, and Screen Capture work seamlessly!")
    print("=" * 65)
    print("Press Ctrl+C to stop the server.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down HTTPS server...")
        server.server_close()


if __name__ == "__main__":
    main()
