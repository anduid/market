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
        royal: { 50:'#EEF4FF',100:'#D9E6FF',200:'#BCD3FF',300:'#8EB6FF',500:'#2A66F6',600:'#1D5CE5',700:'#1546BE',800:'#143BA2',900:'#0F2C7A',950:'#091A4B' },
        amberSun: '#FFB800',
        slate: { 850: '#151f32', 950: '#080d1a' }
      },
      fontFamily: { display: ['Fredoka', 'ui-rounded', 'sans-serif'], sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
