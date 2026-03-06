#!/bin/bash
PROJECT_DIR="/Users/maccuatro/Library/CloudStorage/GoogleDrive-actionbdmgalicia@gmail.com/Mi unidad/0_FORESVI/Libros Foresvi"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Error: Carpeta no encontrada."
    read -p "Presiona ENTER..."
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

echo "--------------------------------------------------------"
echo "🛠  REPARADOR DE EMERGENCIA FORESVI"
echo "--------------------------------------------------------"
echo "⚠️  Detectada carpeta 'node_modules' corrupta."
echo "⚠️  La librería 'firebase-admin' está bloqueando el arranque."
echo ""
echo "⏳ Iniciando reinstalación (esto tarda 2-5 minutos)..."
echo "⬇️  Por favor, ten paciencia y NO cierres esta ventana."
echo "--------------------------------------------------------"

rm -rf node_modules package-lock.json
npm install

echo "--------------------------------------------------------"
echo "✅ REPARACIÓN COMPLETADA."
echo "--------------------------------------------------------"
echo "Ahora, intenta usar el 'Lanzador_Foresvi_FINAL.command' de nuevo."
read -p "Presiona ENTER para salir..."
