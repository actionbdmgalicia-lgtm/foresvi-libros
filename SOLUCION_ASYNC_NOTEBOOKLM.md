# 🎯 Solución: Modelo Asíncrono para Generación de NotebookLM

## 📊 Problema Actual

- **Audio tarda**: 10-15 minutos
- **Video tarda**: 10-15 minutos  
- **Infografía tarda**: ~5 minutos
- **Polling bloqueante actual**: Solo espera 2.5 minutos (10 × 15s)
- **Resultado**: Timeout constante antes de que termine la generación

---

## ✅ Nueva Arquitectura Propuesta

### **Flujo Backend (server.cjs)**

```
1. POST /api/generate-orchestrated
   ├─ Crear Notebook ✅
   ├─ Añadir Fuentes ✅
   ├─ Lanzar audio_overview_create ✅
   ├─ Guardar notebookId en Firestore ✅
   └─ DEVOLVER CONTROL INMEDIATAMENTE (NO esperar)

2. GET /api/check-artifacts/:notebookId (NUEVO)
   ├─ Llamar studio_status
   ├─ Parsear estado de artefactos
   └─ Devolver JSON con progreso actual
```

### **Flujo Frontend (AdminDashboard.jsx)**

```
1. Usuario pulsa "Lanzar Generación"
   └─ POST /api/generate-orchestrated

2. Frontend recibe notebookId

3. Polling cada 30-60 segundos:
   └─ GET /api/check-artifacts/:notebookId
   
4. Mostrar estado en UI:
   ┌─────────────────────────────────┐
   │ 🟡 Audio: En progreso (5/15 min)│
   │ 🟢 Infografía: Completada        │
   │ ⚪ Video: Pendiente              │
   └─────────────────────────────────┘

5. Cuando audio.status === "completed":
   └─ Descargar y procesar
```

---

## 🛠️ Cambios Necesarios

### **1. Backend - Modificar `/api/generate-orchestrated`**

**Archivo**: `server.cjs` líneas ~1185-1250

**Cambio**:
```javascript
// ANTES (Bloqueante - 2.5 min timeout)
while ((!artifacts.audio || !artifacts.image) && attempts < maxAttempts) {
    // ... polling loop ...
    await new Promise(r => setTimeout(r, 15000)); // Espera 15s
}

// DESPUÉS (No bloqueante - devuelve inmediatamente)
log('Step 5: Generation Launched - Returning control...');
await updateDB('generating', { 
    notebookId: jobs[jobId].notebookId,
    notebookUrl: `https://notebooklm.google.com/notebook/${jobs[jobId].notebookId}`,
    message: 'Audio en generación. Esto puede tardar 10-15 minutos.'
});

jobs[jobId].status = 'waiting_artifacts';
return; // ← SALIR AQUÍ (Frontend hará polling)
```

---

### **2. Backend - Añadir Endpoint `/api/check-artifacts/:notebookId`**

**Archivo**: `server.cjs` (insertar antes de `app.post('/api/generate-orchestrated')`)

```javascript
app.get('/api/check-artifacts/:notebookId', async (req, res) => {
    const { notebookId } = req.params;
    
    try {
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusData = JSON.parse(statusRes.content[0].text);
        
        const audioArtifact = statusData.artifacts?.find(a => a.type === 'audio');
        const infographicArtifact = statusData.artifacts?.find(a => a.type === 'infographic');
        
        res.json({
            notebookId,
            summary: statusData.summary,
            audio: audioArtifact ? {
                status: audioArtifact.status,
                url: audioArtifact.audio_url,
                duration: audioArtifact.duration_seconds
            } : null,
            infographic: infographicArtifact ? {
                status: infographicArtifact.status,
                url: infographicArtifact.infographic_url
            } : null,
            allComplete: statusData.summary.completed === statusData.summary.total
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

---

### **3. Frontend - Añadir Polling en `AdminDashboard.jsx`**

**Ubicación**: Dentro del componente, después de `useEffect` existentes

```javascript
// Polling para verificar artefactos de NotebookLM
useEffect(() => {
    const booksGenerating = acceptedVideos.filter(v => 
        v.orchestrationStatus === 'generating' && v.notebookId
    );
    
    if (booksGenerating.length === 0) return;
    
    const checkArtifacts = async () => {
        for (const book of booksGenerating) {
            try {
                const res = await fetch(`/api/check-artifacts/${book.notebookId}`);
                const data = await res.json();
                
                // Actualizar Firestore con el progreso
                await updateDoc(doc(db, "books", book.id), {
                    artifactsStatus: {
                        audio: data.audio?.status || 'pending',
                        infographic: data.infographic?.status || 'pending',
                        lastChecked: new Date()
                    }
                });
                
                // Si el audio está completo, llamar a descarga
                if (data.audio?.status === 'completed' && data.audio?.url) {
                    console.log(`✅ Audio listo para ${book.title}`);
                    // Aquí llamarías a /api/download-artifacts o similar
                }
                
            } catch (e) {
                console.error(`Error checking artifacts for ${book.id}:`, e);
            }
        }
    };
    
    // Verificar cada 60 segundos
    checkArtifacts(); // Primera verificación inmediata
    const interval = setInterval(checkArtifacts, 60000);
    
    return () => clearInterval(interval);
}, [acceptedVideos]);
```

---

### **4. Frontend - Mostrar Estado Visual**

**Ubicación**: En el componente de cada libro (BookCard o similar)

```jsx
{book.orchestrationStatus === 'generating' && book.artifactsStatus && (
    <div className="artifacts-progress">
        <div className={`artifact-status ${book.artifactsStatus.audio}`}>
            {book.artifactsStatus.audio === 'completed' ? '🟢' : '🟡'} 
            Audio: {book.artifactsStatus.audio}
        </div>
        <div className={`artifact-status ${book.artifactsStatus.infographic}`}>
            {book.artifactsStatus.infographic === 'completed' ? '🟢' : '🟡'} 
            Infografía: {book.artifactsStatus.infographic}
        </div>
    </div>
)}
```

---

## 📋 Checklist de Implementación

### Backend:
- [ ] Añadir endpoint `/api/check-artifacts/:notebookId`
- [ ] Modificar `/api/generate-orchestrated` para NO esperar (devolver tras lanzar generación)
- [ ] Guardar `notebookId` en Firestore al crear notebook
- [ ] Reiniciar servidor

### Frontend:
- [ ] Añadir `useEffect` para polling de artefactos
- [ ] Añadir campo `artifactsStatus` en Firestore schema
- [ ] Mostrar indicadores visuales de progreso
- [ ] Implementar lógica de descarga cuando `audio.status === 'completed'`

---

## 🎯 Resultado Esperado

### Antes:
```
Usuario → Lanzar → [Espera 2.5 min] → ❌ Timeout
```

### Después:
```
Usuario → Lanzar → ✅ Respuesta inmediata
         ↓
    [Polling cada 60s]
         ↓
    🟡 Audio: in_progress (3 min)
    🟡 Audio: in_progress (6 min)
    🟡 Audio: in_progress (9 min)
    🟢 Audio: completed (12 min)
         ↓
    ✅ Descarga automática
```

---

## 💡 Ventajas

1. ✅ **No más timeouts** - El backend no espera
2. ✅ **Feedback visual** - Usuario ve progreso en tiempo real
3. ✅ **Escalable** - Puede generar múltiples libros simultáneamente
4. ✅ **Robusto** - Si el servidor se reinicia, el frontend sigue verificando
5. ✅ **UX mejorada** - Usuario puede hacer otras cosas mientras espera

---

## 🚀 Próximos Pasos

1. **Revisar este documento**
2. **Aprobar cambios**
3. **Implementar backend** (15 min)
4. **Implementar frontend** (20 min)
5. **Probar flujo completo** (10 min)

**Tiempo total estimado**: ~45 minutos
