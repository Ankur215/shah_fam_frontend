import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { API_URL, apiFetch, readApiResponse } from './api';
import FormDialog from './FormDialog';
import './NotesReminders.css';

const NOTES_ENDPOINT = `${API_URL}/api/notes`;
const REMINDERS_ENDPOINT = `${API_URL}/api/reminders`;
const REMINDER_LISTS_ENDPOINT = `${API_URL}/api/reminder-lists`;
const MAIN_VIEWS = ['Dashboard', 'Notes', 'Reminders', 'Trash'];
const SUB_VIEWS = {
  Notes: ['Notes', 'Pinned'],
  Reminders: ['Reminders', 'Calendar', 'Completed'],
};

async function requestJson(url, options = {}) {
  const response = await apiFetch(url, options.body
    ? { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }
    : options);
  return readApiResponse(response);
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function reminderDate(reminder) {
  if (reminder.snoozed_until) {
    return new Date(reminder.snoozed_until);
  }
  if (!reminder.due_date) return null;
  return new Date(`${reminder.due_date}T${reminder.due_time || '23:59:59'}`);
}

function formatDay(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function matchesSearch(values, search) {
  return values.some((value) => String(value || '').toLowerCase().includes(search));
}

function FormattedText({ text, onChecklistToggle }) {
  return <div className="nr-formatted">{(text || '').split('\n').map((line, index) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const checklist = line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    const bullet = !checklist && line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    const content = heading ? heading[2] : checklist ? checklist[2] : bullet ? bullet[1] : numbered ? numbered[2] : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part
    );
    if (checklist) return <label className="nr-checklist-item" key={index}>
      <input type="checkbox" checked={checklist[1].toLowerCase() === 'x'} disabled={!onChecklistToggle}
        onChange={(event) => onChecklistToggle(index, event.target.checked)} />
      <span>{parts}</span>
    </label>;
    return <div className={heading ? 'nr-text-heading' : bullet || numbered ? 'nr-text-bullet' : ''}
      key={index}>{bullet ? '• ' : numbered ? `${numbered[1]}. ` : ''}{parts}{!line && '\u00a0'}</div>;
  })}</div>;
}

const NotesReminders = forwardRef(function NotesReminders(props, ref) {
  const [view, setView] = useState('Dashboard');
  const [notes, setNotes] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [reminderLists, setReminderLists] = useState([]);
  const [trashReminderLists, setTrashReminderLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [listEditor, setListEditor] = useState(null);
  const [trashNotes, setTrashNotes] = useState([]);
  const [trashReminders, setTrashReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteEditor, setNoteEditor] = useState(null);
  const [selection, setSelection] = useState(null);
  const [showNoteDetail, setShowNoteDetail] = useState(false);
  const [switchingNote, setSwitchingNote] = useState(false);
  const [activeEditor, setActiveEditor] = useState(null);
  const [noteMenuId, setNoteMenuId] = useState(null);
  const [metadataEdit, setMetadataEdit] = useState(null);
  const inlineEditor = useRef(null);
  const dialogEditor = useRef(null);
  const reminderWorkspace = useRef(null);
  const noteMenu = useRef(null);
  const noteMenuButton = useRef(null);
  const selectionCounter = useRef(0);
  const switching = useRef(false);
  const [reminderEditor, setReminderEditor] = useState(null);
  const [search, setSearch] = useState('');
  const [dashboardCategory, setDashboardCategory] = useState('Overdue');
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [now, setNow] = useState(() => new Date());

  useImperativeHandle(ref, () => ({
    openFirstTab: () => switchView('Dashboard'),
    async flush() {
      if (switching.current) return false;
      switching.current = true;
      setSwitchingNote(true);
      try {
        if (dialogEditor.current && !(await dialogEditor.current.flush())) return false;
        return !inlineEditor.current || await inlineEditor.current.flush();
      } finally {
        switching.current = false;
        setSwitchingNote(false);
      }
    },
  }));

  const loadData = useCallback(async () => {
    const [nextNotes, nextReminders, nextTrashNotes, nextTrashReminders, nextLists, nextTrashLists] = await Promise.all([
      requestJson(NOTES_ENDPOINT),
      requestJson(REMINDERS_ENDPOINT),
      requestJson(`${NOTES_ENDPOINT}?trash=true`),
      requestJson(`${REMINDERS_ENDPOINT}?trash=true`),
      requestJson(REMINDER_LISTS_ENDPOINT),
      requestJson(`${REMINDER_LISTS_ENDPOINT}?trash=true`),
    ]);
    setNotes(nextNotes);
    setReminders(nextReminders);
    setTrashNotes(nextTrashNotes);
    setTrashReminders(nextTrashReminders);
    setReminderLists(nextLists);
    setTrashReminderLists(nextTrashLists);
  }, []);

  useEffect(() => {
    let active = true;
    loadData().catch((err) => {
      if (active) setError(`Could not load notes and reminders: ${err.message}`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [loadData]);

  useEffect(() => {
    if (noteMenuId === null) return undefined;
    function dismiss(event) {
      if (!noteMenu.current?.contains(event.target)) setNoteMenuId(null);
    }
    function keyDown(event) {
      if (event.key === 'Escape') {
        setNoteMenuId(null);
        noteMenuButton.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', keyDown);
    };
  }, [noteMenuId]);

  async function mutate(url, options, action) {
    setBusy(true);
    setError('');
    try {
      await requestJson(url, options);
      await loadData();
      return true;
    } catch (err) {
      setError(`${action}: ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeSelection(note, showDetail = true) {
    if (switching.current) return false;
    if (note?.id && note.id === selection?.note.id) {
      setShowNoteDetail(showDetail);
      return true;
    }
    switching.current = true;
    setSwitchingNote(true);
    try {
      if (inlineEditor.current && !(await inlineEditor.current.flush())) return false;
      setSelection(note ? { note, key: ++selectionCounter.current } : null);
      setShowNoteDetail(showDetail);
      return true;
    } finally {
      switching.current = false;
      setSwitchingNote(false);
    }
  }

  async function openNoteDialog(note) {
    if (switching.current) return;
    switching.current = true;
    setSwitchingNote(true);
    try {
      if (inlineEditor.current && !(await inlineEditor.current.flush())) return;
      setNoteEditor({ ...note });
    } finally {
      switching.current = false;
      setSwitchingNote(false);
    }
  }

  async function editNoteMetadata(note, field) {
    setNoteMenuId(null);
    if (await changeSelection({ ...note })) setMetadataEdit(field);
  }

  async function switchView(nextView) {
    if (switching.current) return;
    switching.current = true;
    setSwitchingNote(true);
    try {
      if (inlineEditor.current && !(await inlineEditor.current.flush())) return;
      if (nextView === 'Pinned' && selection &&
          !notes.find((note) => note.id === selection.note.id)?.is_pinned) {
        setSelection(null);
        setShowNoteDetail(false);
      }
      setView(nextView);
      setSearch('');
    } finally {
      switching.current = false;
      setSwitchingNote(false);
    }
  }

  async function saveNote(id, draft) {
    const saved = await requestJson(id ? `${NOTES_ENDPOINT}/${id}` : NOTES_ENDPOINT, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(draft),
    });
    return saved.id;
  }

  async function saveReminder(id, draft) {
    setBusy(true);
    setError('');
    try {
      await requestJson(id ? `${REMINDERS_ENDPOINT}/${id}` : REMINDERS_ENDPOINT, {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(draft),
      });
      await loadData();
      setReminderEditor(null);
    } catch (err) {
      setError(`Failed to save reminder: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveReminderList(id, draft) {
    setBusy(true);
    setError('');
    try {
      const saved = await requestJson(id ? `${REMINDER_LISTS_ENDPOINT}/${id}` : REMINDER_LISTS_ENDPOINT, {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(draft),
      });
      await loadData();
      setSelectedListId(saved.id);
      setListEditor(null);
      reminderWorkspace.current?.showDetail();
    } catch (err) {
      setError(`Failed to save reminder list: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function moveToTrash(type, item) {
    const endpoint = type === 'note' ? NOTES_ENDPOINT : REMINDERS_ENDPOINT;
    return mutate(`${endpoint}/${item.id}`, { method: 'DELETE' }, 'Could not move to trash');
  }

  function restore(type, item) {
    const endpoint = type === 'note' ? NOTES_ENDPOINT : type === 'list' ? REMINDER_LISTS_ENDPOINT : REMINDERS_ENDPOINT;
    mutate(`${endpoint}/${item.id}/restore`, { method: 'POST' }, 'Could not restore item');
  }

  function permanentlyDelete(type, item) {
    const contents = type === 'list' ? ' and all its items' : '';
    if (!window.confirm(`Permanently delete "${item.title}"${contents}? This cannot be undone.`)) return;
    const endpoint = type === 'note' ? NOTES_ENDPOINT : type === 'list' ? REMINDER_LISTS_ENDPOINT : REMINDERS_ENDPOINT;
    mutate(`${endpoint}/${item.id}?permanent=true`, { method: 'DELETE' }, 'Could not permanently delete item');
  }

  function updateReminder(item, changes) {
    mutate(`${REMINDERS_ENDPOINT}/${item.id}`, {
      method: 'PUT', body: JSON.stringify(changes),
    }, 'Could not update reminder');
  }

  const query = search.trim().toLowerCase();
  const matchingNotes = notes.filter((note) =>
    matchesSearch([note.title, note.content, note.group_name, ...(note.tags || [])], query));
  const pinnedNotes = notes.filter((note) => note.is_pinned);
  const matchingReminders = reminders.filter((reminder) =>
    matchesSearch([reminder.title, reminder.description, reminder.priority, reminder.recurrence], query));
  const matchingLists = reminderLists.filter((list) =>
    matchesSearch([list.name], query));
  const pending = reminders.filter((item) => !item.is_completed && reminderDate(item))
    .sort((a, b) => reminderDate(a) - reminderDate(b));
  const overdue = pending.filter((item) => reminderDate(item) < now);
  const today = pending.filter((item) => reminderDate(item) >= now && localDate(reminderDate(item)) === localDate(now));
  const upcoming = pending.filter((item) => reminderDate(item) >= now && localDate(reminderDate(item)) > localDate(now));
  const dashboardCategories = [
    { name: 'Overdue', items: overdue, description: 'Needs attention', empty: 'Nothing overdue.' },
    { name: 'Today', items: today, description: 'Coming up today', empty: 'Nothing due today.' },
    { name: 'Upcoming', items: upcoming, description: 'For another day', empty: 'No upcoming reminders.' },
  ];

  const noteList = (items, empty = 'No notes yet. Create one to get started!') => items.length
    ? <div className="nr-note-grid">{items.map((note) => (
      <article className="nr-card" key={note.id}>
        <div className="nr-card-top"><h3>{note.title}</h3>{note.is_pinned && <span className="nr-badge">Pinned</span>}</div>
        {note.group_name && <span className="nr-card-group">{note.group_name}</span>}
        <FormattedText text={note.content} />
        {!!note.tags?.length && <div className="nr-tags">{note.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <div className="nr-card-footer">
          <span>Updated {new Date(note.updated_at).toLocaleDateString()}</span>
          <div className="nr-actions">
            <button type="button" disabled={busy} onClick={() => mutate(`${NOTES_ENDPOINT}/${note.id}`, {
              method: 'PUT', body: JSON.stringify({ is_pinned: !note.is_pinned }),
            }, 'Could not update note')}>{note.is_pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" onClick={() => openNoteDialog(note)}>Edit</button>
            <button type="button" disabled={busy} onClick={() => moveToTrash('note', note)}>Trash</button>
          </div>
        </div>
      </article>
    ))}</div> : <p className="nr-empty">{empty}</p>;

  const reminderList = (items, empty = 'No reminders here yet.') => items.length
    ? <div className="nr-list">{items.map((item) => {
      const effective = reminderDate(item);
      const snoozed = Boolean(item.snoozed_until);
      return <article className="nr-reminder" key={item.id}>
        <div className="nr-reminder-main">
          <button type="button" className="nr-check" disabled={busy} aria-pressed={item.is_completed}
            aria-label={`${item.is_completed ? 'Reopen' : 'Complete'} ${item.title}`}
            onClick={() => updateReminder(item, { is_completed: !item.is_completed })}>
            {item.is_completed ? '✓' : ''}
          </button>
          <div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}
            <div className="nr-meta">
              <span>{snoozed ? `Snoozed until ${effective.toLocaleString()}` : item.due_date ? `Due ${formatDay(item.due_date)}${item.due_time ? ` · ${item.due_time.slice(0, 5)}` : ''}` : 'No due date'}</span>
              <span className={`nr-priority nr-priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
              {item.recurrence && <span>Repeats {item.recurrence}</span>}
            </div>
          </div>
        </div>
        <div className="nr-actions">
          {!item.is_completed && <>
            <button type="button" disabled={busy} onClick={() => updateReminder(item, { snoozed_until: new Date(Date.now() + 3600000).toISOString() })}>Snooze 1h</button>
            <button type="button" disabled={busy} onClick={() => updateReminder(item, { snoozed_until: new Date(Date.now() + 86400000).toISOString() })}>Snooze 1d</button>
          </>}
          <button type="button" onClick={() => setReminderEditor({ ...item })}>Edit</button>
          <button type="button" disabled={busy} onClick={() => moveToTrash('reminder', item)}>Trash</button>
        </div>
      </article>;
    })}</div> : <p className="nr-empty">{empty}</p>;

  const section = (title, items, render, empty) => <section className="nr-section">
    <div className="nr-section-heading"><h2>{title}</h2><span>{items.length}</span></div>
    {render(items, empty)}
  </section>;

  const groupedNotes = new Map();
  notes.forEach((note) => {
    const group = note.group_name || null;
    if (!groupedNotes.has(group)) groupedNotes.set(group, []);
    groupedNotes.get(group).push(note);
  });
  const groupNames = [...groupedNotes.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const visibleNotes = view === 'Pinned' ? pinnedNotes : notes;
  const visibleGroups = new Map();
  visibleNotes.forEach((note) => {
    const group = note.group_name || null;
    if (!visibleGroups.has(group)) visibleGroups.set(group, []);
    visibleGroups.get(group).push(note);
  });
  const visibleGroupNames = [...visibleGroups.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const selectedNote = notes.find((note) => note.id === selection?.note.id) || selection?.note;

  useEffect(() => {
    if (!reminderLists.some((list) => list.id === selectedListId)) {
      setSelectedListId(reminderLists[0]?.id ?? null);
    }
  }, [reminderLists, selectedListId]);

  useEffect(() => {
    const candidates = view === 'Pinned' ? notes.filter((note) => note.is_pinned) : notes;
    if ((view === 'Notes' || view === 'Pinned') && !selection && candidates.length) {
      setSelection({ note: candidates[0], key: ++selectionCounter.current });
    }
  }, [view, selection, notes]);

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const selectedReminders = reminders.filter((item) => reminderDate(item) && localDate(reminderDate(item)) === selectedDate);
  const changeMonth = (offset) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(localDate(next));
  };
  const activeMainView = Object.keys(SUB_VIEWS).find((main) =>
    SUB_VIEWS[main].includes(view)) || view;

  return <div className="page-content notes-reminders-container">
    <header className="section-header nr-header">
      <div><h1>Notes &amp; Reminders</h1>
        <p>A little space for the things you want to remember.</p></div>
      <div className="nr-header-actions">
        <button type="button" className="nr-button nr-button-primary" disabled={loading || switchingNote} onClick={async () => {
          if (activeMainView === 'Notes' && !query) {
            if (await changeSelection({})) { setView('Notes'); setSearch(''); setMetadataEdit('title'); }
          } else {
            openNoteDialog({});
          }
        }}>+ New Note</button>
        <button type="button" className="nr-button nr-button-primary" disabled={loading}
          onClick={() => setReminderEditor({ list_id: selectedListId })}>+ New Reminder</button>
      </div>
    </header>
    <div className="nr-navigation">
      <nav className="nr-nav" aria-label="Notes and reminders navigation">
        {MAIN_VIEWS.map((item) => <button key={item} type="button" aria-current={activeMainView === item ? 'page' : undefined}
          className={activeMainView === item ? 'nr-nav-active' : ''} onClick={() => switchView(item)}>{item}</button>)}
      </nav>
      {SUB_VIEWS[activeMainView] && <nav className="nr-subnav" aria-label={`${activeMainView} sections`}>
        {SUB_VIEWS[activeMainView].map((item) => <button key={item} type="button" aria-current={view === item ? 'page' : undefined}
          className={view === item ? 'nr-subnav-active' : ''} onClick={() => switchView(item)}>{item}</button>)}
      </nav>}
    </div>
    <div className="nr-search"><label htmlFor="nr-global-search">Search notes and reminders</label>
      <div className="nr-search-field">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
        </svg>
        <input id="nr-global-search" type="search" placeholder="Search notes and reminders..." value={search}
          onChange={(event) => setSearch(event.target.value)} />
      </div>
    </div>
    {error && <p className="nr-error" role="alert">{error}</p>}
    {loading ? <p className="nr-empty">Loading notes and reminders...</p> : query ? <>
      {section('Notes', matchingNotes, noteList, 'No matching notes.')}
      {section('Reminders', matchingReminders, reminderList, 'No matching reminders.')}
      {section('Reminder lists', matchingLists, (lists, empty) => lists.length
        ? <div className="nr-list">{lists.map((list) => <button type="button" className="nr-search-list"
          key={list.id} onClick={async () => {
            if (inlineEditor.current && !(await inlineEditor.current.flush())) return;
            setSelectedListId(list.id);
            setView('Reminders');
            setSearch('');
            reminderWorkspace.current?.showDetail();
          }}><strong>{list.name}</strong></button>)}</div>
        : <p className="nr-empty">{empty}</p>, 'No matching reminder lists.')}
    </> : view === 'Dashboard' ? <>
      <div className="nr-dashboard-columns">
        <div className="nr-dashboard-column" aria-label="Pinned notes">
          {section('Pinned notes', pinnedNotes, noteList, 'Pin a note to keep it close.')}
        </div>
        <div className="nr-dashboard-column" aria-label="Reminders overview">
          <section className="nr-dashboard-reminders">
            <div className="nr-section-heading"><h2>Reminders</h2></div>
            <div className="nr-dashboard-categories">
              {dashboardCategories.map(({ name, items, description, empty }) => {
                const expanded = dashboardCategory === name;
                const panelId = `nr-dashboard-${name.toLowerCase()}`;
                return <div className="nr-dashboard-category" key={name}>
                  <button type="button" className="nr-dashboard-category-toggle"
                    aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
                    onClick={() => setDashboardCategory(expanded ? null : name)}>
                    <span><strong>{name}</strong><small>{description}</small></span>
                    <span className="nr-dashboard-category-count">{items.length}</span>
                    <span className="nr-dashboard-category-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded && <div id={panelId} className="nr-dashboard-category-list">
                    {reminderList(items, empty)}
                  </div>}
                </div>;
              })}
            </div>
          </section>
        </div>
      </div>
    </> : view === 'Notes' || view === 'Pinned' || view === 'Reminders' ? null
      : view === 'Completed' ? section('Completed reminders', reminders.filter((item) => item.is_completed), reminderList, 'Completed reminders will appear here.')
      : view === 'Calendar' ? <div className="nr-calendar-layout">
        <section className="nr-calendar">
          <div className="nr-calendar-header"><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button>
            <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>›</button></div>
          <div className="nr-calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span className="nr-weekday" key={day}>{day}</span>)}
            {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const dateValue = localDate(new Date(month.getFullYear(), month.getMonth(), index + 1));
              const count = reminders.filter((item) => reminderDate(item) && localDate(reminderDate(item)) === dateValue).length;
              return <button type="button" key={dateValue} aria-label={`${formatDay(dateValue)}${count ? `, ${count} reminders` : ''}`}
                aria-pressed={selectedDate === dateValue} className={selectedDate === dateValue ? 'nr-date-selected' : ''}
                onClick={() => setSelectedDate(dateValue)}><span>{index + 1}</span>{count > 0 && <small>{count}</small>}</button>;
            })}
          </div>
        </section>
        <section className="nr-section"><div className="nr-section-heading"><h2>{formatDay(selectedDate)}</h2>
          <button type="button" className="nr-link" onClick={() => setReminderEditor({ due_date: selectedDate })}>+ Add reminder</button></div>
          {reminderList(selectedReminders, 'No reminders on this date.')}</section>
      </div> : <section className="nr-section"><div className="nr-section-heading"><h2>Trash</h2></div>
        <p className="nr-help">Restore an item or permanently delete it.</p>
        {!trashNotes.length && !trashReminders.length && !trashReminderLists.length ? <p className="nr-empty">Trash is empty.</p> :
          <div className="nr-list">{[...trashNotes.map((item) => ({ ...item, type: 'note' })),
            ...trashReminders.map((item) => ({ ...item, type: 'reminder' })),
            ...trashReminderLists.map((item) => ({ ...item, type: 'list', title: item.name }))].map((item) =>
            <article className="nr-reminder" key={`${item.type}-${item.id}`}><div><h3>{item.title}</h3><span className="nr-help">{item.type === 'note' ? 'Note' : item.type === 'list' ? 'Reminder list and its items' : 'Reminder'}</span></div>
              <div className="nr-actions"><button type="button" disabled={busy} onClick={() => restore(item.type, item)}>Restore</button>
                <button type="button" disabled={busy} onClick={() => permanentlyDelete(item.type, item)}>Delete permanently</button></div></article>)}</div>}
      </section>}
    <ReminderWorkspace ref={reminderWorkspace}
      hidden={loading || Boolean(query) || view !== 'Reminders'}
      lists={reminderLists} reminders={reminders} selectedListId={selectedListId}
      onSelect={setSelectedListId} busy={busy} onNewList={() => setListEditor({})}
      onEditList={(list) => setListEditor(list)} onEditItem={(item) => setReminderEditor(item)}
      onUpdateItem={updateReminder} onTrashItem={(item) => moveToTrash('reminder', item)}
      onTrashList={(list) => mutate(`${REMINDER_LISTS_ENDPOINT}/${list.id}`, { method: 'DELETE' }, 'Could not move list to trash')}
      onAddItem={async (title, listId) => mutate(REMINDERS_ENDPOINT, {
        method: 'POST', body: JSON.stringify({ title, list_id: listId }),
      }, 'Could not add reminder')} />
    <div className={`nr-note-workspace${showNoteDetail ? ' nr-note-detail-open' : ''}`}
      hidden={loading || Boolean(query) || (view !== 'Notes' && view !== 'Pinned')}>
      <aside className="nr-note-sidebar" aria-label="Note list">
        <div className="nr-note-sidebar-heading"><h2>{view === 'Pinned' ? 'Pinned notes' : 'Notes'}</h2><span>{visibleNotes.length}</span></div>
        {!loading && !query && (view === 'Notes' || view === 'Pinned') && !visibleNotes.length &&
          <p className="nr-note-list-empty">{view === 'Pinned' ? 'Pin a note to keep it close.' : 'No notes yet. Create one to get started!'}</p>}
        {!loading && !query && (view === 'Notes' || view === 'Pinned') &&
          [...visibleGroupNames, ...(visibleGroups.has(null) ? [null] : [])].map((group) =>
          <section className="nr-note-list-group" key={group === null ? '__ungrouped__' : `group-${group}`}>
            <h3>{group === null ? 'Ungrouped notes' : `Group: ${group}`}</h3>
            {visibleGroups.get(group).map((note) => <div key={note.id} className="nr-note-list-entry"
              ref={noteMenuId === note.id ? noteMenu : undefined}
              onContextMenu={(event) => {
                if (switchingNote) return;
                event.preventDefault();
                setNoteMenuId(note.id);
              }}>
              <div className="nr-note-list-row">
                <button type="button"
                  className={`nr-note-list-item${selection?.note.id === note.id ? ' nr-note-list-selected' : ''}`}
                  aria-current={selection?.note.id === note.id ? 'true' : undefined}
                  disabled={switchingNote}
                  onClick={() => { setNoteMenuId(null); changeSelection({ ...note }); }}>
                  <strong>{note.title}</strong>
                  <span>{note.content?.replace(/\n/g, ' ') || 'No additional text'}</span>
                  <small>{new Date(note.updated_at).toLocaleDateString()}{note.is_pinned ? ' · Pinned' : ''}</small>
                </button>
                <button type="button" className="nr-note-menu-trigger" aria-label={`Options for ${note.title}`}
                  aria-expanded={noteMenuId === note.id} disabled={switchingNote}
                  ref={noteMenuId === note.id ? noteMenuButton : undefined}
                  onClick={() => setNoteMenuId(noteMenuId === note.id ? null : note.id)}>⋯</button>
              </div>
              {noteMenuId === note.id && <div className="nr-note-menu" role="group" aria-label={`Options for ${note.title}`}>
                <button type="button" onClick={() => editNoteMetadata(note, 'title')}>Rename note</button>
                <button type="button" onClick={() => editNoteMetadata(note, 'groupName')}>Add or edit group</button>
                <button type="button" onClick={() => editNoteMetadata(note, 'tags')}>Add or edit tags</button>
              </div>}
            </div>)}
          </section>)}
      </aside>
      <section className="nr-note-detail" aria-label="Note editor">
        <div className="nr-note-detail-toolbar">
            {selection && <button type="button" className="nr-note-back" onClick={async () => {
              if (!inlineEditor.current || await inlineEditor.current.flush()) setShowNoteDetail(false);
            }}>‹ Notes</button>}
            <NoteFormatting editor={activeEditor && activeEditor.key === selection?.key ? activeEditor.editor : null}
              disabled={!selection || switchingNote} />
            {selectedNote?.id && <div className="nr-actions">
              <button type="button" disabled={busy} onClick={() => mutate(`${NOTES_ENDPOINT}/${selectedNote.id}`, {
                method: 'PUT', body: JSON.stringify({ is_pinned: !selectedNote.is_pinned }),
              }, 'Could not update note')}>{selectedNote.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button type="button" disabled={busy} onClick={async () => {
                if (inlineEditor.current && !(await inlineEditor.current.flush())) return;
                if (await moveToTrash('note', selectedNote)) {
                  setSelection(null);
                  setShowNoteDetail(false);
                }
              }}>Trash</button>
            </div>}
        </div>
        {selection ? <>
          <fieldset className="nr-note-editor-fields" disabled={switchingNote}>
            <NoteEditor key={selection.key} ref={inlineEditor} inline disabled={switchingNote} note={selection.note} groupNames={groupNames}
              editorKey={selection.key} onEditorReady={setActiveEditor} metadataEdit={metadataEdit}
              onEditTitle={() => setMetadataEdit('title')}
              onCloseMetadata={() => setMetadataEdit(null)}
              onSave={saveNote} onRefresh={loadData} onPersisted={(id) => setSelection((current) =>
                current?.key === selection.key ? { ...current, note: { ...current.note, id } } : current)} />
          </fieldset>
        </> : <p className="nr-note-detail-empty">Choose a note to read and edit it.</p>}
      </section>
    </div>
    {noteEditor && <NoteEditor ref={dialogEditor} disabled={switchingNote} note={noteEditor} groupNames={groupNames} onSave={saveNote} onRefresh={loadData} onClose={() => setNoteEditor(null)} />}
    {reminderEditor && <ReminderEditor reminder={reminderEditor} lists={reminderLists} busy={busy} error={error} onSave={saveReminder} onClose={() => setReminderEditor(null)} />}
    {listEditor && <ReminderListEditor list={listEditor} busy={busy} error={error} onSave={saveReminderList} onClose={() => setListEditor(null)} />}
  </div>;
});

const ReminderWorkspace = forwardRef(function ReminderWorkspace({
  hidden, lists, reminders, selectedListId, onSelect, busy, onNewList,
  onEditList, onEditItem, onUpdateItem, onTrashItem, onTrashList, onAddItem,
}, ref) {
  const [showDetail, setShowDetail] = useState(false);
  const selected = lists.find((list) => list.id === selectedListId);
  const defaultId = lists.find((list) => list.is_default)?.id;
  const items = reminders.filter((item) =>
    (item.list_id ?? defaultId) === selectedListId
  ).sort((first, second) => Number(first.is_completed) - Number(second.is_completed));

  useImperativeHandle(ref, () => ({ showDetail: () => setShowDetail(true) }), []);

  function selectList(id) {
    onSelect(id);
    setShowDetail(true);
  }

  return <div className={`nr-note-workspace nr-reminder-workspace${showDetail ? ' nr-note-detail-open' : ''}`} hidden={hidden}>
    <aside className="nr-note-sidebar" aria-label="Reminder lists">
      <div className="nr-note-sidebar-heading"><h2>Lists</h2>
        <button type="button" className="nr-link" disabled={busy} onClick={onNewList}>+ New list</button></div>
      {lists.map((list) => <button key={list.id} type="button"
        className={`nr-note-list-item${selectedListId === list.id ? ' nr-note-list-selected' : ''}`}
        aria-current={selectedListId === list.id ? 'true' : undefined}
        onClick={() => selectList(list.id)}>
        <strong>{list.name}</strong>
        <span>{reminders.filter((item) => (item.list_id ?? defaultId) === list.id && !item.is_completed).length} remaining</span>
      </button>)}
      {!lists.length && <p className="nr-note-list-empty">No reminder lists yet.</p>}
    </aside>
    <section className="nr-note-detail" aria-label="Reminder list detail">
      {selected ? <>
        <div className="nr-note-detail-toolbar">
          <button type="button" className="nr-note-back" onClick={() => setShowDetail(false)}>‹ Lists</button>
          <h2 className="nr-reminder-list-title">{selected.name}</h2>
          <div className="nr-actions">
            <button type="button" disabled={busy} onClick={() => onEditList(selected)}>Rename</button>
            {!selected.is_default && <button type="button" disabled={busy}
              onClick={() => onTrashList(selected)}>Trash list</button>}
          </div>
        </div>
        <ReminderListDetails key={selected.id} list={selected} items={items}
          busy={busy} onAddItem={onAddItem}
          onEditItem={onEditItem} onUpdateItem={onUpdateItem} onTrashItem={onTrashItem} />
      </> : <p className="nr-note-detail-empty">Choose a list or create one to get started.</p>}
    </section>
  </div>;
});

function ReminderListDetails({ list, items, busy, onAddItem, onEditItem, onUpdateItem, onTrashItem }) {
  const [newItem, setNewItem] = useState('');

  return <div className="nr-reminder-list-content">
    <form className="nr-add-reminder" onSubmit={async (event) => {
      event.preventDefault();
      if (!newItem.trim()) return;
      if (await onAddItem(newItem.trim(), list.id)) setNewItem('');
    }}>
      <label htmlFor="nr-new-reminder-item">New reminder item</label>
      <div><input id="nr-new-reminder-item" maxLength={255} required value={newItem}
        placeholder="Add an item..." onChange={(event) => setNewItem(event.target.value)} />
        <button type="submit" className="nr-button nr-button-primary" disabled={busy}>Add</button></div>
    </form>
    <div className="nr-reminder-items">
      {items.map((item) => <article className="nr-reminder-item" key={item.id}>
        <button type="button" className="nr-check" disabled={busy} aria-pressed={item.is_completed}
          aria-label={`${item.is_completed ? 'Reopen' : 'Complete'} ${item.title}`}
          onClick={() => onUpdateItem(item, { is_completed: !item.is_completed })}>
          {item.is_completed ? '✓' : ''}
        </button>
        <div className="nr-reminder-item-body">
          <h3 className={item.is_completed ? 'nr-reminder-item-completed' : ''}>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
          <div className="nr-meta">
            <span>{item.snoozed_until ? `Snoozed until ${reminderDate(item).toLocaleString()}` : item.due_date ? `Due ${formatDay(item.due_date)}${item.due_time ? ` · ${item.due_time.slice(0, 5)}` : ''}` : 'No due date'}</span>
            <span className={`nr-priority nr-priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
            {item.recurrence && <span>Repeats {item.recurrence}</span>}
          </div>
          <div className="nr-actions">
            {!item.is_completed && <>
              <button type="button" disabled={busy} onClick={() => onUpdateItem(item, { snoozed_until: new Date(Date.now() + 3600000).toISOString() })}>Snooze 1h</button>
              <button type="button" disabled={busy} onClick={() => onUpdateItem(item, { snoozed_until: new Date(Date.now() + 86400000).toISOString() })}>Snooze 1d</button>
            </>}
            <button type="button" onClick={() => onEditItem(item)}>Edit</button>
            <button type="button" disabled={busy} onClick={() => onTrashItem(item)}>Trash</button>
          </div>
        </div>
      </article>)}
      {!items.length && <p className="nr-note-list-empty">No items in this list.</p>}
    </div>
  </div>;
}

function ReminderListEditor({ list, busy, error, onSave, onClose }) {
  const [name, setName] = useState(list.name || '');
  return <FormDialog title={list.id ? 'Edit reminder list' : 'New reminder list'} onClose={onClose} isBusy={busy}>
    <form className="nr-form" onSubmit={(event) => {
      event.preventDefault();
      onSave(list.id, { name });
    }}>
      <label>List name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {error && <p className="nr-error" role="alert">{error}</p>}
      <div className="nr-form-footer"><button type="button" className="nr-button nr-button-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="nr-button nr-button-primary" disabled={busy}>Save list</button></div>
    </form>
  </FormDialog>;
}

const NoteEditor = forwardRef(function NoteEditor({ note, groupNames, onSave, onRefresh, onClose, onPersisted, onEditorReady, editorKey, metadataEdit, onEditTitle, onCloseMetadata, inline = false, disabled = false }, ref) {
  const [title, setTitle] = useState(note.title || '');
  const [content, setContent] = useState(note.content || '');
  const [tags, setTags] = useState(note.tags?.join(', ') || '');
  const [groupName, setGroupName] = useState(note.group_name || '');
  const [status, setStatus] = useState(note.id ? 'Saved' : 'Add a title to start saving');
  const [error, setError] = useState('');
  const [closingMetadata, setClosingMetadata] = useState(false);
  const contentId = useId();
  const groupOptionsId = useId();
  const draft = useRef({ title, content, tags, groupName });
  const id = useRef(note.id);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const saving = useRef(null);
  const timer = useRef(null);

  const save = useCallback(async () => {
    if (saving.current) {
      await saving.current;
      if (savedVersion.current === version.current) return;
    }
    if (savedVersion.current === version.current) return;
    if (!draft.current.title.trim()) {
      if (version.current) throw new Error('Add a title before saving your note.');
      return;
    }
    saving.current = (async () => {
      while (savedVersion.current !== version.current) {
        const currentVersion = version.current;
        const current = draft.current;
        setStatus('Saving...');
        id.current = await onSave(id.current, {
          title: current.title,
          content: current.content,
          tags: current.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          group_name: current.groupName.trim() || null,
        });
        if (onPersisted) onPersisted(id.current);
        savedVersion.current = currentVersion;
      }
      setStatus('Saved');
      setError('');
      try {
        await onRefresh();
      } catch (err) {
        throw new Error(`Saved, but could not refresh the list: ${err.message}`);
      }
    })();
    try { await saving.current; } finally { saving.current = null; }
  }, [onSave, onRefresh, onPersisted]);

  function update(field, value) {
    draft.current = { ...draft.current, [field]: value };
    version.current += 1;
    setStatus(draft.current.title.trim() ? 'Unsaved changes' : 'Add a title to save your changes');
    setError('');
    if (field === 'title') setTitle(value);
    if (field === 'content') setContent(value);
    if (field === 'tags') setTags(value);
    if (field === 'groupName') setGroupName(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (draft.current.title.trim()) save().catch((err) => {
        setStatus(err.message.startsWith('Saved,') ? 'Saved' : 'Not saved');
        setError(err.message);
      });
    }, 700);
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown.configure({ markedOptions: { breaks: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    // Older notes treated HTML as literal text rather than markup.
    content: (note.content || '').replace(/</g, '&lt;'),
    contentType: 'markdown',
    editorProps: {
      attributes: { id: contentId, role: 'textbox', 'aria-label': 'Note content', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor: currentEditor }) => update('content', currentEditor.getMarkdown()),
  });

  useEffect(() => {
    if (editor) editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  useEffect(() => {
    if (!onEditorReady || !editor) return undefined;
    onEditorReady({ key: editorKey, editor });
    return () => onEditorReady(null);
  }, [editor, editorKey, onEditorReady]);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (version.current !== savedVersion.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
    };
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      await save();
      return true;
    } catch (err) {
      setStatus(err.message.startsWith('Saved,') ? 'Saved' : 'Not saved');
      setError(err.message);
      return false;
    }
  }, [save]);

  useImperativeHandle(ref, () => ({ flush }), [flush]);

  async function finish() {
    if (await flush() && onClose) onClose();
  }

  async function finishMetadata() {
    if (closingMetadata) return;
    setClosingMetadata(true);
    try {
      if (await flush()) onCloseMetadata();
    } finally {
      setClosingMetadata(false);
    }
  }

  const titleField = <label>Title<input placeholder="Note title" maxLength={255} value={title}
    onChange={(event) => update('title', event.target.value)} /></label>;
  const groupField = <><label>Group <span className="nr-help">(choose an existing group or enter a new name)</span>
    <input list={groupOptionsId} placeholder="e.g. Family plans" maxLength={100} value={groupName}
      onChange={(event) => update('groupName', event.target.value)} /></label>
    <datalist id={groupOptionsId}>{groupNames.map((name) => <option key={name} value={name} />)}</datalist></>;
  const tagsField = <label>Tags <span className="nr-help">(comma-separated)</span>
    <input placeholder="Tags (comma-separated)" value={tags} onChange={(event) => update('tags', event.target.value)} /></label>;

  const form = <form className={`nr-form${inline ? ' nr-inline-editor' : ''}`} onSubmit={(event) => event.preventDefault()}>
      {!inline && <NoteFormatting editor={editor} disabled={disabled} />}
      {inline ? !title.trim() && <button className="nr-link" type="button" onClick={onEditTitle}>Add title</button> : titleField}
      {!inline && <label htmlFor={contentId}>Note</label>}
      <EditorContent editor={editor} className="nr-rich-editor" />
      {!inline && <>{groupField}{tagsField}</>}
      {(!inline || status !== 'Saved') && <div className="nr-form-footer"><span role="status">{status}</span>
        {error && !error.startsWith('Saved,') && <button className="nr-button nr-button-secondary" type="button" onClick={flush}>Retry saving</button>}
      </div>}
      {error && <p className="nr-error" role="alert">{error.startsWith('Saved,') ? error : `Failed to save note: ${error}`}</p>}
    </form>;
  return inline ? <>{form}{metadataEdit && <FormDialog
    title={metadataEdit === 'title' ? 'Rename note' : metadataEdit === 'groupName' ? 'Add or edit group' : 'Add or edit tags'}
    description="Changes save automatically after a short pause." onClose={finishMetadata} isBusy={closingMetadata}>
    <form className="nr-form" onSubmit={(event) => { event.preventDefault(); finishMetadata(); }}>
      <fieldset className="nr-note-editor-fields" disabled={closingMetadata}>
        {metadataEdit === 'title' ? titleField : metadataEdit === 'groupName' ? groupField : tagsField}
      </fieldset>
      <div className="nr-form-footer"><span role="status">{status}</span>
        <button className="nr-button nr-button-primary" type="submit" disabled={closingMetadata}>Done</button>
      </div>
      {error && <p className="nr-error" role="alert">{error.startsWith('Saved,') ? error : `Failed to save note: ${error}`}</p>}
    </form>
  </FormDialog>}</> : <FormDialog title={note.id ? 'Edit note' : 'New note'} description="Changes save automatically after a short pause." onClose={finish}>{form}</FormDialog>;
});

function NoteFormatting({ editor, disabled }) {
  const menu = useRef(null);
  const unavailable = !editor || disabled;
  return <div className="nr-format" role="toolbar" aria-label="Note formatting">
    <details className="nr-format-menu" ref={menu}>
      <summary aria-label="Text formatting" aria-disabled={unavailable}
        onClick={(event) => { if (unavailable) event.preventDefault(); }}>Aa</summary>
      <div className="nr-format-options" aria-label="Text styles">
        {[['Title', () => editor.chain().focus().setHeading({ level: 1 }).run()],
          ['Heading', () => editor.chain().focus().setHeading({ level: 2 }).run()],
          ['Subheading', () => editor.chain().focus().setHeading({ level: 3 }).run()],
          ['Body', () => editor.chain().focus().setParagraph().run()],
          ['Bulleted list', () => editor.chain().focus().toggleBulletList().run()],
          ['Numbered list', () => editor.chain().focus().toggleOrderedList().run()],
          ['Checklist', () => editor.chain().focus().toggleTaskList().run()]]
          .map(([label, action]) => <button key={label} type="button" disabled={unavailable}
            onMouseDown={(event) => event.preventDefault()} onClick={() => {
              action();
              menu.current.open = false;
            }}>{label}</button>)}
      </div>
    </details>
    <button type="button" disabled={unavailable} onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong> Bold</button>
  </div>;
}

function ReminderEditor({ reminder, lists, busy, error, onSave, onClose }) {
  const [title, setTitle] = useState(reminder.title || '');
  const [description, setDescription] = useState(reminder.description || '');
  const [dueDate, setDueDate] = useState(reminder.due_date || '');
  const [dueTime, setDueTime] = useState(reminder.due_time?.slice(0, 5) || '');
  const [priority, setPriority] = useState(reminder.priority || 'Medium');
  const [recurrence, setRecurrence] = useState(reminder.recurrence || '');
  const [listId, setListId] = useState(reminder.list_id ?? lists.find((list) => list.is_default)?.id ?? '');
  return <FormDialog title={reminder.id ? 'Edit reminder' : 'New reminder'} onClose={onClose} isBusy={busy}>
    <form className="nr-form" onSubmit={(event) => {
      event.preventDefault();
      onSave(reminder.id, {
        title, description, due_date: dueDate || null, due_time: dueTime || null,
        priority, recurrence: recurrence || null, ...(listId ? { list_id: Number(listId) } : {}),
      });
    }}>
      <label>Title<input placeholder="Reminder title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      {lists.length > 0 && <label>List<select value={listId} onChange={(event) => setListId(event.target.value)}>
        {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select></label>}
      <label>Notes <span className="nr-help">(optional)</span><textarea placeholder="Add notes for this item..." rows="3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="nr-form-row"><label>Due date<input type="date" required={Boolean(dueTime || recurrence)} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        <label>Time <span className="nr-help">(optional)</span><input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></label></div>
      <div className="nr-form-row"><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label>Repeat<select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>
      <p className="nr-help">Date and time are optional. A date is required for a time or repeat.</p>
      <p className="nr-help">Repeating reminders create their next occurrence when completed.</p>
      {error && <p className="nr-error" role="alert">{error}</p>}
      <div className="nr-form-footer"><button type="button" className="nr-button nr-button-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="nr-button nr-button-primary" disabled={busy}>Save Reminder</button></div>
    </form>
  </FormDialog>;
}

export default NotesReminders;
