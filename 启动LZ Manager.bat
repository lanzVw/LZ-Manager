@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\main\index.cjs" (
    echo Building LZ Manager...
    call npm run build
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0dist\main\index.cjs"
endlocal
