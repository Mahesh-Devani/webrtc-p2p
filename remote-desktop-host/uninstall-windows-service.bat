@echo off
REM ==============================================================================
REM P2P Connect — Windows Background Task Uninstaller
REM ==============================================================================

echo ==========================================================
echo  Uninstalling P2P Connect Windows Background Task
echo ==========================================================

schtasks /Delete /TN "P2PConnectHost" /F

REM Kill any running pythonw instances running bridge.py
taskkill /F /FI "IMAGENAME eq pythonw.exe" 2>nul
taskkill /F /FI "WINDOWTITLE eq *bridge.py*" 2>nul

echo.
echo P2P Connect scheduled task removed.
pause
