/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Avoid fighting the existing SCSS design system — utilities are opt-in via className.
  corePlugins: {
    preflight: false,
  },
};
