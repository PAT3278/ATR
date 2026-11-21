@echo off
rem Double-click to test-play SOUND WALK (muted). The first time, run "npm run setup" in this folder.
cd /d "%~dp0"
call npm run play --silent
