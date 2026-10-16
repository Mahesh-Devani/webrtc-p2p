@echo off
REM ==============================================================================
REM P2P Connect — Windows Background Task Installer (Task Scheduler)
REM ==============================================================================
REM Schedules bridge.py to run silently in the background on user logon
REM using pythonw.exe (no popup command prompt window).
REM ==============================================================================

echo ==========================================================
echo  Windows Background Task Installer for P2P Connect Host
echo ==========================================================

set "SCRIPT_DIR=%~dp0"
set "BRIDGE_PY=%SCRIPT_DIR%bridge.py"

REM Find pythonw.exe or python.exe
where pythonw >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PYTHON_EXE=pythonw.exe"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "PYTHON_EXE=python.exe"
    ) else (
        echo [ERROR] Python 3 was not found in your PATH.
        echo Please install Python 3 from python.org and check "Add Python to PATH".
        pause
        exit /b 1
    )
)

echo Registering Windows Scheduled Task 'P2PConnectHost'...
schtasks /Create /TN "P2PConnectHost" /TR "\"%PYTHON_EXE%\" \"%BRIDGE_PY%\"" /SC ONLOGON /RL HIGHEST /F

if %ERRORLEVEL% equ 0 (
    echo.
    echo ==========================================================
    echo  SUCCESS! P2P Connect Host is scheduled to run on logon.
    echo ==========================================================
    echo.
    echo Starting the background bridge now...
    schtasks /Run /TN "P2PConnectHost"
    echo.
    echo To uninstall anytime, run: uninstall-windows-service.bat
) else (
    echo.
    echo [ERROR] Failed to create scheduled task.
    echo Please right-click this script and select 'Run as administrator'.
)

pause
