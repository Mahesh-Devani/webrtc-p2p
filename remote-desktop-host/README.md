# P2P Connect — Native OS Remote Desktop Host Agent

This directory provides the companion agent that turns **P2P Connect** into a full, OS-level remote desktop solution comparable to or better than **Google Chrome Remote Desktop, AnyDesk, or TeamViewer**.

---

## Architecture Overview

```text
[ Remote Controller ]                [ Host Machine ]
  (Any Browser / Phone)               Browser (host.html) ──(ws://127.0.0.1:9999)──> bridge.py
          │                                     │                                         │
          │ ◄══════ Encrypted WebRTC Video ═════┤ (getDisplayMedia / VP9)                 │
          │          (60 FPS, 15 Mbps, VP9)     │                                         │
          │                                     │                                         │
          ├─────── p2p-input DataChannel ──────►┤                                         ▼
            (mouse, clicks, keys, clipboard)        (Forwards to local bridge)     [ OS Mouse & Keys ]
                                                                                   (Quartz / Win32 / X11)
```

1. **Controller / Client**: Runs 100% inside any web browser (Chrome, Safari, Firefox, Edge, or mobile). No installation required.
2. **WebRTC Transport**: Audio, crisp 60 FPS video (`contentHint: 'detail'`, 15 Mbps), and ultra-low latency input events travel peer-to-peer over WebRTC encrypted channels (zero central server).
3. **Unattended Host Web Agent (`host.html`)**: Runs in Google Chrome/Edge/Brave, connects to Nostr relays, listens for connection requests with PIN authentication, and streams desktop display media.
4. **Zero-Dependency Native Bridge (`bridge.py`)**: Built entirely on standard Python 3 (`asyncio`, `struct`, `ctypes`, `hashlib`). **Zero external pip packages needed!** Features sub-millisecond CoreGraphics Quartz injection (macOS) and Win32 acceleration.

> [!IMPORTANT]
> ### 🖥️ Dual-Mode Architecture: Native On-Demand vs. View-Only Fallback
> 
> **Mode 1: Enhanced Native Mode (`bridge.py` is running)**:
> - **On-Demand Display Wake**: Screen sleeps and locks naturally when idle (zero wasted power). When you connect from your phone or laptop, `bridge.py` wakes the display automatically.
> - **Lock-Screen Remote Login**: Captures macOS/Windows lock screen, allowing you to type your password remotely and log in.
> - **Dynamic Target Selection**: Switch between physical monitors or individual application windows (e.g. VS Code, Terminal) from the remote client on the fly.
> - **Full Remote Control**: Sub-millisecond mouse, keyboard, and clipboard injection.
> 
> **Mode 2: Standalone View-Only Fallback (`bridge.py` is NOT running)**:
> - If you only run `host.html` in your browser without `bridge.py`, you can manually click *"Start Desktop Capture"*.
> - Remote clients can view the real-time screen in **View-Only** mode without input injection.
> - Screen Wake Lock (`navigator.wakeLock`) prevents premature display sleep during manual sharing sessions.

---

## How to Download & Run the Host Agent

You only need `bridge.py` running on the **computer you want to control**. Choose whichever method is easiest:

### Method 1: Download from Web UI (Fastest)
1. Open the Host Agent page:
   - On GitHub Pages: [https://mahesh-devani.github.io/webrtc-p2p/host.html](https://mahesh-devani.github.io/webrtc-p2p/host.html)
   - Or locally: `http://localhost:8080/host.html`
2. Choose your download:
   - **⬇️ Download bridge.py**: Single zero-dependency Python script.
   - **📦 Download Complete Package (.zip)**: Complete package (`remote-desktop-host.zip`) including `bridge.py`, launcher `start-host.sh`, background service scripts (macOS LaunchAgent, Linux systemd, Windows Task Scheduler), and documentation.
3. Open Terminal or Command Prompt in your Downloads folder and run:
   ```bash
   python3 bridge.py
   ```
4. The bridge status indicator on the web page will immediately switch to **🟢 Active**!

---

### Method 2: One-Liner Terminal Command (No Git Clone Needed)

#### macOS & Linux:
```bash
curl -sSL https://raw.githubusercontent.com/mahesh-devani/webrtc-p2p/main/remote-desktop-host/bridge.py -o bridge.py && python3 bridge.py
```

#### Windows (PowerShell):
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mahesh-devani/webrtc-p2p/main/remote-desktop-host/bridge.py" -OutFile "bridge.py"; python bridge.py
```

---

### Method 3: From Cloned Repository or Unzipped Package (Automated Launcher)

If you have cloned the git repository or extracted `remote-desktop-host.zip`:
```bash
cd remote-desktop-host
./start-host.sh
```
This launcher automatically:
1. Starts the local HTTP server on `http://localhost:8080`.
2. Starts `bridge.py` on `ws://127.0.0.1:9999`.
3. Opens Google Chrome directly into `http://localhost:8080/host.html`.

---

## Pairing & Unattended Remote Control

Once `bridge.py` is running and `host.html` shows **Active**:

1. **Configure Host**:
   - Set a **Device Name** (e.g., `MacBook Pro - Work`).
   - **Access Password**: Requires 8–24 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character. A strong secure password is automatically generated on first load, or you can click **🎲 Generate** or type your own.
2. **Authorize Client (Whitelist Enforced by Default)**:
   - For zero-trust security, the **Authorized Clients Whitelist is active by default**.
   - If the whitelist is empty, all incoming remote desktop connection attempts are blocked.
   - On the client device (e.g., phone or laptop), copy the **Client ID** (from *Add Remote Computer*) and add it to the host's **Authorized Clients** list.
3. **Get Host Public Key**:
   - Click **Copy Host Public Key** (or scan the pairing QR code from a mobile phone). Your host and client on the same computer share the exact same Nostr Public Key!
4. **Connect from Client Device**:
   - On any phone, tablet, or another computer, open [P2P Connect](https://mahesh-devani.github.io/webrtc-p2p/).
   - In the sidebar, expand **My Remote Desktops** and click **Add Remote Computer**.
   - Paste the Host Public Key, enter the password, and click **Save Computer**.
5. **Start Remote Session**:
   - Click **⚡ Connect** on the saved computer card to take full remote control with crisp 60 FPS video and synchronized system audio!

---

## Security & Defense-in-Depth

The host bridge incorporates multiple layers of security to prevent unauthorized access:

1. **Zero-Dependency Core**: No third-party pip dependencies that could introduce supply-chain vulnerabilities. Uses Python's standard library.
2. **Cross-Site WebSocket Hijacking (CSWSH) Protection**: The bridge validates the HTTP `Origin` header during the WebSocket handshake. Malicious third-party websites cannot connect to your local bridge.
3. **Emergency Panic Failsafe**: Slam your physical mouse into any of the 4 screen corners to instantly terminate the remote control session.
4. **Client Nostr Whitelist (Zero-Trust, Enforced by Default)**:
   - Whitelist is **enabled by default**. If empty, all incoming connection signals are blocked.
   - Any connection attempt from an unlisted public key is **dropped immediately before decryption**.
5. **Strong Password Complexity**: 8–24 characters (uppercase, lowercase, number, special character) verified dynamically on every incoming handshake.
6. **Local Loopback Isolation**: By default, the bridge only accepts connections from the local machine and permitted web origins.

---

## Operating System Permissions (First Run)

### macOS
1. **Screen Recording**: When you click *Start Desktop Capture*, macOS will prompt you to allow your browser (Chrome/Edge/Brave) in:
   - *System Settings > Privacy & Security > Screen Recording*
2. **Accessibility**: When `bridge.py` attempts to inject its first mouse click or keystroke, macOS will prompt you to allow Terminal / Python in:
   - *System Settings > Privacy & Security > Accessibility*
   *(Required for OS-level mouse and keyboard input synthesis).*

### Windows
- Works out of the box with native Win32 API.
- If you need to interact with elevated UAC prompts or Task Manager, run PowerShell / Command Prompt as **Administrator**.

### Linux
- Works natively on X11 environments.

---

## Running as a Persistent Background Service

To use your computer like a true remote machine (comparable to Chrome Remote Desktop or TeamViewer), you can install P2P Connect Host as an **automatic background service**. It will start automatically when your computer powers on or logs in, keep running silently without an open terminal, and automatically restart if closed.

---

### macOS (LaunchAgent)

macOS manages background user services via `launchd`. We provide automated install and uninstall scripts:

#### 1. Install & Start Service
```bash
cd remote-desktop-host
./install-service.sh
```
This generates and registers `~/Library/LaunchAgents/com.p2pconnect.host.plist` pointing to `start-host.sh`.

#### 2. Manage the Service
- **Check if running:**
  ```bash
  launchctl list | grep com.p2pconnect.host
  ```
  *(If the first number is a PID, the service is actively running).*
- **View live stdout logs:**
  ```bash
  tail -f /tmp/p2pconnect-host.log
  ```
- **View error logs:**
  ```bash
  tail -f /tmp/p2pconnect-host.err
  ```
- **Temporarily stop service:**
  ```bash
  launchctl unload ~/Library/LaunchAgents/com.p2pconnect.host.plist
  ```
- **Start service again:**
  ```bash
  launchctl load ~/Library/LaunchAgents/com.p2pconnect.host.plist
  ```

#### 3. Uninstall
```bash
./remote-desktop-host/uninstall-service.sh
```

---

### Linux (systemd User Service)

Modern Linux distributions (Ubuntu, Debian, Fedora, Arch, CentOS) use `systemd` user units:

#### 1. Install & Start Service
```bash
cd remote-desktop-host
./install-linux-service.sh
```
This installs `~/.config/systemd/user/p2pconnect-host.service` and enables persistent user lingering (`loginctl enable-linger $USER`).

#### 2. Useful systemd Commands
- **Check service status:**
  ```bash
  systemctl --user status p2pconnect-host
  ```
- **Follow real-time journal logs:**
  ```bash
  journalctl --user -u p2pconnect-host -f
  ```
- **Restart service:**
  ```bash
  systemctl --user restart p2pconnect-host
  ```
- **Stop service:**
  ```bash
  systemctl --user stop p2pconnect-host
  ```

#### 3. Uninstall
```bash
./remote-desktop-host/uninstall-service.sh
```

---

### Windows (Task Scheduler & pythonw)

On Windows, background tasks can be registered using Windows Task Scheduler to run silently on user logon using `pythonw.exe` (which runs without opening a command prompt window):

#### 1. Install via Batch Script (Recommended)
1. Navigate to the `remote-desktop-host` folder.
2. Double-click **`install-windows-service.bat`** (or right-click and choose **Run as administrator**).
3. The script registers a task named `P2PConnectHost` that runs `pythonw.exe bridge.py` on logon with highest privileges.

#### 2. Manual Setup via PowerShell / Command Prompt
```cmd
schtasks /Create /TN "P2PConnectHost" /TR "pythonw.exe C:\path\to\webrtc-p2p\remote-desktop-host\bridge.py" /SC ONLOGON /RL HIGHEST /F
schtasks /Run /TN "P2PConnectHost"
```

#### 3. Manage & Check Status
- Open the Windows **Task Scheduler** app (`taskschd.msc`).
- Look for `P2PConnectHost` in the Task Scheduler Library.
- You can right-click to **Run**, **End**, or view task history.

#### 4. Uninstall
Double-click **`uninstall-windows-service.bat`**, or run:
```cmd
schtasks /Delete /TN "P2PConnectHost" /F
```

