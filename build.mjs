import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/app.js',
  logLevel: 'info',
})

cpSync('src/index.html', 'dist/index.html')
cpSync('src/config.example.js', 'dist/config.example.js')
cpSync('node_modules/@zkmelabs/widget/dist/style.css', 'dist/zkme-style.css')
console.log('dist/ ready; deploy via scripts/deploy.sh, or cp config.public.js dist/config.js for a local test')
