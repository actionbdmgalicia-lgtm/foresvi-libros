#!/bin/bash
# ============================================================
#  FORESVI Libros — Arranque Local
#  Haz doble clic en este archivo para iniciar la aplicación
# ============================================================

# Ir al directorio del proyecto (donde está este script)
cd "$(dirname "$0")"

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🚀  FORESVI Libros — Arranque         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Matar procesos anteriores en los puertos 3001 y 5173 si los hay
echo -e "${YELLOW}🧹 Limpiando puertos...${NC}"
kill $(lsof -i :3001 -t) 2>/dev/null
kill $(lsof -i :5173 -t) 2>/dev/null
sleep 1

# Verificar que node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependencias (primera vez)...${NC}"
    npm install
fi

# Arrancar el backend (server.cjs) en segundo plano
echo -e "${BLUE}🔧 Iniciando servidor backend (puerto 3001)...${NC}"
node server.cjs &
BACKEND_PID=$!

# Esperar un poco para que el backend arranque
sleep 3

# Verificar que el backend arrancó
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Backend arrancado (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Error: El backend no pudo arrancar${NC}"
    echo -e "${RED}   Revisa los logs de arriba para más detalles${NC}"
    echo ""
    echo "Presiona cualquier tecla para cerrar..."
    read -n 1
    exit 1
fi

# Arrancar el frontend (Vite) en segundo plano
echo -e "${BLUE}🎨 Iniciando frontend Vite (puerto 5173)...${NC}"
npx vite --host &
FRONTEND_PID=$!

sleep 3

# Verificar que el frontend arrancó
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend arrancado (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${RED}❌ Error: El frontend no pudo arrancar${NC}"
    echo -e "${RED}   Revisa los logs de arriba para más detalles${NC}"
    kill $BACKEND_PID 2>/dev/null
    echo ""
    echo "Presiona cualquier tecla para cerrar..."
    read -n 1
    exit 1
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ ¡Todo listo!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  📱  Admin:     ${BLUE}http://localhost:5173/admin${NC}"
echo -e "  📚  Biblioteca: ${BLUE}http://localhost:5173${NC}"
echo -e "  🔧  API:        ${BLUE}http://localhost:3001${NC}"
echo ""
echo -e "${YELLOW}  Presiona Ctrl+C para apagar todo${NC}"
echo ""

# Abrir el navegador automáticamente
open "http://localhost:5173/admin"

# Función para apagar todo limpiamente
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Apagando servicios...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}👋 ¡Hasta luego!${NC}"
    exit 0
}

# Capturar Ctrl+C
trap cleanup SIGINT SIGTERM

# Mantener el script corriendo hasta que se cierre
wait
