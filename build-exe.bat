@echo off
echo ===================================
echo SC2 Stream Overlay - EXE Builder
echo ===================================
echo.
echo Esta ferramenta criara um arquivo executavel standalone para Windows.
echo Nao sera necessario ter Node.js ou Docker instalado para executar o programa final.
echo.
echo Requisitos para build:
echo  - Docker instalado e em execucao
echo.

REM Verificar se o Docker está instalado
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Docker nao encontrado! Instale o Docker Desktop e tente novamente.
    pause
    exit /b 1
)

echo [INFO] Docker encontrado. Iniciando o processo de build...
echo.

REM Criar pasta dist se não existir
if not exist dist mkdir dist

echo [INFO] Construindo a imagem Docker para o build...
docker build -f Dockerfile.pkg -t sc2-overlay-builder .

if %ERRORLEVEL% neq 0 (
    echo [ERRO] Falha ao construir a imagem Docker.
    pause
    exit /b 1
)

echo.
echo [INFO] Gerando o arquivo executavel...
docker run --rm -v "%cd%\dist:/output" sc2-overlay-builder cp /app/sc2-overlay-win64.zip /output/

if %ERRORLEVEL% neq 0 (
    echo [ERRO] Falha ao gerar o executavel.
    pause
    exit /b 1
)

echo.
echo [SUCESSO] Processo de build concluido!
echo O arquivo sc2-overlay-win64.zip foi criado na pasta dist.
echo.
echo Instrucoes:
echo 1. Extraia o arquivo ZIP em qualquer pasta
echo 2. Execute o arquivo sc2-overlay.exe
echo 3. Certifique-se de que o StarCraft II esteja rodando com a Client API ativada
echo.
echo Obrigado por usar o SC2 Stream Overlay!
echo.
pause