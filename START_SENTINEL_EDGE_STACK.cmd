@echo off
setlocal
title Sentinel Edge, Sensor Simulator, and C2
cd /d "%~dp0"
set "C2_HOST=0.0.0.0"
set "C2_PORT=3001"
set "EDGE_GATEWAY_HOST=0.0.0.0"
set "EDGE_GATEWAY_PORT=8090"
set "EDGE_GATEWAY_URL=http://127.0.0.1:8090"
set "SENSOR_SIM_HOST=0.0.0.0"
set "SENSOR_SIM_PORT=8091"
set "SENSOR_SIM_URL=http://127.0.0.1:8091"
set "SENTINEL_REQUIRE_PAIRING=1"
if "%EDGE_PRODUCER_TOKEN%"=="" set "EDGE_PRODUCER_TOKEN=sentinel-dev-edge-token"
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
echo Starting standalone edge gateway, sensor simulator, and Sentinel C2.
echo Gazebo adapter: %SIM_GATEWAY_URL%
echo Edge gateway: %EDGE_GATEWAY_URL%
echo Sensor simulator: %SENSOR_SIM_URL%
echo Sentinel UI: http://LAPTOP-IP:3001
echo.
call npm run start:stack
