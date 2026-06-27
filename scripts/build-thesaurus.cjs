/*
 * Build a compact offline thesaurus (resources/thesaurus.json) from the WordNet
 * 3.1 database (the `wordnet-db` dev dependency). Runs in plain Node — no native
 * modules — so it works in CI before packaging.
 *
 * Output shape: { [word]: Array<[pos, def, synonyms[], antonyms[]]> }
 *   pos: 'n' | 'v' | 'adj' | 'adv'
 * Only senses that carry at least one synonym or antonym are kept (it's a
 * thesaurus, not a dictionary), which keeps the file lean.
 */
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'resources', 'thesaurus.txt')

// Built once and cached; rebuild only when missing (or FORCE=1).
if (fs.existsSync(OUT) && !process.env.FORCE) {
  console.log(`thesaurus: ${OUT} already present (set FORCE=1 to rebuild)`)
  process.exit(0)
}

const DICT = require('wordnet-db').path

const FILES = { noun: 'n', verb: 'v', adj: 'adj', adv: 'adv' }
const POS_FILE = { n: 'noun', v: 'verb', a: 'adj', s: 'adj', r: 'adv' }

const clean = (w) => w.replace(/\(.*?\)$/, '').replace(/_/g, ' ').toLowerCase()
const cleanDef = (g) =>
  g
    .replace(/;?\s*"[^"]*"/g, '') // drop usage examples
    .replace(/\s+/g, ' ')
    .trim()

// Pass 1: read every synset, keyed by "file:offset", keeping words + antonym ptrs.
const synsets = new Map()
for (const [file] of Object.entries(FILES)) {
  const text = fs.readFileSync(path.join(DICT, `data.${file}`), 'utf8')
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('  ')) continue // license header
    const p = line.split(' ')
    const offset = p[0]
    const wCnt = parseInt(p[3], 16)
    const words = []
    let i = 4
    for (let k = 0; k < wCnt; k++) {
      words.push(p[i])
      i += 2
    }
    const pCnt = parseInt(p[i], 10)
    i++
    const ant = []
    for (let k = 0; k < pCnt; k++) {
      const sym = p[i]
      if (sym === '!') {
        ant.push({ file: POS_FILE[p[i + 2]], off: p[i + 1], src: parseInt(p[i + 3].slice(0, 2), 16), tgt: parseInt(p[i + 3].slice(2, 4), 16) })
      }
      i += 4
    }
    const gloss = line.includes('|') ? cleanDef(line.slice(line.indexOf('|') + 1)) : ''
    synsets.set(`${file}:${offset}`, { pos: FILES[file], words, gloss, ant })
  }
}

// Pass 2: build the word -> senses map, resolving antonym targets.
const out = Object.create(null)
for (const [, syn] of synsets) {
  syn.words.forEach((raw, idx) => {
    const word = clean(raw)
    if (!word) return
    const syns = []
    for (let j = 0; j < syn.words.length; j++) {
      if (j === idx) continue
      const s = clean(syn.words[j])
      if (s && !syns.includes(s)) syns.push(s)
    }
    const ants = []
    for (const a of syn.ant) {
      // src 0 = whole-synset antonym; otherwise it applies to word index src-1.
      if (a.src !== 0 && a.src - 1 !== idx) continue
      const target = synsets.get(`${a.file === 'noun' ? 'noun' : a.file === 'verb' ? 'verb' : a.file === 'adv' ? 'adv' : 'adj'}:${a.off}`)
      if (!target) continue
      const tw = a.tgt > 0 ? [target.words[a.tgt - 1]] : target.words
      for (const t of tw) {
        const c = t && clean(t)
        if (c && !ants.includes(c)) ants.push(c)
      }
    }
    if (!syns.length && !ants.length) return // thesaurus: skip senses with neither
    const list = out[word] || (out[word] = [])
    if (list.length < 16) list.push([syn.pos, syn.gloss, syns.slice(0, 24), ants.slice(0, 12)])
  })
}

// One line per word: "word<TAB>sensesJSON" — lets the app hold compact strings
// and parse just the looked-up entry instead of inflating the whole file.
fs.mkdirSync(path.dirname(OUT), { recursive: true })
const words = Object.keys(out)
const lines = words.map((w) => w + '\t' + JSON.stringify(out[w]))
fs.writeFileSync(OUT, lines.join('\n'))
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1)
console.log(`thesaurus: ${words.length} words -> ${OUT} (${mb} MB)`)
