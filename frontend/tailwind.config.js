/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1890ff",
        info: "#084298",
        success: "#39d353",
        warning: "#FFB900",
        error: "#FF5722",
      },
    },
  },
  plugins: [],
}
