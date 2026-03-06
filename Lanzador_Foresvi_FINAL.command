#!/bin/bash
# ---------------------------------------------------------
# Lanzador de Foresvi v5 - DIAGNOSTICO COMPLETO
# ---------------------------------------------------------

# 1. ENCONTRAR CARPETA
PROJECT_DIR="/Users/maccuatro/Documents/CLAUDE/Libros Foresvi version Claude"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Error: No encuentro la carpeta del proyecto."
    read -p "Presiona ENTER para salir..."
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

echo "-------------------------------------------------------"
echo "🚀  INICIANDO SISTEMA FORESVI (MODO FINAL)  🚀"
echo "-------------------------------------------------------"

# 2. CONFIGURAR RUTAS (SOLUCIÓN APPLE SILICON)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Verificación de herramientas
check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ FALTA CRÍTICA: No encuentro el programa '$1'."
        echo "Por favor, instala Node.js desde https://nodejs.org"
        read -p "Presiona ENTER para salir..."
        exit 1
    fi
}

check_cmd node
check_cmd npm

echo "✅ Herramientas encontradas."

# 3. LIMPIEZA DE PUERTOS
cleanup_port() {
  PIDS=$(lsof -ti:$1)
  if [ -n "$PIDS" ]; then
    echo "🧹 Matando proceso atascado en puerto $1..."
    kill -9 $PIDS 2>/dev/null
  fi
}
cleanup_port 3001
cleanup_port 5173
pkill -f "node server.cjs" 2>/dev/null

# 4. PREPARAR LOGS
rm -f frontend.log server.log

# 5. ARRANCAR (MODO FOREGROUND PARA BACKEND)
echo "-------------------------------------------------------"
echo "🌐 Iniciando Interfaz Local (Vite)..."
# Ejecutamos Vite en segundo plano, redirigiendo salida a archivo para no ensuciar
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Función de limpieza al cerrar
cleanup() {
  echo ""
  echo "🛑 Cerrando sistemas..."
  kill $FRONTEND_PID 2>/dev/null
  exit
}
trap cleanup SIGINT SIGTERM EXIT

# Lanzar navegador tras unos segundos
(sleep 5 && open "http://localhost:5173/admin") &

echo "🤖 Arrancando Cerebro (Backend)..."
echo "⬇️  LOGS DEL SISTEMA (Si esto no avanza, hay un error) ⬇️"
echo "-------------------------------------------------------"

# Ejecutamos el servidor en PRIMER PLANO. Si falla, lo veremos aquí.
node server.cjs

# Si node se cierra inesperadamente:
echo ""
echo "⚠️  ATENCIÓN: El servidor se ha cerrado."
echo "Revisa los mensajes de error arriba."
read -p "Presiona ENTER para cerrar esta ventana..."
