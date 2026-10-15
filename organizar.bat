@echo off
rem Organiza a pasta: move o que nao e mais usado para _lixo (nada e apagado; confira e apague voce mesmo)
cd /d "%~dp0"
if not exist _lixo mkdir _lixo
if not exist _lixo\dist-assets mkdir _lixo\dist-assets
for %%F in (dist\assets\*.js dist\assets\*.css) do (
  if /I not "%%~nxF"=="index-CK3gIfYL.js" if /I not "%%~nxF"=="client-Bf0HWwD3.js" if /I not "%%~nxF"=="index-xXMoZAbK.css" move "%%F" _lixo\dist-assets\ >nul
)
rem versao antiga sem React, editor livre e barra 3D, que sairam do projeto
if exist public move public _lixo\public-versao-antiga >nul
if exist editor move editor _lixo\editor-livre >nul
if exist web\dist move web\dist _lixo\web-dist >nul
if exist web\src\od.js move web\src\od.js _lixo\ >nul
if exist web\src\GlassBar.jsx move web\src\GlassBar.jsx _lixo\ >nul
if exist tick.yml move tick.yml _lixo\ >nul
echo Pronto. O que saiu foi para a pasta _lixo.
pause
