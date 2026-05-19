@echo off
setlocal enabledelayedexpansion

set "ROOT=C:\Users\gmaxwe967\Dashboard"
set "REPO=%ROOT%\repo"
set "ENVFILE=%ROOT%\.env"
set "LOG=%ROOT%\logs\refresh.log"

if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"

echo.
echo ===================================================
echo  Dashboard Weekly Refresh
echo  Time: %date% %time%
echo ===================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not on your PATH.
    echo Install Python 3.11 from https://python.org and check "Add to PATH".
    echo.
    pause
    exit /b 3
)

if not exist "%REPO%" (
    echo [ERROR] Repo not found at %REPO%
    echo Run: cd %ROOT% ^&^& git clone https://github.com/gerrmaxw/political-spend-dashboard.git repo
    echo.
    pause
    exit /b 4
)

if not exist "%ENVFILE%" (
    echo [ERROR] Missing %ENVFILE%
    echo Create it with one line: FEC_API_KEY=your-key-here
    echo civicapi.org needs no key.
    echo.
    pause
    exit /b 2
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENVFILE%") do (
    set "%%A=%%B"
)

if not defined FEC_API_KEY (
    echo [ERROR] FEC_API_KEY not found in %ENVFILE%
    echo The file should contain: FEC_API_KEY=your-key-here
    echo.
    pause
    exit /b 2
)

if not defined REFRESH_FEC_API set "REFRESH_FEC_API=1"
if not defined REFRESH_CIVIC_API set "REFRESH_CIVIC_API=1"
if not defined SKIP_FEC_IE set "SKIP_FEC_IE=1"
if not defined SKIP_CIVIC_API set "SKIP_CIVIC_API=1"

cd /d "%REPO%"

echo. >> "%LOG%"
echo [%date% %time%] Starting refresh >> "%LOG%"
echo Running Python ETL... (this takes 10-20 minutes)
echo Output is being written to %LOG%
echo.

python -u "Political Spend Dashboard\etl\build_final_weekly_model.py" 1>> "%LOG%" 2>&1
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo [%date% %time%] FAILED with exit code %EXITCODE% >> "%LOG%"
    echo.
    echo [ERROR] Python script failed with exit code %EXITCODE%
    echo Last 30 lines of the log:
    echo ---------------------------------------------------
    powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 30"
    echo ---------------------------------------------------
    echo Full log: %LOG%
    echo.
    pause
    exit /b 1
)

if exist "%REPO%\Political Spend Dashboard\data\curated" (
    xcopy /Y /I "%REPO%\Political Spend Dashboard\data\curated\*" "%ROOT%\curated\" >nul
)
if exist "%REPO%\Political Spend Dashboard\data\qa" (
    xcopy /Y /I "%REPO%\Political Spend Dashboard\data\qa\*"      "%ROOT%\qa\"      >nul
)
if exist "%REPO%\Claude Political Dashboard Design\data.bundle.js" (
    copy /Y "%REPO%\Claude Political Dashboard Design\data.bundle.js" "%ROOT%\bundles\" >nul
)
if exist "%REPO%\Political Spend Dashboard\outputs\PoliticalSpendDashboard.xlsx" (
    copy /Y "%REPO%\Political Spend Dashboard\outputs\PoliticalSpendDashboard.xlsx" "%ROOT%\bundles\" >nul
)

echo [%date% %time%] OK >> "%LOG%"
echo.
echo ===================================================
echo  Done.
echo  Curated outputs: %ROOT%\curated
echo  QA snapshots:    %ROOT%\qa
echo  HTML bundle:     %ROOT%\bundles\data.bundle.js
echo  Full log:        %LOG%
echo ===================================================
echo.
echo Press any key to close this window...
pause >nul
endlocal
