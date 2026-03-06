#!/bin/bash
# ---------------------------------------------------------
# Lanzador de Foresvi v2 - MAC BLINDADO
# ---------------------------------------------------------

# RUTA ABSOLUTA DEL PROYECTO (Grabada para que funcione desde el Escritorio)
PROJECT_DIR="/Users/maccuatro/Library/CloudStorage/GoogleDrive-actionbdmgalicia@gmail.com/Mi unidad/0_FORESVI/Libros Foresvi"

cd "$PROJECT_DIR" || { echo "❌ Error: No se encuentra la carpeta del proyecto."; exit 1; }

echo "-------------------------------------------------------"
echo "🚀  INICIANDO SISTEMA FORESVI (MODO LOCAL)  🚀"
echo "-------------------------------------------------------"

# Asegurar que los comandos node y npm están disponibles
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# 1. Limpiar procesos antiguos instalados en los puertos
echo "🧹 Limpiando puertos 3001 y 5173..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# 2. Arrancar Backend
echo "🤖 Arrancando Robot (Backend)..."
node server.cjs &
BACKEND_PID=$!

# 3. Arrancar Frontend
echo "🌐 Arrancando Interfaz Web (Vite)..."
npm run dev &
FRONTEND_PID=$!

# 4. Esperar un momento y abrir navegador
echo "⏳ Esperando a que los motores arranquen..."
sleep 8
open "http://localhost:5173/admin"

echo "-------------------------------------------------------"
echo "✅ TODO LISTO. No cierres esta ventana."
echo "-------------------------------------------------------"

# Mantener vivo el script
wait $BACKEND_PID $FRONTEND_PID
