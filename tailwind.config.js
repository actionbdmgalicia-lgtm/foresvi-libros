/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'foresvi-blue': '#003349',  /* FORESVI Azul corporativo */
                'foresvi-dark': '#001f2e',  /* Navy profundo para degradados */
                'foresvi-red':  '#E25454',  /* FORESVI Rojo corporativo */
                'foresvi-gray': '#717B8D',  /* FORESVI Gris medio */
                'foresvi-gold': '#F59E0B',  /* Dorado VIP */
            },
            fontFamily: {
                sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}
