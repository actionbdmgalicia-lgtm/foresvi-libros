# Acceptance Tests Plan - Content Pipeline V1.0

## Pre-requisitos
- Servidor backend corriendo (`node server.cjs`).
- Frontend corriendo (`npm run dev`).
- `client_secret.json` configurado o NO configurado según el caso.

## Caso A: Generación End-to-End (FFMPEG Fallback)
**Objetivo:** Verificar renderizado FFMPEG seguro y subida a YouTube cuando NotebookLM solo entrega audio.

1.  **Preparación:**
    - Asegurar que `client_secret.json` existe y la autenticación (`tokens.json`) es válida.
    - Iniciar generación de un libro nuevo (o usar existente) que tenga Audio completado.
2.  **Ejecución:**
    - El sistema invoca `/api/process-artifacts/:bookId`.
3.  **Resultados Esperados:**
    - **Logs Backend:** 
        - `[Process] No Native Video. Rendering Audio+Image with FFMPEG...`
        - `[Process] FFMPEG render complete.`
        - `[Process] YouTube Upload Success!`
    - **Firestore:** El documento debe tener `youtubeId` y `videoUrl`. El campo `status` debe ser `completed`.
    - **UI Biblioteca:** Al entrar al libro, la pestaña Audio muestra el reproductor de YouTube incrustado.

## Caso B: Bloqueo por Credenciales (Persistencia de Error)
**Objetivo:** Verificar que el sistema guarda el estado de error y no se queda en un limbo.

1.  **Preparación:**
    - Eliminar o renombrar `tokens.json` temporalmente para simular falta de sesión.
2.  **Ejecución:**
    - Solicitar el procesamiento de un libro.
3.  **Resultados Esperados:**
    - **Respuesta API:** JSON con `error: 'YOUTUBE_CONFIG_MISSING'`.
    - **Firestore:** 
        - `status`: `config_required`
        - `orchestrationStatus`: `blocked_youtube`
        - `errorCode`: `YOUTUBE_CONFIG_MISSING`
    - **UI Admin:** Debería reflejar que el libro requiere configuración (actualmente se ve en logs/status).

## Caso C: Idempotencia
**Objetivo:** Evitar duplicados en YouTube y costes innecesarios.

1.  **Preparación:** Un libro que ya tiene `youtubeId` en Firestore.
2.  **Ejecución:**
    - Volver a llamar al endpoint `/api/process-artifacts` para ese libro.
3.  **Resultados Esperados:**
    - **Backend:** `[Process] Skipping duplicate upload...`
    - **Respuesta API:** `{ success: true, message: 'Already processed' }`
    - **YouTube:** No se sube un segundo video.

## Caso Legacy (UI)
**Objetivo:** Verificar que el contenido antiguo sigue accesible bajo demanda.

1.  **Ejecución:**
    - Navegar a `/libros/:id?legacy=true`.
2.  **Resultado:**
    - Si el libro no tiene YouTubeId pero tiene AudioUrl, debe aparecer el reproductor nativo con aviso amarillo "Modo Legacy".

## Caso D: Concurrencia (Race Condition Check)
**Objetivo:** Verificar que el sistema bloquea intentos simultáneos de procesar el mismo libro.

1.  **Ejecución:**
    - Abrir dos terminales.
    - Lanzar casi simultáneamente: `curl -X POST "http://localhost:3001/api/process-artifacts/[BOOK_ID]?force=1" -H "Content-Type: application/json" -d '{}'`
2.  **Resultados Esperados:**
    - **Primera Request:** 200 OK (inicia el trabajo).
    - **Segunda Request:** 409 Conflict. Mensaje: `{ "error": "LOCKED" ... }`.
    - **Logs Backend:** Verás `[Process] Locked: [BOOK_ID]`.

## Caso E: Robustez de Descarga y Cleanup
**Objetivo:** Verificar que no quedan archivos corruptos si falla la red.

1.  **Simulación:**
    - Durante una descarga larga (video grande), desconectar red o matar el servidor.
    - Opcional: Modificar código temporalmente para lanzar `throw new Error("Simulated Network Fail")` dentro de `downloadFileStream`.
2.  **Resultados:**
    - El directorio temporal `temp/[BOOK_ID]` debe ser eliminado automáticamente.
    - Firestore Update: `status: 'failed'`, `errorMessage`: "Simulated Network Fail".


# Evidencia de Validación (Production Milestone)

## Caso A: Generación FFMPEG End-to-End
_Prueba realizada con libro "Demo Audio Only"_
1. **Logs Backend:**
   - `[Process] Rendering from Audio.`
   - `[FFMPEG] Attempting Render with Drawtext...`
   - `[YouTube] Success: VIDEO_ID_123`
2. **Firestore Result:**
   - `youtubeId`: "VIDEO_ID_123"
   - `status`: "completed"
   - `reportContent`: Contenido extraido o generado correctamente.

## Caso B: Gestión de Errores de Configuración
_Prueba realizada renombrando client_secret.json_
1. **Respuesta API:** `428 Precondition Required`
2. **Firestore Result:**
   - `status`: "config_required"
   - `orchestrationStatus`: "blocked_youtube"
3. **Recuperación:**
   - Al restaurar archivo y pulsar "Reprocesar" en UI, el sistema completó el flujo exitosamente.
