# ✅ FIX: Falsos Fallos en Generación de Video

## 🎯 Problema Identificado

**Síntoma**: NotebookLM muestra "Generando resumen de vídeo..." pero nuestra app lo marca como error/timeout.

**Causa Raíz**:
1. ❌ No detectábamos estados intermedios (`queued`, `generating`, `in_progress`)
2. ❌ No incluíamos el video en el tracking de artefactos
3. ❌ Logging insuficiente para debugging
4. ❌ Timeout implícito (solo verificábamos URLs finales)

---

## 🔧 Cambios Implementados

### **1. Backend: `server.cjs` - Endpoint `/api/check-artifacts/:notebookId`**

#### **A. Logging Completo**
```javascript
// ANTES: Log truncado
console.log('[Check Artifacts] RAW studio_status:', 
    JSON.stringify(statusData, null, 2).slice(0, 1000));

// AHORA: Payload completo
console.log('[Check Artifacts] ===== FULL STUDIO_STATUS PAYLOAD =====');
console.log(JSON.stringify(statusData, null, 2));
console.log('[Check Artifacts] ===== END PAYLOAD =====');
```

#### **B. Detección de Video**
```javascript
// ANTES: Solo audio e infografía
const audioArtifact = artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
const infographicArtifact = artifacts.find(a => a.type === 'infographic');

// AHORA: También video
const videoArtifact = artifacts.find(a => a.type === 'video' || a.type === 'video_overview');
```

#### **C. Normalización de Estados**
```javascript
const normalizeStatus = (artifact) => {
    if (!artifact) return null;
    
    const status = artifact.status?.toLowerCase() || 'unknown';
    
    // Map intermediate states
    if (['queued', 'pending', 'waiting'].includes(status)) {
        return 'queued';
    }
    if (['generating', 'processing', 'in_progress', 'running'].includes(status)) {
        return 'in_progress';
    }
    if (['completed', 'done', 'ready', 'success'].includes(status)) {
        return 'completed';
    }
    if (['failed', 'error', 'failure'].includes(status)) {
        return 'failed';
    }
    if (['unknown', 'unavailable'].includes(status)) {
        // "unknown" usually means completed but without full metadata
        return artifact.audio_url || artifact.video_url || artifact.infographic_url ? 
            'completed' : 'unknown';
    }
    
    return status;
};
```

#### **D. Respuesta Mejorada**
```javascript
// ANTES: Sin video, sin rawStatus
{
    audio: { status: 'unknown', url: '...' },
    infographic: { status: 'completed', url: '...' }
}

// AHORA: Con video, rawStatus y artifact_id
{
    audio: { 
        status: 'completed',      // Normalizado
        rawStatus: 'unknown',     // Original de NotebookLM
        url: '...',
        artifact_id: '...'
    },
    infographic: { 
        status: 'completed',
        rawStatus: 'completed',
        url: '...',
        artifact_id: '...'
    },
    video: { 
        status: 'in_progress',    // ← AHORA DETECTADO
        rawStatus: 'generating',
        url: null,
        artifact_id: '...'
    }
}
```

#### **E. Logging Detallado**
```javascript
console.log(`[Check Artifacts] Found ${artifacts.length} artifact(s):`, 
    artifacts.map(a => `${a.type}:${a.status}`).join(', '));

console.log(`[Check Artifacts] Status Summary:`);
console.log(`  Audio: ${response.audio?.status || 'N/A'} (raw: ${response.audio?.rawStatus || 'N/A'})`);
console.log(`  Infographic: ${response.infographic?.status || 'N/A'} (raw: ${response.infographic?.rawStatus || 'N/A'})`);
console.log(`  Video: ${response.video?.status || 'N/A'} (raw: ${response.video?.rawStatus || 'N/A'})`);
console.log(`  All Complete: ${response.allComplete}`);
```

---

### **2. Frontend: `AdminDashboard.jsx` - Polling de Artefactos**

#### **A. Tracking de Video**
```javascript
// ANTES: Solo audio e infografía
const audioStatus = normalizeStatus(data.audio?.status);
const infoStatus = normalizeStatus(data.infographic?.status);
const currentState = `${audioStatus}|${infoStatus}`;

// AHORA: También video
const videoStatus = normalizeStatus(data.video?.status);
const currentState = `${audioStatus}|${infoStatus}|${videoStatus}`;
```

#### **B. Iconos para Estados Intermedios**
```javascript
// ANTES: Solo completed, in_progress, error
const audioIcon = audioStatus === 'completed' ? '🟢' :
    audioStatus === 'in_progress' ? '🟡' :
    audioStatus === 'error' ? '🔴' : '⚪';

// AHORA: Incluye queued y failed
const audioIcon = audioStatus === 'completed' ? '🟢' :
    audioStatus === 'in_progress' || audioStatus === 'queued' ? '🟡' :
    audioStatus === 'error' || audioStatus === 'failed' ? '🔴' : '⚪';
```

#### **C. Mensaje de Estado Completo**
```javascript
// ANTES: Solo audio e infografía
const statusMessage = `${audioIcon} Audio: ${audioStatus} | ${infoIcon} Infografía: ${infoStatus}`;

// AHORA: Incluye video
const statusMessage = `${audioIcon} Audio: ${audioStatus} | ${infoIcon} Infografía: ${infoStatus} | ${videoIcon} Video: ${videoStatus}`;
```

#### **D. Firestore con Video**
```javascript
await updateDoc(doc(db, "books", book.id), {
    artifactsStatus: {
        audio: audioStatus,
        audioUrl: data.audio?.url || data.audio?.audio_url || null,
        audioDuration: data.audio?.duration || data.audio?.duration_seconds || null,
        infographic: infoStatus,
        infographicUrl: data.infographic?.url || data.infographic?.infographic_url || null,
        video: videoStatus,  // ← NUEVO
        videoUrl: data.video?.url || data.video?.video_url || null,  // ← NUEVO
        lastChecked: new Date()
    },
    message: `${statusMessage}${timeMsg}`
});
```

---

## 📊 Mapeo de Estados

| Estado NotebookLM | Normalizado | Icono | Descripción |
|-------------------|-------------|-------|-------------|
| `queued` | `queued` | 🟡 | En cola |
| `pending` | `queued` | 🟡 | Pendiente |
| `waiting` | `queued` | 🟡 | Esperando |
| `generating` | `in_progress` | 🟡 | Generando |
| `processing` | `in_progress` | 🟡 | Procesando |
| `in_progress` | `in_progress` | 🟡 | En progreso |
| `running` | `in_progress` | 🟡 | Ejecutando |
| `completed` | `completed` | 🟢 | Completado |
| `done` | `completed` | 🟢 | Hecho |
| `ready` | `completed` | 🟢 | Listo |
| `success` | `completed` | 🟢 | Éxito |
| `unknown` (con URL) | `completed` | 🟢 | Completado sin metadata |
| `unknown` (sin URL) | `unknown` | ⚪ | Desconocido |
| `failed` | `failed` | 🔴 | Fallado |
| `error` | `failed` | 🔴 | Error |
| `failure` | `failed` | 🔴 | Fallo |

---

## 🎯 Resultados Esperados

### **Logs del Servidor (Terminal)**

#### **Antes:**
```
[Check Artifacts] RAW studio_status: {"status":"success","artifacts":[...
[Check Artifacts] Audio: unknown, Infographic: completed
```

#### **Ahora:**
```
[Check Artifacts] ===== FULL STUDIO_STATUS PAYLOAD =====
{
  "status": "success",
  "notebook_id": "0ab8f5f9-a4cc-44d2-9fa5-910d4178227a",
  "summary": {
    "total": 3,
    "completed": 1,
    "in_progress": 1
  },
  "artifacts": [
    {
      "artifact_id": "58ef6b24-bd79-4e5e-a3b5-52e01f06274b",
      "type": "audio",
      "status": "unknown",
      "audio_url": "https://..."
    },
    {
      "artifact_id": "3e9455fd-5458-4c79-9e62-d9cdd7ea4a35",
      "type": "infographic",
      "status": "completed",
      "infographic_url": "https://..."
    },
    {
      "artifact_id": "7f2a8c9d-1234-5678-9abc-def012345678",
      "type": "video_overview",
      "status": "generating",
      "video_url": null
    }
  ]
}
[Check Artifacts] ===== END PAYLOAD =====
[Check Artifacts] Found 3 artifact(s): audio:unknown, infographic:completed, video_overview:generating
[Check Artifacts] Status Summary:
  Audio: completed (raw: unknown)
  Infographic: completed (raw: completed)
  Video: in_progress (raw: generating)  ← AHORA DETECTADO
  All Complete: false
```

### **Consola del Navegador**

#### **Antes:**
```
📊 Quien ha robado mi queso: {
  audio: "completed",
  audioUrl: "✅",
  infographic: "completed",
  infoUrl: "✅"
}
```

#### **Ahora:**
```
📊 Quien ha robado mi queso: {
  audio: "completed",
  audioUrl: "✅",
  infographic: "completed",
  infoUrl: "✅",
  video: "in_progress",  ← NUEVO
  videoUrl: "❌",
  rawData: {...}
}
```

### **UI del Usuario**

#### **Antes:**
```
🟢 Audio: completed | 🟢 Infografía: completed (5 min)
```

#### **Ahora:**
```
🟢 Audio: completed | 🟢 Infografía: completed | 🟡 Video: in_progress (5 min)
```

---

## ✅ Checklist de Validación

- [x] ✅ Backend detecta video en `studio_status`
- [x] ✅ Estados intermedios normalizados (`queued`, `in_progress`)
- [x] ✅ Logging completo del payload de NotebookLM
- [x] ✅ Frontend muestra video en tracking
- [x] ✅ Iconos para `queued` y `failed`
- [x] ✅ Firestore actualizado con `video` y `videoUrl`
- [x] ✅ Mensaje de UI incluye video
- [x] ✅ `rawStatus` incluido para debugging

---

## 🚀 Próximos Pasos

1. **Reiniciar servidor** para aplicar cambios
2. **Probar generación** con video manual en NotebookLM
3. **Verificar logs** del servidor:
   - ✅ Payload completo visible
   - ✅ Video detectado con estado `generating` o `in_progress`
4. **Verificar UI**:
   - ✅ Mensaje muestra "🟡 Video: in_progress"
   - ✅ No marca como error mientras está generando

---

## 📝 Notas Importantes

- **No hay timeout**: El polling continúa indefinidamente mientras haya artefactos en `in_progress` o `queued`
- **Estados mixtos**: Si un artefacto falla, los demás siguen procesándose
- **Reintentos**: Por implementar (botón "Reintentar video" separado)

---

**Fecha**: 2026-02-01 20:45
**Versión**: Backend v1.1.0, Frontend v1.0.10
