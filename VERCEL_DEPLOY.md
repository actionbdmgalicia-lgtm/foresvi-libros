# Guía de Despliegue en Vercel (Frontend) y Backend

Esta aplicación tiene dos partes:
1.  **Frontend (React/Vite)**: Listo para Vercel.
2.  **Backend (Node.js/Express + Puppeteer)**: Requiere un entorno de ejecución continuo (VPS, Railway, Render) debido a los procesos largos de IA.

## 🚨 IMPORTANTE: Limitación de Vercel
**NO despliegues el Backend (`server.cjs`) en Vercel como Serverless Functions.**
La generación de NotebookLM y FFMPEG tarda más de 10 segundos, lo que causará timeouts (Error 504) en Vercel.

---

## 🚀 Paso 1: Desplegar Frontend en Vercel

1.  Sube este repositorio a **GitHub**.
2.  Ve a [Vercel](https://vercel.com) -> **Add New Project**.
3.  Importa tu repositorio.
4.  **Configuración del Proyecto**:
    *   **Framework Preset**: Vite
    *   **Root Directory**: `./` (o déjalo vacío si está en la raíz)
    *   **Environment Variables**:
        *   `VITE_YOUTUBE_API_KEY`: Tu clave de YouTube.
        *   `VITE_OPENAI_API_KEY`: Tu clave de OpenAI.
        *   `VITE_API_BASE_URL`: **LA URL DE TU BACKEND** (ver Paso 2).
5.  Despliega.

---

## 🛠️ Paso 2: Desplegar Backend (Cerebro)

Recomendamos **Render** o **Railway** porque permiten servidores persistentes y Docker.

### Opción A: Render (Gratis/Cheap)
1.  Crea un nuevo **Web Service** en Render conectado a tu repo.
2.  **Build Command**: `npm install`
3.  **Start Command**: `node server.cjs`
4.  **Environment Variables**:
    *   Copia todas las variables de tu `.env` local (`GOOGLE_DRIVE_FOLDER_ID`, credenciales, etc.).
    *   **Importante**: Necesitas subir tus archivos de credenciales JSON (`google-auth-client.json`) o usar variables de entorno para el contenido del JSON si modificas el código para leerlo de ENV.
5.  Obtén la URL pública (ej: `https://mi-backend.onrender.com`).
6.  **Vuelve a Vercel** y pon esa URL en la variable `VITE_API_BASE_URL` del Frontend.

### Opción B: Railway
Similar a Render, conecta el repo y define el comando de inicio `node server.cjs`. Railway detecta automáticamente Node.js.

---

## 🔄 Configuración de Proxy (Si usas Vercel para todo el tráfico)
Si quieres que tu dominio en Vercel (`mi-app.vercel.app/api`) redirija al backend en Render:
Crea/Edita `vercel.json` en la raíz con esto:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://tu-backend-en-render.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
Esto permite que el frontend siga haciendo peticiones a `/api/...` y Vercel las mande al backend real.

## ✅ Resumen
1.  Frontend -> Vercel.
2.  Backend -> Render/Railway.
3.  Vincúlalos con `vercel.json` (rewrites) o `VITE_API_BASE_URL`.
