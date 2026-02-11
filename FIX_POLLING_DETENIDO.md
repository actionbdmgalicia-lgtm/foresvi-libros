# ✅ FIX: Polling Detenido Prematuramente

## 🎯 Problema Identificado

**Síntoma**: El polling se detenía durante la orquestación mostrando:
```
⏸️  No hay libros esperando artefactos. Polling detenido.
```

Pero luego cuando sí verificaba, encontraba artefactos en progreso:
```javascript
{
  audio: "in_progress",
  infographic: "in_progress",
  video: "in_progress"
}
```

**Causa Raíz**:
- ❌ El filtro solo buscaba `orchestrationStatus === 'waiting_artifacts'`
- ❌ Durante `initializing`, `generating_infographic`, `generating_video`, el polling se detenía
- ❌ Race condition: el estado cambiaba antes de que el polling se activara

---

## 🔧 Solución Implementada

### **1. Filtro Expandido**

#### **ANTES:**
```javascript
const booksWaitingArtifacts = acceptedVideos.filter(v =>
    v.orchestrationStatus === 'waiting_artifacts' && v.notebookId
);
```

#### **AHORA:**
```javascript
// Estados que requieren polling activo
const ACTIVE_ORCHESTRATION_STATES = [
    'initializing',
    'generating_audio',
    'generating_infographic',
    'generating_video',
    'waiting_artifacts'
];

// Filtrar libros que están en proceso de orquestación
const booksInProgress = acceptedVideos.filter(v => {
    const hasActiveStatus = ACTIVE_ORCHESTRATION_STATES.includes(v.orchestrationStatus);
    const hasNotebook = !!v.notebookId;
    
    // También incluir si tiene artefactos en progreso
    const hasArtifactsInProgress = v.artifactsStatus && (
        v.artifactsStatus.audio === 'in_progress' ||
        v.artifactsStatus.audio === 'queued' ||
        v.artifactsStatus.infographic === 'in_progress' ||
        v.artifactsStatus.infographic === 'queued' ||
        v.artifactsStatus.video === 'in_progress' ||
        v.artifactsStatus.video === 'queued'
    );

    return (hasActiveStatus && hasNotebook) || hasArtifactsInProgress;
});
```

---

### **2. Logging Mejorado**

#### **ANTES:**
```javascript
if (booksWaitingArtifacts.length === 0) {
    console.log('⏸️  No hay libros esperando artefactos. Polling detenido.');
    return;
}
```

#### **AHORA:**
```javascript
console.log(`🔍 Polling check: ${booksInProgress.length} libro(s) en progreso`, 
    booksInProgress.map(b => `${b.title}: ${b.orchestrationStatus}`));

if (booksInProgress.length === 0) {
    console.log('⏸️  No hay libros en progreso. Polling detenido.');
    return;
}
```

---

### **3. Safety Check para notebookId**

```javascript
for (const book of booksInProgress) {
    try {
        // Skip si no tiene notebookId (todavía no se creó el notebook)
        if (!book.notebookId) {
            console.log(`⏭️  Saltando "${book.title}" - aún no tiene notebookId`);
            continue;
        }

        const res = await fetch(`http://localhost:3001/api/check-artifacts/${book.notebookId}`);
        // ...
    }
}
```

---

## 📊 Flujo Completo

### **Estados de Orquestación:**

```
1. initializing          ← AHORA INCLUIDO EN POLLING
2. generating_audio      ← AHORA INCLUIDO EN POLLING
3. generating_infographic ← AHORA INCLUIDO EN POLLING
4. generating_video      ← AHORA INCLUIDO EN POLLING
5. waiting_artifacts     ← YA ESTABA INCLUIDO
6. ready_for_download
7. completed
```

### **Lógica de Polling:**

```javascript
// Polling se mantiene activo si:
1. orchestrationStatus está en ACTIVE_ORCHESTRATION_STATES
   Y tiene notebookId
   
O

2. artifactsStatus tiene algún artefacto en 'in_progress' o 'queued'
```

---

## 🎯 Resultados Esperados

### **Logs Antes del Fix:**

```
[Log] ⏸️  No hay libros esperando artefactos. Polling detenido.
[Log] 🔄 Syncing selected status to: generating_infographic
[Log] ⏸️  No hay libros esperando artefactos. Polling detenido.
[Log] 🔄 Syncing selected status to: generating_video
[Log] ⏸️  No hay libros esperando artefactos. Polling detenido.
[Log] 🔄 Syncing selected status to: waiting_artifacts
[Log] 🔍 Verificando artefactos...  ← FINALMENTE VERIFICA
```

### **Logs Después del Fix:**

```
[Log] 🔍 Polling check: 1 libro(s) en progreso ["Título: initializing"]
[Log] ⏭️  Saltando "Título" - aún no tiene notebookId
[Log] 🔍 Polling check: 1 libro(s) en progreso ["Título: generating_infographic"]
[Log] 🔍 [20:52:00] Verificando artefactos para 1 libro(s)...
[Log] 📊 Título: {audio: "in_progress", infographic: "in_progress", video: "in_progress"}
[Log] 🔍 Polling check: 1 libro(s) en progreso ["Título: generating_video"]
[Log] 🔍 [20:52:15] Verificando artefactos para 1 libro(s)...
[Log] 📊 Título: {audio: "in_progress", infographic: "in_progress", video: "in_progress"}
[Log] 🔍 Polling check: 1 libro(s) en progreso ["Título: waiting_artifacts"]
[Log] 🔍 [20:52:30] Verificando artefactos para 1 libro(s)...
```

---

## ✅ Checklist de Validación

- [x] ✅ Filtro incluye todos los estados de orquestación activos
- [x] ✅ Filtro incluye libros con artefactos en `in_progress` o `queued`
- [x] ✅ Logging muestra qué libros están en progreso y su estado
- [x] ✅ Safety check para `notebookId` antes de hacer fetch
- [x] ✅ Variable renombrada de `booksWaitingArtifacts` a `booksInProgress`

---

## 🚀 Próximos Pasos

1. **Recarga la aplicación** (Cmd+R)
2. **Lanza una nueva generación**
3. **Verifica logs**:
   - ✅ No debe aparecer "Polling detenido" durante la orquestación
   - ✅ Debe mostrar "Polling check: 1 libro(s) en progreso"
   - ✅ Debe verificar artefactos continuamente cada 15s

---

## 📝 Notas Técnicas

### **Doble Condición de Filtrado:**

```javascript
return (hasActiveStatus && hasNotebook) || hasArtifactsInProgress;
```

Esto asegura que:
- Si el libro está en un estado activo Y tiene notebook → polling activo
- Si el libro tiene artefactos en progreso (aunque el estado cambie) → polling activo

### **Prevención de Race Conditions:**

El filtro ahora es **tolerante a cambios de estado**:
- No importa si el estado cambia de `generating_infographic` a `generating_video`
- No importa si el `notebookId` aún no está disponible
- El polling se mantiene activo mientras haya trabajo pendiente

---

**Fecha**: 2026-02-01 20:55
**Versión**: AdminDashboard v1.0.11
