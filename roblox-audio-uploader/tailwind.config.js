/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'roblox-red': '#e2231a',
        'roblox-dark': '#1a1a2e',
        'roblox-darker': '#16213e',
        'roblox-accent': '#0f3460',
      },
    },
  },
  plugins: [],
}
