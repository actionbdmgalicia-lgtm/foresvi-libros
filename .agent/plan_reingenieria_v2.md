# Plan de Reingeniería V2 - Flujo de Artefactos Foresvi

## Resumen de Cambios

### 1. Google Drive Storage (Reemplaza YouTube Auto-Upload)
- **Eliminar**: Subida automática a YouTube en `process-artifacts`
- **Añadir**: Descarga de artefactos (audio, video, infografía) + subida a Google Drive
- **Estructura Drive**: `Foresvi Libros/{Nombre Cuaderno}/audio.mp3, video.mp4, infografia.png`
- **Campo manual YouTube**: UI para pegar URL de YouTube manualmente

### 2. Sync desde Playlist de YouTube
- **Nuevo endpoint**: `POST /api/youtube/sync-playlist`
- Escanea playlist configurada, matchea títulos con notebooks existentes
- Actualiza Firestore con `youtubeId` y `videoUrl`

### 3. Informe Estructurado (Roadmap JSON)
- **MCP Tool**: `report_create` genera informe
- **Post-procesamiento**: Parsear respuesta a JSON estructurado
- **Schema Firestore** en `books/{id}`:
  ```json
  {
    "roadmap": {
      "resumen_ejecutivo": "string",
      "aprendizajes_clave": [...],
      "roadmap_accionable": { fase_1, fase_2, fase_3 },
      "indicadores_exito": [...]
    }
  }
  ```

### 4. UI: Plan de Acción y Roadmap
- Nueva pestaña en BookDetail: "🗺️ Roadmap"
- Visualización interactiva tipo checklist/stepper
- Stepper actualizado: NotebookLM → Drive Sync → YouTube Link → Roadmap Ready

### 5. Backend Schema
- Campos estructurados dentro de `books` collection (Firestore)
- No tabla separada (Firestore no es relacional)

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `server.cjs` | Reemplazar YouTube upload por Drive upload, nuevo endpoint playlist sync, endpoint roadmap, endpoint manual YouTube link |
| `src/pages/BookDetail.jsx` | Nueva pestaña Roadmap, campo manual YouTube, stepper |
| `src/pages/AdminDashboard.jsx` | Stepper actualizado, campo YouTube manual |
| `.env` | Añadir `GOOGLE_DRIVE_FOLDER_ID`, `YOUTUBE_PLAYLIST_ID` |

## Orden de Implementación

1. ✅ Backend: Google Drive upload helper
2. ✅ Backend: Reemplazar YouTube auto-upload por Drive sync en process-artifacts  
3. ✅ Backend: Endpoint manual YouTube link
4. ✅ Backend: Endpoint sync playlist
5. ✅ Backend: Endpoint generar roadmap estructurado
6. ✅ Frontend: BookDetail - Roadmap tab + YouTube manual field
7. ✅ Frontend: AdminDashboard - Stepper actualizado
