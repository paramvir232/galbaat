/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#0c111d",
        panel: "#121a2b",
        line: "rgba(148, 163, 184, 0.18)",
        mint: "#29d3a7",
        skyglass: "#8ab4ff",
        amberglow: "#ffb86b"
      },
      boxShadow: {
        glow: "0 0 36px rgba(41, 211, 167, 0.22)"
      }
    }
  },
  plugins: []
};
