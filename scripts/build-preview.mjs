import {readFile, writeFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
let [html, css, js, content] = await Promise.all(['public/index.html','public/styles.css','public/app.js','public/lease-content.json'].map(read));
js = js.replace("const content = await fetch('./lease-content.json').then(r => r.json());", () => `const content = ${JSON.stringify(JSON.parse(content)).replaceAll('<','\\u003c')};`)
  .replaceAll('./original-lease.pdf','./public/original-lease.pdf');
html = html.replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>', '')
  .replaceAll('./original-lease.pdf','./public/original-lease.pdf')
  .replace('href="./"', 'href="./Ontario-Lease-Preview.html"')
  .replace('</body>', () => `<script type="module">${js.replaceAll('</script','<\\/script')}</script></body>`);
await writeFile(new URL('Ontario-Lease-Preview.html', root), html);
console.log('Created Ontario-Lease-Preview.html — open it in a browser without a server.');
