import { Extension } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection, Transaction } from '@tiptap/pm/state';
import { liftTarget } from '@tiptap/pm/transform';

const LIST_TYPES = ['bulletList', 'orderedList', 'taskList'];
export const BULLET_STYLES = ['disc', 'circle', 'square'];
const ORDERED_STYLES = [null, 'a', 'A', 'i', 'I'];

function mixedList(state) {
  const { $from, $to } = state.selection;
  for (let depth = $from.depth; depth > 1; depth -= 1) {
    const list = $from.node(depth);
    if (!LIST_TYPES.includes(list.type.name)) continue;
    const parentItem = $from.node(depth - 1);
    const outerList = $from.node(depth - 2);
    if (!['listItem', 'taskItem'].includes(parentItem.type.name) || !LIST_TYPES.includes(outerList.type.name)) return null;
    if (list.type === outerList.type && (JSON.stringify(list.attrs) === JSON.stringify(outerList.attrs)
      || (list.type.name === 'bulletList' && list.attrs.autoBulletStyle)
      || (list.type.name === 'orderedList' && list.attrs.autoOrderedStyle))) return null;
    const range = $from.blockRange($to, (node) => node === list);
    if (!range) return null;
    return { list, depth, range };
  }
  return null;
}

function adjacentList(state) {
  const { $from, $to } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const list = $from.node(depth);
    if (!LIST_TYPES.includes(list.type.name)) continue;
    const range = $from.blockRange($to, (node) => node === list);
    if (!range || range.startIndex !== 0) return null;
    const position = $from.before(depth);
    const previous = state.doc.resolve(position).nodeBefore;
    if (!previous || !LIST_TYPES.includes(previous.type.name) || !previous.lastChild) return null;
    return { list, range, position, previous };
  }
  return null;
}

function newNestedStyle(state) {
  const { $from, $to } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const list = $from.node(depth);
    if (!LIST_TYPES.includes(list.type.name)) continue;
    const range = $from.blockRange($to, (node) => node === list);
    if (!range || range.startIndex === 0 || list.child(range.startIndex - 1).lastChild?.type === list.type) return null;
    if (list.type.name === 'bulletList') {
      const current = BULLET_STYLES.indexOf(list.attrs.bulletStyle || 'disc');
      return { bulletStyle: BULLET_STYLES[(current + 1) % BULLET_STYLES.length], autoBulletStyle: true };
    }
    if (list.type.name === 'orderedList') {
      const current = ORDERED_STYLES.indexOf(list.attrs.type === '1' ? null : list.attrs.type);
      return { type: ORDERED_STYLES[(current + 1) % ORDERED_STYLES.length], autoOrderedStyle: true };
    }
    return null;
  }
  return null;
}

function indentAdjacentList({ state, tr, dispatch }) {
  const context = adjacentList(state);
  if (!context) return false;
  const { list, range, position, previous } = context;
  const children = [];
  list.forEach((child) => children.push(child));
  const selected = list.copy(Fragment.fromArray(children.slice(0, range.endIndex)));
  const remaining = children.slice(range.endIndex);
  const last = previous.lastChild;
  const updatedItem = last.copy(last.content.append(Fragment.from(selected)));
  const updatedPrevious = previous.copy(previous.content.replaceChild(previous.childCount - 1, updatedItem));
  const previousPos = position - previous.nodeSize;
  const nestedPos = previousPos + previous.nodeSize - 2;
  const selectionFrom = nestedPos + 1 + state.selection.from - (position + 1);
  const selectionTo = nestedPos + 1 + state.selection.to - (position + 1);
  const transaction = new Transaction(state);
  transaction.replaceWith(previousPos, position + list.nodeSize, Fragment.fromArray([
    updatedPrevious,
    ...(remaining.length ? [list.copy(Fragment.fromArray(remaining))] : []),
  ]));
  transaction.setSelection(TextSelection.create(transaction.doc, selectionFrom, selectionTo));
  if (dispatch) {
    transaction.steps.forEach((step) => tr.step(step));
    tr.setSelection(TextSelection.create(tr.doc, transaction.selection.from, transaction.selection.to)).scrollIntoView();
  }
  return true;
}

function outdentMixedList({ state, tr, dispatch }) {
  const context = mixedList(state);
  if (!context) return false;
  const { list, depth, range } = context;
  const children = [];
  list.forEach((child) => children.push(child));
  const before = children.slice(0, range.startIndex);
  const selected = children.slice(range.startIndex, range.endIndex);
  const after = children.slice(range.endIndex);
  const beforeList = before.length ? list.copy(Fragment.fromArray(before)) : null;
  const afterList = after.length ? list.copy(Fragment.fromArray(after)) : null;
  if (afterList) {
    // Match normal list outdent behavior: later siblings follow the lifted item as children.
    const last = selected[selected.length - 1];
    selected[selected.length - 1] = last.copy(last.content.append(Fragment.from(afterList)));
  }
  const selectedList = list.copy(Fragment.fromArray(selected));
  const originalPos = state.selection.$from.before(depth);
  const selectedPos = originalPos + (beforeList?.nodeSize || 0);
  const originalStart = originalPos + 1 + before.reduce((size, node) => size + node.nodeSize, 0);
  const selectionFrom = selectedPos + 1 + state.selection.from - originalStart;
  const selectionTo = selectedPos + 1 + state.selection.to - originalStart;
  const transaction = new Transaction(state);
  transaction.replaceWith(originalPos, originalPos + list.nodeSize,
    Fragment.fromArray([beforeList, selectedList].filter(Boolean)));
  transaction.setSelection(TextSelection.create(transaction.doc, selectionFrom, selectionTo));
  const start = transaction.doc.resolve(selectedPos);
  const end = transaction.doc.resolve(selectedPos + selectedList.nodeSize);
  const liftRange = start.blockRange(end);
  const target = liftRange && liftTarget(liftRange);
  if (target == null) return false;
  transaction.lift(liftRange, target).scrollIntoView();
  if (dispatch) {
    transaction.steps.forEach((step) => tr.step(step));
    tr.setSelection(TextSelection.create(tr.doc, transaction.selection.from, transaction.selection.to)).scrollIntoView();
  }
  return true;
}

export function canOutdentList(editor, itemType) {
  if (mixedList(editor.state)) return editor.can().command(outdentMixedList);
  return editor.can().liftListItem(itemType);
}

export function canIndentList(editor, itemType) {
  return editor.can().sinkListItem(itemType) || editor.can().command(indentAdjacentList);
}

export function indentList(editor, itemType) {
  const chain = editor.chain().focus();
  if (!editor.can().sinkListItem(itemType)) return chain.command(indentAdjacentList).run();
  const style = newNestedStyle(editor.state);
  chain.sinkListItem(itemType);
  if (style) {
    chain.command(({ tr, dispatch }) => {
      const { $from } = tr.selection;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (LIST_TYPES.includes(node.type.name)) {
          if (dispatch) tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, ...style });
          return true;
        }
      }
      return false;
    });
  }
  return chain.run();
}

export function outdentList(editor, itemType) {
  const chain = editor.chain().focus();
  return mixedList(editor.state) ? chain.command(outdentMixedList).run() : chain.liftListItem(itemType).run();
}

function moveIntoNestedList(editor) {
  const { selection, doc } = editor.state;
  const { $from } = selection;
  if (!selection.empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size || $from.depth < 2) return false;
  const item = $from.node(-1);
  if (!['listItem', 'taskItem'].includes(item.type.name)) return false;
  const next = item.maybeChild($from.indexAfter(-1));
  if (!next || !LIST_TYPES.includes(next.type.name)) return false;
  const start = $from.after();
  const target = TextSelection.findFrom(doc.resolve(start + 1), 1, true);
  if (!target || target.from >= start + next.nodeSize) return false;
  editor.view.dispatch(editor.state.tr.setSelection(target).scrollIntoView());
  return true;
}

function backspaceMixedList(editor) {
  const { selection } = editor.state;
  if (!selection.empty || selection.$from.depth < 2 || selection.$from.parentOffset !== 0 || selection.$from.index(-1) !== 0
    || !mixedList(editor.state)) return false;
  outdentList(editor, '');
  return true;
}

export const NoteListHierarchy = Extension.create({
  name: 'noteListHierarchy',
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this;
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth);
          if (!LIST_TYPES.includes(node.type.name)) continue;
          const itemType = node.firstChild.type.name;
          return canIndentList(editor, itemType) && indentList(editor, itemType);
        }
        return false;
      },
      'Shift-Tab': () => {
        if (!mixedList(this.editor.state)) return false;
        outdentList(this.editor, '');
        return true;
      },
      Delete: () => moveIntoNestedList(this.editor),
      'Mod-Delete': () => moveIntoNestedList(this.editor),
      Backspace: () => backspaceMixedList(this.editor),
      'Mod-Backspace': () => backspaceMixedList(this.editor),
    };
  },
});
