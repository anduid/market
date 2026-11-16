/** Token desain diambil dari desain ANDU.my.id (Alfagift style). */
module.exports = {
  content: [
    './_layouts/**/*.html', './_includes/**/*.html', './*.html', './*.md',
    './produk/*.html', './superadmin/*.html', './assets/js/**/*.js'
  ],
  safelist: ['hidden', 'animate-pulse'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#3DDC84', dark: '#2cb86c', deeper: '#289d5c', light: '#e8faf0', accent: '#0F172A' },
        slate: { 850: '#151f32', 950: '#080d1a' }
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
