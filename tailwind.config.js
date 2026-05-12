/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/*.html",
    "./client/js/**/*.js",
    "./routes/**/*.js",
    "./models/**/*.js",
    "./server.js"
  ],
  theme: {
    extend: {
      colors: {
        kymor: {
          bg: '#050505',
          panel: '#0a0a0b',
          dark: '#121214',
          input: '#121214',
          border: '#1f1f22',
          accent: '#14b8a6',
          primary: '#14b8a6',
          primaryHover: '#0d9488', 
          textMuted: '#9ca3af',   
          muted: '#64656b'       
        }
      }
    }
  },
  plugins: [],
}