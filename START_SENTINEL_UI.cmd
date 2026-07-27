@echo off
setlocal
title Sentinel Phone UI and C2 Backend
cd /d "%~dp0"
set "C2_HOST=0.0.0.0"
set "C2_PORT=3001"
set "SENTINEL_REQUIRE_PAIRING=1"
if "%SIM_GATEWAY_URL%"=="" (
  for /f "tokens=1" %%I in ('wsl.exe -d Drone-C2-Ubuntu-24.04 -u nsfyusuf -- hostname -I') do (
    set "SIM_GATEWAY_URL=http://%%I:8080"
    goto gateway_found
  )
)
:gateway_found
if "%SIM_GATEWAY_URL%"=="" set "SIM_GATEWAY_URL=http://127.0.0.1:8080"
echo Building the phone-ready landscape UI...
call npm run build
if errorlevel 1 exit /b 1
echo.
echo Starting Sentinel on all laptop network interfaces.
echo Open http://LAPTOP-IP:3001 on the phone and enter the pairing code below.
echo Simulator gateway: %SIM_GATEWAY_URL%
echo.
call npm start
