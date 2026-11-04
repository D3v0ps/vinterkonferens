// Gör om Vites index.html till en artifact-sida: plattformen lägger själv till
// <!doctype>, <html>, <head> och <body>, så sidan ska bara innehålla innehållet.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = process.argv[2] ?? 'dist-artifact'
const html = readFileSync(`${dir}/index.html`, 'utf8')
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
const keep = head
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/<meta charset|<meta name="viewport"/i.test(l))
const title = keep.filter((l) => l.startsWith('<title'))
const rest = keep.filter((l) => !l.startsWith('<title'))
writeFileSync(`${dir}/vinterkonferensen.html`, [...title, ...rest, body.trim(), ''].join('\n'))
console.log(`Skrev ${dir}/vinterkonferensen.html`)
