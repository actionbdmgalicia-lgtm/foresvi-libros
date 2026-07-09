/**
 * Limpiar título del libro - eliminar palabras como "resumen", "libro", etc.
 * @param {string} title - Título del libro
 * @returns {string} Título limpio
 */
function cleanBookTitle(title) {
  if (!title) return '';

  // Palabras a eliminar (case-insensitive)
  const stopwords = [
    'resumen', 'resumen libro', 'libro', 'capítulo', 'cap.',
    'investigación', 'investigacion', 'análisis', 'analisis',
    'estudio', 'apuntes', 'notas', 'extracto', 'síntesis',
    'resena', 'reseña', 'descripción', 'descripcion'
  ];

  let cleaned = title.trim();

  // Eliminar stopwords del inicio o final
  stopwords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b[:\\s-]*|[:\\s-]*\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '').trim();
  });

  // Si el resultado está vacío, usar el original
  if (cleaned.length === 0) {
    cleaned = title.trim();
  }

  return cleaned;
}

/**
 * Buscar en Google Books API (oficial de Google)
 */
async function searchGoogleBooks(bookTitle) {
  try {
    const query = encodeURIComponent(bookTitle);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5&printType=books`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      for (const book of data.items) {
        const imageUrl = book.volumeInfo?.imageLinks?.thumbnail;
        if (imageUrl) {
          // Cambiar thumbnail por larger image
          const largerImage = imageUrl.replace('&zoom=1', '&zoom=2').replace('edge=curl', '');
          console.log(`✅ [imageSearch] Found in Google Books: ${bookTitle}`);
          return largerImage;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('[imageSearch] Google Books error:', error.message);
    return null;
  }
}

/**
 * Buscar en Open Library (sin API key, gratis)
 */
async function searchOpenLibrary(bookTitle) {
  try {
    const query = encodeURIComponent(bookTitle);
    const url = `https://openlibrary.org/search.json?title=${query}&limit=5`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    if (data.docs && data.docs.length > 0) {
      for (const book of data.docs) {
        if (book.cover_i) {
          const imageUrl = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`;
          console.log(`✅ [imageSearch] Found in Open Library: ${bookTitle}`);
          return imageUrl;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('[imageSearch] Open Library error:', error.message);
    return null;
  }
}

/**
 * Buscar imágenes de libros - NUEVA ESTRATEGIA
 * 1. Google Books API (oficial, tiene casi todos los libros)
 * 2. Open Library (gratis, sin API key, muy confiable)
 * 3. Infografía generada (fallback)
 *
 * @param {string} bookTitle - Título del libro
 * @param {Object} book - Objeto del libro (para fallback a infografía)
 * @returns {Promise<string|null>} URL de la imagen o null si no encuentra
 */
export async function searchBookImage(bookTitle, book = null) {
  try {
    if (!bookTitle || bookTitle.trim().length === 0) {
      return null;
    }

    const cleanedTitle = cleanBookTitle(bookTitle);
    console.log(`[imageSearch] Original: "${bookTitle}"`);
    console.log(`[imageSearch] Cleaned: "${cleanedTitle}"`);
    console.log(`[imageSearch] Intentando buscar en Google Books + Open Library...`);

    // PASO 1: Intentar Google Books API
    console.log(`[imageSearch] 1️⃣ Buscando en Google Books...`);
    let imageUrl = await searchGoogleBooks(cleanedTitle);
    if (imageUrl) {
      return imageUrl;
    }

    // PASO 2: Intentar Open Library (gratis, sin API key)
    console.log(`[imageSearch] 2️⃣ Buscando en Open Library...`);
    imageUrl = await searchOpenLibrary(cleanedTitle);
    if (imageUrl) {
      return imageUrl;
    }

    // PASO 3: Fallback - buscar infografía del libro
    console.log(`[imageSearch] 3️⃣ Buscando infografía generada...`);
    if (book && book.artifactDownloads) {
      const infographicFile = Object.values(book.artifactDownloads).find(
        d => d.fileName?.endsWith('.png')
      );

      if (infographicFile) {
        console.log(`✅ [imageSearch] Usando infografía como fallback`);
        return `INFOGRAPHIC:${infographicFile.path}`;
      }
    }

    console.warn(`[imageSearch] No se encontró imagen para: "${bookTitle}"`);
    return null;
  } catch (error) {
    console.error('[imageSearch] Error:', error.message);
    return null;
  }
}

/**
 * Buscar imágenes en lote (para múltiples libros)
 * @param {Array<{id: string, title: string}>} books - Array de libros
 * @param {Function} onUpdate - Callback para actualizar cada libro
 */
export async function searchBooksImages(books, onUpdate) {
  for (const book of books) {
    const imageUrl = await searchBookImage(book.title);
    if (imageUrl) {
      onUpdate(book.id, imageUrl);
    }
    // Pequeño delay para no saturar API
    await new Promise(r => setTimeout(r, 300));
  }
}
