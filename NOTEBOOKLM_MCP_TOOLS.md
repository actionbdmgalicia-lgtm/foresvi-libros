# NotebookLM MCP - Herramientas Disponibles

## 📋 Lista Completa de Tools (33 total)

```
audio_overview_create
chat_configure
data_table_create
download_secure_file
flashcards_create
infographic_create
mind_map_create
notebook_add_drive
notebook_add_text
notebook_add_url
notebook_create
notebook_delete
notebook_describe
notebook_get
notebook_list
notebook_query
notebook_rename
quiz_create
refresh_auth
report_create
research_import
research_start
research_status
save_auth_tokens
slide_deck_create
source_delete
source_describe
source_get_content
source_list_drive
source_sync_drive
studio_delete
studio_status
video_overview_create
```

---

## 🎯 Herramientas Clave para Nuestro Flujo

### 1. **notebook_create**
```python
def notebook_create(title: str = "") -> dict[str, Any]:
    """Create a new notebook.
    
    Args:
        title: Optional title for the notebook
        
    Returns:
        {
            "status": "success",
            "notebook": {
                "id": str,
                "title": str,
                "url": str
            }
        }
    """
```

**✅ Uso en server.cjs:**
```javascript
const res = await runMCPTool('notebook_create', { title: 'Mi Título' });
const notebookId = JSON.parse(res.content[0].text).notebook.id;
```

---

### 2. **notebook_add_url**
```python
def notebook_add_url(notebook_id: str, url: str) -> dict[str, Any]:
    """Add a URL source to notebook.
    
    Args:
        notebook_id: Notebook UUID
        url: URL to add
    """
```

**✅ Uso en server.cjs:**
```javascript
await runMCPTool('notebook_add_url', { 
    notebook_id: notebookId, 
    url: 'https://example.com' 
});
```

---

### 3. **audio_overview_create** ⚠️ (NO `audio_generate`)
```python
def audio_overview_create(
    notebook_id: str,
    source_ids: list[str] | None = None,
    format: str = "deep_dive",
    length: str = "default",
    language: str = "en",
    focus_prompt: str = "",
    confirm: bool = False,
) -> dict[str, Any]:
    """Generate audio overview. Requires confirm=True after user approval.
    
    Args:
        notebook_id: Notebook UUID
        source_ids: Source IDs (default: all)
        format: deep_dive|brief|critique|debate
        length: short|default|long
        language: BCP-47 code (en, es, fr, de, ja)
        focus_prompt: Optional focus text
        confirm: Must be True after user approval
    """
```

**✅ Uso en server.cjs:**
```javascript
await runMCPTool('audio_overview_create', { 
    notebook_id: notebookId,
    focus_prompt: 'Genera un resumen ejecutivo...',
    language: 'es',
    confirm: true
});
```

---

### 4. **studio_status** ⚠️ (Requiere `notebook_id`)
```python
def studio_status(notebook_id: str) -> dict[str, Any]:
    """Get current notebook status including artifacts.
    
    Args:
        notebook_id: Notebook UUID
    """
```

**✅ Uso en server.cjs:**
```javascript
const statusRes = await runMCPTool('studio_status', { 
    notebook_id: notebookId 
});
```

---

### 5. **download_secure_file**
```python
def download_secure_file(
    url: str,
    expected_type: str | None = None
) -> dict[str, Any]:
    """Download authenticated file (audio/image from NotebookLM).
    
    Args:
        url: Googleusercontent URL
        expected_type: audio|image (optional validation)
        
    Returns:
        {
            "status": "success",
            "base64_data": str,
            "content_type": str,
            "size_bytes": int
        }
    """
```

**✅ Uso en server.cjs:**
```javascript
const res = await runMCPTool('download_secure_file', { 
    url: audioUrl,
    expected_type: 'audio'
});
const data = JSON.parse(res.content[0].text);
const buffer = Buffer.from(data.base64_data, 'base64');
```

---

## 🔍 Herramientas de Investigación (Research)

### **research_start**
```python
def research_start(
    query: str,
    source: str = "web",
    mode: str = "fast",
    notebook_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """Deep research / fast research: Search web or Google Drive to FIND NEW sources.
    
    Args:
        query: What to search for
        source: web|drive
        mode: fast (~30s, ~10 sources) | deep (~5min, ~40 sources, web only)
        notebook_id: Existing notebook (creates new if not provided)
        title: Title for new notebook
    """
```

### **research_status**
```python
def research_status(
    notebook_id: str,
    poll_interval: int = 30,
    max_wait: int = 300,
    compact: bool = True,
    task_id: str | None = None,
) -> dict[str, Any]:
    """Poll research progress. Blocks until complete or timeout."""
```

### **research_import**
```python
def research_import(
    notebook_id: str,
    task_id: str,
    source_indices: list[int] | None = None,
) -> dict[str, Any]:
    """Import discovered sources into notebook.
    
    Call after research_status shows status="completed".
    """
```

---

## 📊 Herramientas de Generación de Contenido

- **infographic_create**: Genera infografías
- **video_overview_create**: Genera video overviews
- **slide_deck_create**: Genera presentaciones
- **flashcards_create**: Genera flashcards
- **quiz_create**: Genera quizzes
- **mind_map_create**: Genera mapas mentales
- **data_table_create**: Genera tablas de datos
- **report_create**: Genera reportes

---

## ⚠️ Errores Comunes Detectados

### ❌ **Error 1: Tool no existe**
```
Unknown tool: audio_generate
```
**Solución:** Usar `audio_overview_create` en su lugar.

### ❌ **Error 2: Argumento faltante**
```
Missing required argument notebook_id
```
**Solución:** Pasar siempre `notebook_id` a `studio_status`.

### ❌ **Error 3: Nombre de argumento incorrecto**
```javascript
// ❌ INCORRECTO
await runMCPTool('notebook_create', { name: 'Título' });

// ✅ CORRECTO
await runMCPTool('notebook_create', { title: 'Título' });
```

---

## 📝 Checklist de Validación

Antes de usar una herramienta MCP:

- [ ] ✅ El nombre del tool existe en la lista de 33 tools
- [ ] ✅ Los argumentos usan los nombres exactos de Python (snake_case)
- [ ] ✅ Los argumentos requeridos están presentes
- [ ] ✅ El tipo de dato es correcto (string, bool, list, etc.)
- [ ] ✅ Manejo de errores implementado (check `Unknown tool`, `validation error`)

---

## 🔗 Flujo Completo Validado

```javascript
// 1. Crear Notebook
const createRes = await runMCPTool('notebook_create', { title: `Foresvi: ${title}` });
const notebookId = JSON.parse(createRes.content[0].text).notebook.id;

// 2. Añadir Fuentes
await runMCPTool('notebook_add_url', { notebook_id: notebookId, url: sourceUrl });

// 3. Generar Audio
await runMCPTool('audio_overview_create', { 
    notebook_id: notebookId,
    focus_prompt: prompt,
    language: 'es',
    confirm: true
});

// 4. Verificar Estado
const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
const statusText = statusRes.content[0].text;

// 5. Descargar Audio
const downloadRes = await runMCPTool('download_secure_file', { 
    url: audioUrl,
    expected_type: 'audio'
});
```
