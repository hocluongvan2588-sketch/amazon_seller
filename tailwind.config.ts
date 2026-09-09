/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette for the internal ops platform
        brand: {
          50: "#eef4ff",
          100: "#dfe9ff",
          200: "#c5d6ff",
          300: "#a2baff",
          400: "#7c95fd",
          500: "#5e77f6",
          600: "#4157eb",
          700: "#3342d8",
          800: "#2c38b1",
          900: "#29378c",
          950: "#181f54",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};
