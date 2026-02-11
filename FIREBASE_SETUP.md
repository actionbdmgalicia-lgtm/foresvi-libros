# Configuración de Firebase Admin SDK

Para poder descargar y subir audios a Firebase Storage, necesitas configurar las credenciales de Firebase Admin.

## Pasos para obtener las credenciales:

1. **Ir a Firebase Console**
   - Abre: https://console.firebase.google.com/
   - Selecciona el proyecto: `foresvi-libros`

2. **Ir a Configuración del Proyecto**
   - Haz clic en el ícono de engranaje (⚙️) en la parte superior izquierda
   - Selecciona "Configuración del proyecto"

3. **Ir a Cuentas de Servicio**
   - En el menú lateral, selecciona "Cuentas de servicio"
   - O ve directamente a: https://console.firebase.google.com/project/foresvi-libros/settings/serviceaccounts/adminsdk

4. **Generar Nueva Clave Privada**
   - Haz clic en el botón "Generar nueva clave privada"
   - Confirma la acción
   - Se descargará un archivo JSON (algo como `foresvi-libros-firebase-adminsdk-xxxxx.json`)

5. **Guardar el Archivo**
   - Renombra el archivo descargado a: `firebase-admin-key.json`
   - Muévelo a la raíz del proyecto (la misma carpeta donde está `package.json`)

6. **Reiniciar el Servidor**
   - Detén el servidor (Ctrl+C)
   - Vuelve a ejecutar: `node server.cjs`
   - Deberías ver el mensaje: `[Firebase] Admin SDK initialized with service account`

## Seguridad

⚠️ **IMPORTANTE**: Este archivo contiene credenciales sensibles. 
- Ya está agregado al `.gitignore` para que no se suba a Git
- NO lo compartas públicamente
- NO lo subas a ningún repositorio

## Verificación

Una vez configurado, el servidor podrá:
- ✅ Descargar audios desde NotebookLM
- ✅ Subirlos a Firebase Storage
- ✅ Generar URLs públicas para reproducción
- ✅ Guardar transcripciones en la base de datos
