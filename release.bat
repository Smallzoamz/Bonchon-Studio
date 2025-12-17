@echo off
setlocal
title Bonchon Launcher Release Automation
color 0b

echo ====================================================
echo      BONCHON LAUNCHER - RELEASE AUTOMATION
echo ====================================================
echo.

:: 1. Auto-Generate Commit Message
echo Generating commit message from changed files...
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$files = git status --porcelain | ForEach-Object { if ($_ -match '.. (.*)') { $matches[1] } }; if (-not $files) { 'No changes' } else { $names = $files | ForEach-Object { [System.IO.Path]::GetFileName($_) } | Select-Object -Unique; 'Update: ' + ($names -join ', ') }"`) do set "auto_msg=%%i"

echo Suggested Message: %auto_msg%
set /p msg="Enter commit message (Press Enter to use suggestion): "
if "%msg%"=="" set "msg=%auto_msg%"

if "%msg%"=="No changes" (
    echo No changes detected to commit.
)

:: 2. Ask for Tag Version
set /p tag="Enter version tag (e.g., v1.0.1): "
if "%tag%"=="" (
    echo Tag version cannot be empty!
    pause
    exit /b
)

echo.
echo ====================================================
echo SUMMARY:
echo Commit Message: %msg%
echo Version Tag:    %tag%
echo ====================================================
echo.

set /p confirm="Do you want to proceed? (Y/N): "
if /i not "%confirm%"=="Y" (
    echo.
    echo Operation cancelled by user.
    pause
    exit /b
)

echo.
echo [1/4] Staging and Committing changes...
git add -A
git commit -m "%msg%"
if %errorlevel% neq 0 (
    echo Commit failed. Check if there are changes to commit.
    :: Continue anyway as there might be no changes but the user wants to push/tag
)

echo.
echo [2/4] Pushing to main branch...
git push origin main
if %errorlevel% neq 0 (
    echo Push to main failed.
    pause
    exit /b
)

echo.
echo [3/4] Managing Tag %tag%...
:: Delete local tag if exists
git tag -d %tag% 2>nul
:: Delete remote tag
git push origin :%tag% 2>nul

:: Create and push new tag
git tag %tag%
git push origin %tag%
if %errorlevel% neq 0 (
    echo Tag push failed.
    pause
    exit /b
)

echo.
echo ====================================================
echo      SUCCESS! RELEASE %tag% TRIGGERED.
echo ====================================================
echo Check progress at: https://github.com/Smallzoamz/Bonchon-Studio/actions
echo.
pause
