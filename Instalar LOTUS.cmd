@echo off
rem Prepara o LOTUS AI em um computador novo (ex.: o do socio).
rem Antes: instale Node.js 22+ (nodejs.org), Git e Python 3.11+ (python.org),
rem e copie o arquivo apps\web\.env.local do computador principal (troque OWNER_EMAIL/OWNER_PASSWORD/OWNER_NAME pelos dados de quem vai usar).
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e rode de novo. & pause & exit /b 1)
where pnpm >nul 2>nul || (echo Instalando o pnpm... & call npm install -g pnpm)

if not exist "apps\web\.env.local" (
  echo [ERRO] Falta o arquivo apps\web\.env.local.
  echo Copie o apps\web\.env.example para apps\web\.env.local e preencha,
  echo usando o MESMO DATABASE_URL do computador principal e o SEU email e senha em OWNER_EMAIL / OWNER_PASSWORD.
  pause
  exit /b 1
)

echo [1/4] Instalando dependencias (pode levar alguns minutos)...
call pnpm install || (echo [ERRO] Falha no pnpm install. & pause & exit /b 1)

echo [2/4] Preparando o banco de dados...
call pnpm --filter @lotus/web exec prisma generate || (echo [ERRO] Falha ao preparar o banco. & pause & exit /b 1)

echo [3/4] Compilando o aplicativo desktop...
call pnpm --filter @lotus/desktop exec tsc -p tsconfig.json || (echo [ERRO] Falha ao compilar o app desktop. & pause & exit /b 1)

echo [4/4] Transcricao de videos dos Reels (opcional, mas recomendado)...
where python >nul 2>nul && (
  call python -m pip install --quiet --upgrade faster-whisper || echo [AVISO] Nao foi possivel instalar o faster-whisper. O diagnostico funciona, mas sem a fala dos videos.
) || echo [AVISO] Python nao encontrado: instale em https://python.org para o diagnostico transcrever os videos.
where ffmpeg >nul 2>nul || (
  echo Instalando o ffmpeg...
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements || echo [AVISO] Instale o ffmpeg manualmente: https://www.gyan.dev/ffmpeg/builds/
)

echo.
echo Pronto. Para abrir o LOTUS, de dois cliques em "Abrir LOTUS AI.cmd".
echo (Se o ffmpeg acabou de ser instalado, feche e abra o Windows Explorer ou reinicie o PC antes.)
pause
