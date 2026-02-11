const admin = require('firebase-admin');
const serviceAccount = require('./firebase-admin-key.json');

// Inicializar
console.log("Inicializando con project_id:", serviceAccount.project_id);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'foresvi-libros.firebasestorage.app'
});

async function testStorage() {
    try {
        const storage = admin.storage();

        // 1. Listar Buckets (Accediendo al cliente subyacente de GCS)
        console.log("\n--- Listando Buckets ---");
        // admin.storage().bucket() devuelve un Bucket, y bucket.storage devuelve el cliente GSC
        const [buckets] = await admin.storage().bucket().storage.getBuckets();
        if (buckets.length === 0) {
            console.log("⚠️ No se encontraron buckets. La cuenta de servicio puede no tener permisos o no hay buckets.");
        } else {
            console.log("Buckets encontrados:");
            buckets.forEach(b => console.log(` - ${b.name}`));
        }

        // 2. Probar acceso al bucket específico
        const targetBucketName = 'foresvi-libros.firebasestorage.app';
        console.log(`\n--- Probando acceso directo al bucket: ${targetBucketName} ---`);
        const bucket = storage.bucket(targetBucketName);
        const [exists] = await bucket.exists();
        console.log(`¿El bucket '${targetBucketName}' existe?: ${exists}`);

        if (exists) {
            console.log("Intentando subir archivo de prueba...");
            const file = bucket.file('debug_test.txt');
            await file.save('Hola mundo, prueba de escritura.', {
                metadata: { contentType: 'text/plain' }
            });
            console.log("✅ Archivo subido correctamente.");

            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            console.log("✅ Signed URL generada:", signedUrl);
        }

    } catch (error) {
        console.error("\n❌ ERROR GRAVE:", error);
    }
}

testStorage();
