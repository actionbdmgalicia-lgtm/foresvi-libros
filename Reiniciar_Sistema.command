#!/bin/bash
# Script para reiniciar el sistema Foresvi de forma limpia

# Asegurar PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "🛑 Deteniendo procesos existentes..."

# Matar procesos en puertos 3001 y 5173
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Matar procesos de node server.cjs
pkill -f "node server.cjs" 2>/dev/null

# Esperar un momento
sleep 2

echo "✅ Procesos detenidos"
echo ""
echo "🚀 Iniciando sistema..."
echo ""

# Cambiar al directorio del proyecto
cd "/Users/maccuatro/Library/CloudStorage/GoogleDrive-actionbdmgalicia@gmail.com/Mi unidad/0_FORESVI/Libros Foresvi"

# Limpiar logs anteriores
rm -f server.log frontend.log

# Iniciar frontend en background
echo "📱 Iniciando frontend (Vite)..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Esperar un poco para que Vite se inicie
sleep 3

# Función de limpieza
cleanup() {
  echo ""
  echo "🛑 Cerrando sistemas..."
  kill $FRONTEND_PID 2>/dev/null
  exit
}
trap cleanup SIGINT SIGTERM EXIT

# Abrir navegador
echo "🌐 Abriendo navegador..."
(sleep 3 && open "http://localhost:5173/admin") &

# Iniciar backend en foreground (para ver logs)
echo "🤖 Iniciando backend (Node)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node server.cjs

# Si el servidor se cierra
echo ""
echo "⚠️  El servidor se ha cerrado"
read -p "Presiona ENTER para salir..."
