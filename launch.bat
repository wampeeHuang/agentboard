@echo off
start "" /min node "%~dp0server.js"
start http://localhost:3099
