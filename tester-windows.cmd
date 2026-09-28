@echo off
rem Lance tous les tests automatiques de Thèse sur ce PC (double-clic).
rem Demande Node.js 22 et Rust (rustup) ; sans eux, propose le bouton GitHub à la place.
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "ACTIONS=https://github.com/LucasDavidTPE/These/actions/workflows/tests-windows.yml"

where npm >nul 2>nul || goto :sans_outils
where cargo >nul 2>nul || goto :sans_outils

set ECHECS=
echo.
echo === Dépendances (npm ci) ===
call npm ci || set "ECHECS=!ECHECS! [npm ci]"
echo.
echo === Modèle de détourage (une seule fois, puis en cache) ===
call npm run fetch-models || set "ECHECS=!ECHECS! [modèle]"
echo.
echo === TypeScript ===
call npm run typecheck || set "ECHECS=!ECHECS! [typecheck]"
echo.
echo === Lint ===
call npm run lint || set "ECHECS=!ECHECS! [lint]"
echo.
echo === Tests TypeScript et conformité ===
call npm run test || set "ECHECS=!ECHECS! [tests]"
echo.
echo === Tests Rust ===
pushd src-tauri
cargo test || set "ECHECS=!ECHECS! [cargo test]"
cargo test --no-default-features || set "ECHECS=!ECHECS! [cargo test sans Figures]"
cargo clippy --all-targets -- -D warnings || set "ECHECS=!ECHECS! [clippy]"
popd

echo.
echo ============================================================
if "!ECHECS!"=="" (
  echo   Tous les tests sont verts.
) else (
  echo   En échec :!ECHECS!
  echo   Le détail est plus haut dans cette fenêtre.
)
echo ============================================================
pause
exit /b 0

:sans_outils
echo.
echo Node.js ou Rust n'est pas installé sur ce PC.
echo Les tests peuvent tourner sur une machine Windows de GitHub, sans rien installer :
echo   onglet Actions, « tests-windows », bouton « Run workflow ».
echo.
choice /c ON /m "Ouvrir cette page dans le navigateur (O/N) ?"
if errorlevel 2 exit /b 1
start "" "%ACTIONS%"
exit /b 1
