/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["SF Pro Display", "SF Pro Text", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      colors: {
        ink: "#000000",
        panel: "#111111",
        line: "rgba(255, 255, 255, 0.12)",
        mint: "#ff8a00",
        skyglass: "#f5f5f7",
        amberglow: "#ff8a00"
      },
      borderRadius: {
        md: "1rem",
        lg: "1.25rem",
        xl: "1.5rem"
      },
      boxShadow: {
        glow: "0 14px 36px rgba(255, 138, 0, 0.18)"
      }
    }
  },
  plugins: []
};
