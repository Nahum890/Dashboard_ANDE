#!/bin/bash
# render-build.sh

echo "🔧 Instalando dependencias en Render..."
npm install

echo "🔄 Reconstruyendo sqlite3 para Linux..."
npm rebuild sqlite3 --build-from-source

echo "✅ Build completado"