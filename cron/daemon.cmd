@echo off
REM Agentboard daemon — auto-restart on crash
REM Managed by Windows Scheduled Task at user logon

:loop
echo [%date% %time%] Agentboard starting...
node C:\Users\Administrator\.agentboard\server.js
echo [%date% %time%] Agentboard exited (code %ERRORLEVEL%), restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
