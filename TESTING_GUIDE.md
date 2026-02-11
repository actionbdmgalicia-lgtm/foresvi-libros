# Guía de Pruebas - Foresvi V4 (Drive & Roadmap)

Esta guía detalla los pasos para probar las nuevas funcionalidades implementadas en la versión V4, que reemplaza la subida automática a YouTube con sincronización a Google Drive y añade generación de roadmaps.

## 1. Configuración Previa
Asegúrate de tener las siguientes variables en tu archivo `.env`:
- `GOOGLE_DRIVE_FOLDER_ID`: ID de la carpeta raíz en Drive donde se guardarán los libros.
- `YOUTUBE_PLAYLIST_ID`: ID de la playlist de YouTube para sincronización (opcional).
- `GOOGLE_CREDENTIALS`: Tu JSON de credenciales de servicio (o `CLIENT_SECRET_FILE` para OAuth).

## 2. Flujo de Generación y Drive Sync
1.  Ve al **Panel de Expertos** (`/admin`).
2.  Busca un tema o video de YouTube y dale a "Crear" o "Configurar".
3.  Lanza la generación ("Lanzar Generación Completa").
4.  Observa el progreso.
    *   **Esperado**: El sistema pasará por Audio -> Video -> Infografía.
    *   **Nuevo**: Al finalizar los artefactos, verás "Sincronizando con Drive...".
5.  Ve a la pestaña "Biblioteca" en el Admin.
    *   **Esperado**: La columna "Drive & Roadmap" debe mostrar "✅ Drive OK".
    *   Haz clic en el enlace para abrir la carpeta en Google Drive. Verifica que contenga los archivos (audio, video, infografía).

## 3. Generación de Roadmap
1.  En el **Panel de Expertos**, selecciona un libro que ya tenga Drive Sync completado.
2.  En el panel de detalles (derecha), busca el botón **"🗺️ Generar Roadmap"**.
3.  Haz clic y espera unos segundos.
4.  Al finalizar, ve a la aplicación principal (`/books/[id]`) o verifica en la tabla que aparezca "🗺️ Roadmap OK".
5.  Entra al detalle del libro en la App.
    *   **Esperado**: Aparece una nueva pestaña "Roadmap".
    *   Verifica que se muestren las fases (Iniciación, Consolidación, Escalar) y los ítems interactivos.

## 4. Sincronización de Playlist YouTube
1.  En el **Panel de Expertos**, ve a la nueva pestaña **"📺 Playlist Sync"**.
2.  Haz clic en "Iniciar Sincronización Masiva".
3.  **Esperado**: El sistema escaneará la playlist configurada.
    *   Si encuentra videos con títulos coincidentes a tus libros en Firestore, los vinculará.
    *   Verifica en la "Biblioteca" que aparezca "📺 YouTube OK" en los libros coincidentes.

## 5. Vinculación Manual de YouTube
1.  Entra en el detalle de un libro en la App (`/books/[id]`).
2.  Ve a la pestaña "Video" o "Roadmap" donde aparezca el paso de "Video de YouTube".
3.  Si eres administrador, verás un campo para pegar la URL de YouTube.
4.  Pega una URL válida y guarda.
5.  **Esperado**: El video debe aparecer inmediatamente en el reproductor.

## 6. Solución de Problemas Comunes
- **Error "No credentials"**: Revisa que `google-auth-client.json` o `drive-token.json` existan en la raíz. Si no, borra los tokens y re-autentica visitando `/api/auth/google`.
- **Roadmap vacío**: Si la generación falla, revisa los logs del servidor. Puede ser un timeout de NotebookLM o OpenAI. Reintenta la generación.
- **Drive Folder no se crea**: Verifica permisos de escritura en la carpeta raíz definida en `.env`.
