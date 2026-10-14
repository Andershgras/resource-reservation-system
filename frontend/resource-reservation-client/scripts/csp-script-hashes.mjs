// Prints the Content-Security-Policy hash of each inline <script> in a built
// index.html, such as 'sha256-abc...=', separated by spaces. The frontend
// image's nginx config allows exactly these, so the inline theme script runs
// and no other inline script can. Usage: node csp-script-hashes.mjs dist/index.html
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [htmlPath] = process.argv.slice(2)

if (!htmlPath) {
  console.error('Usage: node csp-script-hashes.mjs <path to index.html>')
  process.exit(1)
}

// The HTML parser turns CRLF and lone CR into LF before it hashes a script, so
// a file checked out with Windows line endings must be hashed the same way.
const html = readFileSync(htmlPath, 'utf8').replace(/\r\n?/g, '\n')
// Scripts without a src attribute. Browsers hash the exact text between the
// tags, including other whitespace.
const inlineScripts = html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)
const hashes = [...inlineScripts].map(
  ([, body]) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`,
)

process.stdout.write(hashes.join(' '))
