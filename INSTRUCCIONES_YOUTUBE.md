# Guía de integración con YouTube y Generación de Informes

## 1. Configuración de Credenciales de YouTube (Obligatorio para subida automática)

Para que Foresvi pueda subir automáticamente los videos generados a YouTube, necesitas configurar las credenciales OAuth 2.0.

1.  Ve a la [Google Cloud Console](https://console.cloud.google.com/).
2.  Crea un proyecto (o usa uno existente asociado a Foresvi).
3.  Habilita la **YouTube Data API v3**.
4.  Ve a "Credenciales" -> "Crear Credenciales" -> "ID de cliente de OAuth".
5.  Tipo de aplicación: **Aplicación de escritorio** (o Web, pero Desktop es más fácil para scripts locales).
6.  Descarga el archivo JSON.
7.  Renómbralo a `client_secret.json`.
8.  Colócalo en la carpeta raíz del servidor: 
    `/Users/maccuatro/Library/CloudStorage/GoogleDrive-actionbdmgalicia@gmail.com/Mi unidad/0_FORESVI/Libros Foresvi/client_secret.json`

## 2. Autenticación Inicial

Una vez colocado el archivo:
1.  Abre tu navegador y ve a: `http://localhost:3001/api/auth/youtube`
2.  Te redirigirá a Google para dar permiso al canal de YouTube.
3.  Al aceptar, te dará un código o confirmación.
4.  Esto generará un archivo `tokens.json` en el servidor. ¡Listo!

## 3. Uso de la Biblioteca y Informes

- **Biblioteca**: Ahora la sección "Biblioteca" detecta automáticamente si el contenido está en YouTube o en el servidor interno.
- **Informes**: Se ha habilitado la pestaña "Informe" en la configuración de generación. Se generará un borrador de informe en NotebookLM que podrás consultar desde la nueva pestaña "Informe" en la vista de detalle del libro.

## 4. Recuperación de Contenidos Existentes

Si ya tienes libros generados con Audio/Video pero no aparecen:
- La vista de detalle del libro intentará reproducir el audio/video desde la URL interna (`firebasestorage`).
- Si deseas subirlos a YouTube, deberás regenerarlos o solicitar una función de "Sincronización manual" en el futuro.
