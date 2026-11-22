import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const sectionKey = new PluginKey('noteSections');

function sectionsIn(doc) {
  const sections = [];
  function visit(parent, start) {
    let current = null;
    parent.forEach((node, offset) => {
      const position = start + offset;
      if (node.type.name === 'heading' && node.attrs.level <= 2) {
        if (current) current.end = position;
        current = node.attrs.level === 2
          ? { position, start: position + node.nodeSize, end: start + parent.content.size, title: node.textContent }
          : null;
        if (current) sections.push(current);
      }
      if (!node.isTextblock && !node.isLeaf) visit(node, position + 1);
    });
  }
  visit(doc, 0);
  return sections;
}

export const NoteSections = Extension.create({
  name: 'noteSections',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: sectionKey,
      state: {
        init: () => [],
        apply(transaction, collapsed) {
          let next = collapsed.map((position) => transaction.mapping.mapResult(position, 1))
            .filter((result) => !result.deleted)
            .map((result) => result.pos);
          const action = transaction.getMeta(sectionKey);
          if (action?.clear) next = [];
          if (action?.toggle !== undefined) {
            next = next.includes(action.toggle)
              ? next.filter((position) => position !== action.toggle)
              : [...next, action.toggle];
          }
          if (action?.expand) next = next.filter((position) => !action.expand.includes(position));
          const headings = new Set(sectionsIn(transaction.doc).map((section) => section.position));
          return next.filter((position) => headings.has(position));
        },
      },
      props: {
        decorations(state) {
          const collapsed = sectionKey.getState(state);
          const decorations = [];
          sectionsIn(state.doc).forEach((section) => {
            const folded = collapsed.includes(section.position);
            const title = section.title || 'Untitled section';
            decorations.push(Decoration.widget(section.position, (view) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'nr-section-toggle';
              button.contentEditable = 'false';
              button.dataset.sectionPosition = String(section.position);
              button.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} section ${title}`);
              button.setAttribute('aria-expanded', String(!folded));
              button.textContent = folded ? '▸' : '▾';
              button.addEventListener('mousedown', (event) => event.preventDefault());
              button.addEventListener('click', () => {
                const restoreFocus = document.activeElement === button;
                let transaction = view.state.tr;
                const { from, to } = transaction.selection;
                if (!folded && (from < section.end && to >= section.start)) {
                  transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(section.position + 1)));
                }
                view.dispatch(transaction.setMeta(sectionKey, { toggle: section.position }).setMeta('addToHistory', false));
                if (restoreFocus) {
                  view.dom.querySelector(`.nr-section-toggle[data-section-position="${section.position}"]`)?.focus();
                }
              });
              return button;
            }, { key: `${section.position}-${folded}-${title}`, side: -1, stopEvent: () => true }));
            const heading = state.doc.nodeAt(section.position);
            decorations.push(Decoration.node(section.position, section.position + heading.nodeSize, { class: 'nr-section-heading' }));
            if (folded) {
              state.doc.nodesBetween(section.start, section.end, (node, position) => {
                if (position >= section.start && position + node.nodeSize <= section.end && node.isBlock) {
                  decorations.push(Decoration.node(position, position + node.nodeSize, { class: 'nr-folded-content' }));
                  return false;
                }
                return true;
              });
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some((transaction) => transaction.selectionSet)) return null;
        const collapsed = sectionKey.getState(state);
        const { from, to } = state.selection;
        const expand = sectionsIn(state.doc).filter((section) =>
          collapsed.includes(section.position) && from < section.end && to >= section.start
        ).map((section) => section.position);
        return expand.length ? state.tr.setMeta(sectionKey, { expand }).setMeta('addToHistory', false) : null;
      },
    })];
  },
});

export function expandNoteSections(editor) {
  editor.view.dispatch(editor.state.tr.setMeta(sectionKey, { clear: true }).setMeta('addToHistory', false));
}
