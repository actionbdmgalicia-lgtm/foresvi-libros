export const coursesData = [
    {
        id: 1,
        title: "Instalación Eficiente de Placas Solares",
        instructor: "Ing. Roberto Mendez",
        role: "Referente Nacional",
        description: "Aprende el proceso completo de instalación, desde la estructura hasta el conexionado final, evitando los errores más comunes que cometen el 80% de los instaladores.",
        validation: "98%",
        level: "Intermedio",
        duration: "4h 20m",
        image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        tags: ["Solar", "Técnico"],
        // Example YouTube video (Solar Installation)
        videoUrl: "https://www.youtube.com/watch?v=VisualsReferenceURL",
        modules: [
            {
                title: "Módulo 1: Fundamentos y Estructura",
                lessons: [
                    { title: "1.1 Tipos de anclajes según cubierta", duration: "15:20", locked: false, videoUrl: "https://www.youtube.com/watch?v=Example1" },
                    { title: "1.2 Errores frecuentes en la estructura", duration: "12:45", locked: false, videoUrl: "https://www.youtube.com/watch?v=Example2" },
                    { title: "1.3 Cálculo de cargas de viento", duration: "20:10", locked: true }
                ]
            },
            {
                title: "Módulo 2: Conexionado Eléctrico",
                lessons: [
                    { title: "2.1 Strings y voltajes máximos", duration: "18:30", locked: true },
                    { title: "2.2 Protecciones DC y AC", duration: "25:00", locked: true }
                ]
            }
        ]
    },
    {
        id: 2,
        title: "Normativa de Seguridad Industrial 2025",
        instructor: "Laura Varela",
        role: "Auditora Certificada",
        level: "Avanzado",
        validation: "99%",
        duration: "2h 15m",
        image: "https://images.unsplash.com/photo-1581092921461-eab62e97a783?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        tags: ["Seguridad", "Normativa"],
        videoUrl: "https://www.youtube.com/watch?v=Example3",
        modules: [
            {
                title: "Módulo 1: Nueva Normativa",
                lessons: [
                    { title: "1.1 Cambios en el reglamento", duration: "10:00", locked: false },
                    { title: "1.2 EPIs obligatorios", duration: "15:00", locked: true }
                ]
            }
        ]
    },
    {
        id: 3,
        title: "Fundamentos de Electricidad para Reformas",
        instructor: "Carlos Otero",
        role: "Maestro Electricista",
        level: "Iniciación",
        validation: "95%",
        duration: "6h 00m",
        image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
        tags: ["Electricidad", "Básico"],
        videoUrl: "https://www.youtube.com/watch?v=Example4",
        modules: []
    }
];
