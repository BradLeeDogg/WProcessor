import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findRanges } from '@shared/find'

export const findKey = new PluginKey('findReplace')

export interface FindMatch {
  from: number
  to: number
}
export interface FindState {
  query: string
  caseSensitive: boolean
  matches: FindMatch[]
  index: number
  deco: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setFind: (query: string, caseSensitive?: boolean) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      replaceCurrent: (text: string) => ReturnType
      replaceAll: (text: string) => ReturnType
      clearFind: () => ReturnType
    }
  }
}

function matchesIn(doc: PMNode, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return []
  const out: FindMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const charPos: number[] = []
    node.forEach((child, offset) => {
      if (!child.isText) return
      const s = child.text ?? ''
      const base = pos + 1 + offset
      for (let i = 0; i < s.length; i++) {
        text += s[i]
        charPos.push(base + i)
      }
    })
    for (const [s, e] of findRanges(text, query, caseSensitive)) {
      const from = charPos[s]
      const last = charPos[e - 1]
      if (from != null && last != null) out.push({ from, to: last + 1 })
    }
    return false
  })
  return out
}

function buildDeco(doc: PMNode, matches: FindMatch[], index: number): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, { class: i === index ? 'find-hit find-current' : 'find-hit' })
    )
  )
}

export function getFindState(state: EditorState): FindState | undefined {
  return findKey.getState(state) as FindState | undefined
}

/** In-document Find & Replace: highlights all matches, navigates, replaces. */
export const FindReplace = Extension.create({
  name: 'findReplace',

  addCommands() {
    return {
      setFind:
        (query: string, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(findKey, { query, caseSensitive }))
          return true
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(findKey, { query: '', caseSensitive: false }))
          return true
        },
      findNext:
        () =>
        ({ state, dispatch }) => {
          const st = getFindState(state)
          if (!st || !st.matches.length) return false
          const index = (st.index + 1) % st.matches.length
          const m = st.matches[index]!
          if (dispatch)
            dispatch(
              state.tr
                .setSelection(TextSelection.create(state.doc, m.from, m.to))
                .scrollIntoView()
                .setMeta(findKey, { index })
            )
          return true
        },
      findPrev:
        () =>
        ({ state, dispatch }) => {
          const st = getFindState(state)
          if (!st || !st.matches.length) return false
          const index = (st.index - 1 + st.matches.length) % st.matches.length
          const m = st.matches[index]!
          if (dispatch)
            dispatch(
              state.tr
                .setSelection(TextSelection.create(state.doc, m.from, m.to))
                .scrollIntoView()
                .setMeta(findKey, { index })
            )
          return true
        },
      replaceCurrent:
        (text: string) =>
        ({ state, dispatch }) => {
          const st = getFindState(state)
          const m = st?.matches[st.index]
          if (!m) return false
          if (dispatch) dispatch(state.tr.insertText(text, m.from, m.to).setMeta(findKey, {}))
          return true
        },
      replaceAll:
        (text: string) =>
        ({ state, dispatch }) => {
          const st = getFindState(state)
          if (!st || !st.matches.length) return false
          const tr = state.tr
          // back-to-front so earlier positions stay valid
          for (let i = st.matches.length - 1; i >= 0; i--) {
            const m = st.matches[i]!
            tr.insertText(text, m.from, m.to)
          }
          if (dispatch) dispatch(tr.setMeta(findKey, {}))
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({
            query: '',
            caseSensitive: false,
            matches: [],
            index: 0,
            deco: DecorationSet.empty
          }),
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
            let { query, caseSensitive, index } = prev
            if (meta && typeof meta.query === 'string') {
              query = meta.query
              caseSensitive = meta.caseSensitive ?? caseSensitive
              index = 0
            }
            if (meta && typeof meta.index === 'number') index = meta.index
            if (meta || tr.docChanged) {
              const matches = matchesIn(tr.doc, query, caseSensitive)
              if (index >= matches.length) index = 0
              return { query, caseSensitive, matches, index, deco: buildDeco(tr.doc, matches, index) }
            }
            return prev
          }
        },
        props: {
          decorations(state) {
            return (findKey.getState(state) as FindState | undefined)?.deco
          }
        }
      })
    ]
  }
})
