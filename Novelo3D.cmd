@echo off
rem Abre o Novelo3D no navegador. Roda direto da pasta do projeto, então sempre mostra a versão mais recente.
rem Para encerrar, feche a janela "Novelo3D - servidor".
cd /d "%~dp0"
if not exist node_modules call npm install
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',5173);$c.Close();exit 0}catch{exit 1}"
if errorlevel 1 start "Novelo3D - servidor" cmd /k "npm run dev"
powershell -NoProfile -Command "for($i=0;$i -lt 80;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',5173);$c.Close();exit 0}catch{Start-Sleep -Milliseconds 500}};exit 1"
start "" http://localhost:5173
