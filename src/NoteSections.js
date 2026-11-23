import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const sectionKey = new PluginKey('noteSections');

function documentSections(doc) {
  const sections = [];
  const blocks = [];
  function visit(parent, start) {
    const open = [];
    parent.forEach((node, offset) => {
      const position = start + offset;
      if (node.type.name === 'heading') {
        while (open.length && open[open.length - 1].level >= node.attrs.level) {
          open.pop().end = position;
        }
        open.forEach((section) => { section.hasContent = true; });
        blocks.push({ position, node, depth: open.length });
        const section = {
          position, start: position + node.nodeSize, end: start + parent.content.size,
          title: node.textContent, level: node.attrs.level, depth: open.length, hasContent: false,
        };
        open.push(section);
        sections.push(section);
      } else if (node.isBlock && open.length) {
        blocks.push({ position, node, depth: open.length });
        if (node.type.name !== 'paragraph' || node.textContent.trim()) {
          open.forEach((section) => { section.hasContent = true; });
        }
      }
      if (!node.isTextblock && !node.isLeaf) visit(node, position + 1);
    });
  }
  visit(doc, 0);
  return { sections, blocks };
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
          const headings = new Set(documentSections(transaction.doc).sections
            .filter((section) => section.hasContent).map((section) => section.position));
          return next.filter((position) => headings.has(position));
        },
      },
      props: {
        decorations(state) {
          const collapsed = sectionKey.getState(state);
          const decorations = [];
          const { sections, blocks } = documentSections(state.doc);
          blocks.forEach(({ position, node, depth }) => {
            decorations.push(Decoration.node(position, position + node.nodeSize, {
              class: `nr-section-block nr-section-depth-${Math.min(depth, 6)}`,
            }));
          });
          sections.forEach((section) => {
            if (sections.some((parent) => collapsed.includes(parent.position)
              && section.position >= parent.start && section.position < parent.end)) return;
            const folded = collapsed.includes(section.position);
            const title = section.title || 'Untitled section';
            if (section.hasContent) decorations.push(Decoration.widget(section.position, (view) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = `nr-section-toggle nr-section-level-${section.level} nr-section-depth-${Math.min(section.depth, 6)}`;
              button.contentEditable = 'false';
              button.dataset.sectionPosition = String(section.position);
              button.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} section ${title}`);
              button.setAttribute('aria-expanded', String(!folded));
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
            }, { key: `${section.position}-${section.level}-${section.depth}-${folded}-${title}`, side: -1, stopEvent: () => true }));
            const heading = state.doc.nodeAt(section.position);
            decorations.push(Decoration.node(section.position, section.position + heading.nodeSize, { class: 'nr-section-heading' }));
            if (folded) {
              state.doc.nodesBetween(section.start, section.end, (node, position) => {
                if (position >= section.start && position + node.nodeSize <= section.end && node.isBlock) {
                  decorations.push(Decoration.node(position, position + node.nodeSize, {
                    class: 'nr-folded-content', 'aria-hidden': 'true',
                  }));
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
        const expand = documentSections(state.doc).sections.filter((section) =>
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
