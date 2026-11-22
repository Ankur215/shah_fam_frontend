import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotesReminders from './NotesReminders';

function response(data, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(data) };
}

const note = {
  id: 1, title: 'Family recipes', content: 'Soup for everyone', tags: ['food'],
  group_name: 'Family', is_pinned: true, updated_at: '2026-01-01T12:00:00',
};
const reminder = {
  id: 2, title: 'Call home', description: 'Ask about the recipe',
  due_date: '2028-01-15', due_time: '10:30:00', priority: 'High',
  is_completed: false, recurrence: null, snoozed_until: null,
};
const defaultList = { id: 10, name: 'Reminders', description: '', is_default: true };

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

test('offers retry instead of showing empty data when initial loading fails', async () => {
  let fail = true;
  global.fetch = jest.fn((url) => Promise.resolve(
    fail && url === '/api/notes' ? response({ error: 'Offline' }, 503) : response([])
  ));
  render(<NotesReminders />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load notes and reminders: Offline');
  expect(screen.queryByText('Nothing overdue.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ New Note' })).toBeDisabled();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  expect(await screen.findByText('Nothing overdue.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ New Note' })).toBeEnabled();
});

test('reports a successful reminder save separately from a failed refresh', async () => {
  let failRefresh = false;
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/reminders' && options?.method === 'POST') {
      failRefresh = true;
      return Promise.resolve(response({ id: 8 }, 201));
    }
    return Promise.resolve(failRefresh && url === '/api/notes'
      ? response({ error: 'Offline' }, 503) : response([]));
  });
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: '+ New Reminder' }));
  const dialog = screen.getByRole('dialog', { name: 'New reminder' });
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Call home' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Reminder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Change saved, but the lists could not be refreshed: Offline');
  expect(screen.queryByRole('dialog', { name: 'New reminder' })).not.toBeInTheDocument();
  failRefresh = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.filter(([url, options]) =>
    url === '/api/reminders' && options?.method === 'POST')).toHaveLength(1);
});

test('keeps a saved note and offers a list refresh when the follow-up request fails', async () => {
  let failRefresh = false;
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/notes' && options?.method === 'POST') {
      failRefresh = true;
      return Promise.resolve(response({ id: 11 }, 201));
    }
    return Promise.resolve(failRefresh && url === '/api/notes'
      ? response({ error: 'Offline' }, 503) : response([]));
  });
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  fireEvent.change(screen.getByPlaceholderText('Note title'), { target: { value: 'Plans' } });
  expect(await screen.findByRole('alert', {}, { timeout: 3000 }))
    .toHaveTextContent('Note saved, but the list could not be refreshed: Offline');
  expect(screen.queryByText(/Failed to save note/)).not.toBeInTheDocument();
  failRefresh = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.filter(([url, options]) =>
    url === '/api/notes' && options?.method === 'POST')).toHaveLength(1);
});

test('keeps new note and reminder actions below the tabs across views', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  const { container } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  const toolbar = container.querySelector('.nr-search-toolbar');
  expect(screen.getByRole('heading', { name: 'Notes & Reminders', level: 1 }))
    .toHaveClass('visually-hidden');
  fireEvent.click(within(toolbar).getByRole('button', { name: '+ New Reminder' }));
  expect(screen.getByRole('dialog', { name: 'New reminder' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close form' }));
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(within(toolbar).getByRole('button', { name: '+ New Note' }));
  expect(await screen.findByRole('dialog', { name: 'Rename note' })).toBeInTheDocument();
});

test('shows only the relevant creation action in notes and reminder sections', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  const nav = within(screen.getByRole('navigation', { name: 'Notes and reminders navigation' }));
  expect(screen.getByRole('button', { name: '+ New Note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ New Reminder' })).toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Notes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
  expect(screen.getByRole('button', { name: '+ New Note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ New Reminder' })).not.toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Reminders' }));
  fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(screen.getByRole('button', { name: '+ New Reminder' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ New Note' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  expect(screen.getByRole('button', { name: '+ New Reminder' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ New Note' })).not.toBeInTheDocument();

  fireEvent.click(within(screen.getByRole('navigation', { name: 'Reminders sections' })).getByRole('button', { name: 'Trash' }));
  expect(screen.queryByRole('button', { name: '+ New Note' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ New Reminder' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Search notes and reminders')).toBeInTheDocument();
  expect(screen.getByText('Trash is empty.')).toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Notes' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Notes sections' })).getByRole('button', { name: 'Trash' }));
  expect(screen.queryByRole('button', { name: '+ New Note' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ New Reminder' })).not.toBeInTheDocument();
  expect(screen.getByText('Trash is empty.')).toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Dashboard' }));
  expect(screen.getByRole('button', { name: '+ New Note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+ New Reminder' })).toBeInTheDocument();
});

test('searches both notes and reminders including tags and descriptions', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/notes' ? [note] : url === '/api/reminders' ? [reminder] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.change(screen.getByLabelText('Search notes and reminders'), {
    target: { value: 'recipe' },
  });
  expect(screen.getByText('Family recipes')).toBeInTheDocument();
  expect(screen.getByText('Call home')).toBeInTheDocument();
  expect(screen.getByText('2 results')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search notes and reminders'), {
    target: { value: 'food' },
  });
  expect(screen.getByText('Family recipes')).toBeInTheDocument();
  expect(screen.queryByText('Call home')).not.toBeInTheDocument();
  expect(screen.getByText('1 result')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search notes and reminders'), {
    target: { value: 'missing' },
  });
  expect(screen.getByText('0 results')).toBeInTheDocument();
});

test('selects a calendar date and pre-fills a new reminder', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  const dateButton = screen.getAllByRole('button', { pressed: false }).find(
    (button) => /\b15, /.test(button.getAttribute('aria-label') || '')
  );
  fireEvent.click(dateButton);
  fireEvent.click(screen.getByRole('button', { name: '+ Add reminder' }));
  const dialog = screen.getByRole('dialog', { name: 'New reminder' });
  expect(within(dialog).getByLabelText('Due date').value).toMatch(/-15$/);
});

test('auto-saves a new note and uses its id for subsequent edits', async () => {
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/notes' && options?.method === 'POST') return Promise.resolve(response({ id: 11 }, 201));
    if (url === '/api/notes/11' && options?.method === 'PUT') return Promise.resolve(response({ id: 11 }));
    return Promise.resolve(response([]));
  });
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  fireEvent.change(screen.getByPlaceholderText('Note title'), { target: { value: 'Plans' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ title: 'Plans', content: '', tags: [], group_name: null }),
  })), { timeout: 3000 });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  const content = screen.getByRole('textbox', { name: 'Note content' });
  content.focus();
  userEvent.type(content, 'Remember this', { skipClick: true });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/11', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ title: 'Plans', content: 'Remember this', tags: [], group_name: null }),
  })), { timeout: 3000 });
  await waitFor(() => expect(global.fetch.mock.calls.filter(([url, options]) =>
    url === '/api/notes' && !options?.method)).toHaveLength(3));
  expect(global.fetch.mock.calls.filter(([url]) => url === '/api/notes?trash=true')).toHaveLength(1);
  expect(global.fetch.mock.calls.filter(([url]) => url === '/api/reminder-lists?trash=true')).toHaveLength(1);
});

test('displays grouped notes and lets users assign an existing or new group', async () => {
  const ungrouped = { ...note, id: 4, title: 'Unsorted', group_name: null };
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') return Promise.resolve(response({ id: 1 }));
    return Promise.resolve(response(url === '/api/notes' ? [note, ungrouped] : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect(screen.getByRole('heading', { name: 'Group: Family' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ungrouped notes' })).toBeInTheDocument();
  const familySection = screen.getByRole('heading', { name: 'Group: Family' }).closest('section');
  fireEvent.click(within(familySection).getByRole('button', { name: 'Options for Family recipes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add or edit group' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add or edit group' });
  const groupInput = within(dialog).getByLabelText(/Group.*choose an existing group/i);
  expect(groupInput).toHaveValue('Family');
  expect(document.getElementById(groupInput.getAttribute('list')).querySelector('option[value="Family"]')).toBeInTheDocument();
  fireEvent.change(groupInput, { target: { value: 'Trips' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT',
    body: expect.stringContaining('"group_name":"Trips"'),
  })), { timeout: 3000 });
});

test('edits tags through a note menu and preserves changes if saving fails', async () => {
  const second = { ...note, id: 4, title: 'Packing list', tags: ['travel'] };
  let fail = true;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') return Promise.resolve(fail ? response({ error: 'Save failed' }, 503) : response({ id: 4 }));
    return Promise.resolve(response(url === '/api/notes' ? [note, second] : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.contextMenu(screen.getByRole('button', { name: /^Packing list/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add or edit tags' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add or edit tags' });
  const tags = within(dialog).getByLabelText(/Tags.*comma-separated/i);
  expect(tags).toHaveValue('travel');
  fireEvent.change(tags, { target: { value: 'travel, family' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(await within(dialog).findByText('Failed to save note: Save failed')).toBeInTheDocument();
  expect(tags).toHaveValue('travel, family');
  fail = false;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add or edit tags' })).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledWith('/api/notes/4', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('"tags":["travel","family"]'),
  }));
});

test('auto-saves tags from the note options without pressing Done', async () => {
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 1 } : url === '/api/notes' ? [note] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Options for Family recipes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add or edit tags' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add or edit tags' });
  fireEvent.change(within(dialog).getByLabelText(/Tags.*comma-separated/i), { target: { value: 'food, family' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('"tags":["food","family"]'),
  })), { timeout: 3000 });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Saved');
});

test('dismisses note options with Escape', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const trigger = screen.getByRole('button', { name: 'Options for Family recipes' });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('renames a note from its options and updates the note list', async () => {
  let currentNote = note;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      currentNote = { ...currentNote, ...JSON.parse(options.body) };
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [currentNote] : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect(screen.queryByPlaceholderText('Note title')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Options for Family recipes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename note' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename note' });
  const title = within(dialog).getByLabelText('Title');
  expect(title).toHaveValue('Family recipes');
  fireEvent.change(title, { target: { value: 'Our recipes' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('"title":"Our recipes"'),
  })), { timeout: 3000 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename note' })).not.toBeInTheDocument());
  expect(within(screen.getByLabelText('Note list')).getByText('Our recipes')).toBeInTheDocument();
  const editor = screen.getByLabelText('Note editor');
  expect(within(editor).queryByRole('heading', { name: 'Our recipes' })).not.toBeInTheDocument();
  expect(within(editor).queryByText('Note', { selector: 'label' })).not.toBeInTheDocument();
  expect(within(editor).getByRole('textbox', { name: 'Note content' })).toBeInTheDocument();
});

test('keeps the rename dialog open when the title is empty', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Options for Family recipes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename note' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename note' });
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: ' ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(await within(dialog).findByText('Failed to save note: Add a title before saving your note.')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Title')).toHaveValue(' ');
  expect(global.fetch).not.toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({ method: 'PUT' }));
});

test('asks for a title when creating a note in the notes workspace', async () => {
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'POST' ? { id: 11 } : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename note' });
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'New plans' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({
    method: 'POST', body: expect.stringContaining('"title":"New plans"'),
  })));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename note' })).not.toBeInTheDocument());
  expect(within(screen.getByLabelText('Note editor')).getByRole('textbox', { name: 'Note content' })).toBeInTheDocument();
});

test('allows an untitled draft to reopen the title editor', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename note' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename note' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Add title' }));
  expect(await screen.findByRole('dialog', { name: 'Rename note' })).toBeInTheDocument();
});

test('dashboard renders pinned notes and reminders in separate columns', async () => {
  const unpinned = { ...note, id: 8, title: 'Recent unpinned note', is_pinned: false };
  const pinned = Array.from({ length: 7 }, (_, index) => ({
    ...note, id: index + 10, title: `Pinned note ${index + 1}`,
  }));
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/notes' ? [unpinned, ...pinned] : url === '/api/reminders' ? [reminder] : []
  )));
  render(<NotesReminders />);
  const notesColumn = await screen.findByLabelText('Pinned notes');
  const remindersColumn = screen.getByLabelText('Reminders overview');
  expect(notesColumn.parentElement).toHaveClass('nr-dashboard-columns');
  expect(remindersColumn.parentElement).toBe(notesColumn.parentElement);
  expect(within(notesColumn).getByText('Pinned note 7')).toBeInTheDocument();
  expect(within(notesColumn).queryByText('Recent unpinned note')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Recent notes' })).not.toBeInTheDocument();
  fireEvent.click(within(notesColumn).getAllByRole('button', { name: 'Edit' })[0]);
  expect(await screen.findByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close form' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(within(remindersColumn).getByRole('button', { name: /Upcoming/ }));
  expect(within(remindersColumn).getByText('Call home')).toBeInTheDocument();
});

test('dashboard updates pinned notes after unpinning and shows an empty state', async () => {
  let isPinned = true;
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/notes/1' && options?.method === 'PUT') {
      isPinned = false;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, is_pinned: isPinned }] : []));
  });
  render(<NotesReminders />);
  const notesColumn = await screen.findByLabelText('Pinned notes');
  fireEvent.click(within(notesColumn).getByRole('button', { name: 'Unpin' }));
  expect(await within(notesColumn).findByText('Pin a note to keep it close.')).toBeInTheDocument();
  expect(within(notesColumn).queryByText('Family recipes')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ is_pinned: false }),
  }));
});

test('opens the full reminder list for each dashboard category', async () => {
  const dateAtOffset = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + 1);
  const reminders = [
    { ...reminder, id: 10, title: 'Late reminder', due_date: dateAtOffset(-1) },
    { ...reminder, id: 11, title: 'Today reminder', due_date: dateAtOffset(0), due_time: null },
    ...Array.from({ length: 6 }, (_, index) => ({
      ...reminder, id: 20 + index, title: `Future reminder ${index + 1}`, due_date: dateAtOffset(2),
    })),
    { ...reminder, id: 30, title: 'Snoozed reminder', due_date: dateAtOffset(-1), snoozed_until: snoozedUntil.toISOString() },
    { ...reminder, id: 31, title: 'Completed reminder', due_date: dateAtOffset(-1), is_completed: true },
  ];
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 10 } : url === '/api/reminders' ? reminders : []
  )));
  render(<NotesReminders />);
  const overview = await screen.findByLabelText('Reminders overview');
  const overdueButton = within(overview).getByRole('button', { name: /Overdue.*1/ });
  const todayButton = within(overview).getByRole('button', { name: /Today.*1/ });
  const upcomingButton = within(overview).getByRole('button', { name: /Upcoming.*7/ });
  expect(overdueButton).toHaveAttribute('aria-expanded', 'true');
  expect(within(overview).getByText('Late reminder')).toBeInTheDocument();
  expect(within(overview).queryByText('Completed reminder')).not.toBeInTheDocument();
  fireEvent.click(within(overview).getByRole('button', { name: 'Complete Late reminder' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/reminders/10', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('"is_completed":true'),
  })));
  fireEvent.click(todayButton);
  expect(todayButton).toHaveAttribute('aria-expanded', 'true');
  expect(overdueButton).toHaveAttribute('aria-expanded', 'false');
  expect(within(overview).getByText('Today reminder')).toBeInTheDocument();
  expect(within(overview).queryByText('Late reminder')).not.toBeInTheDocument();
  fireEvent.click(upcomingButton);
  expect(within(overview).getByText('Future reminder 6')).toBeInTheDocument();
  expect(within(overview).getByText('Snoozed reminder')).toBeInTheDocument();
  expect(within(overview).queryByText('Today reminder')).not.toBeInTheDocument();
  fireEvent.click(upcomingButton);
  expect(upcomingButton).toHaveAttribute('aria-expanded', 'false');
  expect(within(overview).queryByText('Future reminder 6')).not.toBeInTheDocument();
});

test('shows an empty state for the selected reminder category', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  const overview = await screen.findByLabelText('Reminders overview');
  fireEvent.click(within(overview).getByRole('button', { name: /Today/ }));
  expect(within(overview).getByText('Nothing due today.')).toBeInTheDocument();
  fireEvent.click(within(overview).getByRole('button', { name: /Upcoming/ }));
  expect(within(overview).getByText('No upcoming reminders.')).toBeInTheDocument();
});

test('saves edits before switching notes and keeps the editor open on failure', async () => {
  const second = { ...note, id: 4, title: 'Packing list', content: 'Shoes' };
  let fail = true;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      return Promise.resolve(fail ? response({ error: 'Save failed' }, 503) : response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [note, second] : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByText('Headings'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading - H2' }));
  fireEvent.click(screen.getByRole('button', { name: /^Packing list/ }));
  expect(await screen.findByText('Failed to save note: Save failed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry saving' })).toBeInTheDocument();
  expect(within(content).getByRole('heading', { name: 'Soup for everyone' })).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: /^Packing list/ }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note content' })).toHaveTextContent('Shoes'));
});

test('renders existing formatting and saves checklist changes directly in the editor', async () => {
  const formatted = { ...note, content: '# Heading\n- [ ] Milk\n- [x] Eggs' };
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 1 } : url === '/api/notes' ? [formatted] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  expect(within(content).getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
  const checkbox = within(content).getByRole('checkbox', { name: /Milk/ });
  fireEvent.click(checkbox);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('[x] Milk'),
  })), { timeout: 3000 });
});

test('applies formatting in place and automatically saves it', async () => {
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 1 } : url === '/api/notes' ? [note] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByText('Headings'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading - H2' }));
  expect(within(content).getByRole('heading', { name: 'Soup for everyone' })).toBeInTheDocument();
  expect(within(content).getByRole('button', { name: 'Collapse section Soup for everyone' })).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('## Soup for everyone'),
  })), { timeout: 3000 });
});

test('groups headings, lists, and text styles into separate menus', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const toolbar = await screen.findByRole('toolbar', { name: 'Note formatting' });
  const headingMenu = within(toolbar).getByText('Headings').closest('details');
  const listMenu = within(toolbar).getByText('Lists').closest('details');
  const styleMenu = within(toolbar).getByText('Text styles').closest('details');
  fireEvent.click(within(toolbar).getByText('Headings'));
  expect(within(headingMenu).getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Heading - H1', 'Heading - H2', 'Heading - H3', 'Heading - H4',
      'Heading - H5', 'Heading - H6', 'Body', 'Blockquote', 'Code block', 'Divider']);
  fireEvent.click(within(toolbar).getByText('Lists'));
  await waitFor(() => expect(headingMenu).not.toHaveAttribute('open'));
  expect(within(listMenu).getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Bullets', 'Numbers', 'Checklist']);
  fireEvent.click(within(toolbar).getByText('Text styles'));
  await waitFor(() => expect(listMenu).not.toHaveAttribute('open'));
  expect(within(styleMenu).getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  expect(within(styleMenu).getByRole('button', { name: 'Underline' })).toBeInTheDocument();
});

test('highlights formatting at the current text selection', async () => {
  const formatted = { ...note, content: '## Heading\n\nPlain and **bold**\n\n- List item' };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  async function selectText(element) {
    await act(async () => {
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }

  await selectText(within(content).getByRole('heading', { name: 'Heading' }));
  fireEvent.click(within(toolbar).getByText('Headings'));
  expect(within(toolbar).getByRole('button', { name: 'Heading - H2' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(toolbar).getByRole('button', { name: 'Heading - H1' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(toolbar).getByRole('button', { name: 'Divider' })).not.toHaveAttribute('aria-pressed');

  await selectText(content.querySelector('strong'));
  fireEvent.click(within(toolbar).getByText('Text styles'));
  expect(within(toolbar).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(toolbar).getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');

  await selectText(content.querySelector('p').firstChild);
  expect(within(toolbar).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
  await selectText(within(content).getByText('List item'));
  fireEvent.click(within(toolbar).getByText('Lists'));
  expect(within(toolbar).getByRole('button', { name: 'Bullets' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(toolbar).getByRole('button', { name: 'Numbers' })).toHaveAttribute('aria-pressed', 'false');
});

test('dismisses formatting menus on outside pointer press or Escape', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const toolbar = await screen.findByRole('toolbar', { name: 'Note formatting' });
  const summary = within(toolbar).getByText('Headings');
  const menu = summary.closest('details');
  fireEvent.click(summary);
  fireEvent.pointerDown(within(toolbar).getByRole('button', { name: 'Heading - H1' }));
  expect(menu).toHaveAttribute('open');
  fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Note content' }));
  expect(menu).not.toHaveAttribute('open');
  fireEvent.click(summary);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(menu).not.toHaveAttribute('open');
  expect(summary).toHaveFocus();
});

test.each([
  ...['Heading - H1', 'Heading - H2', 'Heading - H3', 'Heading - H4', 'Heading - H5', 'Heading - H6', 'Body', 'Blockquote', 'Code block', 'Divider'].map((option) => ['Headings', option]),
  ...['Bullets', 'Numbers', 'Checklist'].map((option) => ['Lists', option]),
  ...['Bold', 'Italic', 'Underline', 'Strikethrough'].map((option) => ['Text styles', option]),
])(
  'closes the %s menu after selecting %s', async (group, option) => {
    global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
    render(<NotesReminders />);
    await screen.findByText('Family recipes');
    fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
    const toolbar = await screen.findByRole('toolbar', { name: 'Note formatting' });
    const content = await screen.findByRole('textbox', { name: 'Note content' });
    fireEvent.click(content);
    const summary = within(toolbar).getByText(group);
    const menu = summary.closest('details');
    fireEvent.click(summary);
    expect(menu).toHaveAttribute('open');
    fireEvent.click(within(toolbar).getByRole('button', { name: option }));
    expect(menu).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(menu).toHaveAttribute('open');
  }
);

test.each([
  ['Bullets', 'ul'],
  ['Numbers', 'ol'],
])('saves and reopens %s', async (option, tag) => {
  let savedContent = '**Soup** <literal>';
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  fireEvent.click(screen.getByRole('button', { name: option }));
  await waitFor(() => expect(savedContent).not.toBe('**Soup** <literal>'), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  const list = reopened.querySelector(tag);
  expect(list).toHaveTextContent('Soup <literal>');
  expect(list.querySelector('strong')).toHaveTextContent('Soup');
  act(() => reopened.focus());
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  expect(screen.getByRole('button', { name: option })).toHaveAttribute('aria-pressed', 'true');
});

test('switches an existing list type without removing its items', async () => {
  const formatted = { ...note, content: '- First\n- Second' };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'First');
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  expect(screen.getByRole('button', { name: 'Bullets' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Numbers' }));
  expect(content.querySelector('ol')).toBeInTheDocument();
  expect(content.querySelectorAll('li')).toHaveLength(2);
});

test('switches the list type when all text in a list is selected', async () => {
  const formatted = { ...note, content: '- First\n- Second' };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await act(async () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content.querySelector('ul'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  fireEvent.click(screen.getByRole('button', { name: 'Numbers' }));
  expect(content.querySelector('ol')).toBeInTheDocument();
  expect(content.querySelectorAll('li')).toHaveLength(2);
});

const hierarchyListTypes = [
  ['bullets', 'bulletList', 'listItem', 'ul'],
  ['numbering', 'orderedList', 'listItem', 'ol'],
  ['checklists', 'taskList', 'taskItem', 'ul[data-type="taskList"]'],
];

test.each([
  ['Bullets', 'bulletList', { bulletStyle: 'square' }, 'ul'],
  ['Numbers', 'orderedList', { type: 'I' }, 'ol'],
])('%s is active for a saved styled list and toggles it off', async (option, type, attrs, selector) => {
  const document = { type: 'doc', content: [{
    type, attrs, content: [hierarchyItem('listItem', 'Item')],
  }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Item' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Item');
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  fireEvent.click(within(toolbar).getByText('Lists'));
  const button = within(toolbar).getByRole('button', { name: option });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(button);
  expect(content.querySelector(selector)).not.toBeInTheDocument();
  expect(content).toHaveTextContent('Item');
});

function hierarchyItem(itemType, text, nested = []) {
  return {
    type: itemType,
    ...(itemType === 'taskItem' ? { attrs: { checked: text === 'Child' } } : {}),
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }, ...nested],
  };
}

async function selectHierarchyText(content, text, selectAll = false, atStart = false) {
  await act(async () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(within(content).getByText(text, { selector: 'p' }));
    if (!selectAll) range.collapse(atStart);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

test.each(hierarchyListTypes)('indents and outdents whole %s items and preserves descendants after reopening', async (_label, listType, itemType, selector) => {
  const grandchild = { type: listType, content: [hierarchyItem(itemType, 'Grandchild')] };
  const document = { type: 'doc', content: [{
    type: listType, content: [hierarchyItem(itemType, 'Parent'), hierarchyItem(itemType, 'Child', [grandchild])],
  }] };
  let savedContent = '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent\nChild\nGrandchild' });
  let saved = false;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      saved = true;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  await selectHierarchyText(content, 'Child');
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Indent' }));
  expect(content.querySelectorAll(selector)).toHaveLength(3);
  expect(within(content.querySelector(`${selector} ${selector}`)).getByText('Grandchild')).toBeInTheDocument();
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Outdent' }));
  expect(content.querySelectorAll(selector)).toHaveLength(2);
  expect(within(content.querySelector(`${selector} ${selector}`)).getByText('Grandchild')).toBeInTheDocument();
  fireEvent.keyDown(content, { key: 'Tab' });
  expect(content.querySelectorAll(selector)).toHaveLength(3);
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  expect(content.querySelectorAll(selector)).toHaveLength(2);
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Indent' }));
  await waitFor(() => expect(saved).toBe(true), { timeout: 3000 });
  expect(savedContent).toMatch(/^<!-- shah-family-note-format:2 -->/);
  expect(savedContent).toContain('"Grandchild"');
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(reopened.querySelectorAll(selector)).toHaveLength(3);
  expect(reopened).toHaveTextContent('Grandchild');
  if (itemType === 'taskItem') expect(within(reopened).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test.each([
  ['default bullets', 'bulletList', {}, 'ul', 'circle'],
  ['hollow bullets', 'bulletList', { bulletStyle: 'circle' }, 'ul', 'square'],
  ['square bullets', 'bulletList', { bulletStyle: 'square' }, 'ul', 'disc'],
  ['default numbering', 'orderedList', {}, 'ol', 'a'],
  ['explicit decimal numbering', 'orderedList', { type: '1' }, 'ol', 'a'],
  ['lowercase letter numbering', 'orderedList', { type: 'a' }, 'ol', 'A'],
  ['uppercase letter numbering', 'orderedList', { type: 'A' }, 'ol', 'i'],
  ['lowercase Roman numbering', 'orderedList', { type: 'i' }, 'ol', 'I'],
  ['uppercase Roman numbering', 'orderedList', { type: 'I' }, 'ol', null],
])('a newly indented %s list uses the expected marker style', async (_label, listType, attrs, selector, style) => {
  const document = { type: 'doc', content: [{
    type: listType, attrs, content: [hierarchyItem('listItem', 'Parent'), hierarchyItem('listItem', 'Child')],
  }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab' });
  const nested = content.querySelector(`${selector} ${selector}`);
  if (listType === 'bulletList') expect(nested.style.listStyleType).toBe(style);
  else expect(nested.getAttribute('type')).toBe(style);
});

test('advances bullet styles across levels and preserves them after reopening', async () => {
  const document = { type: 'doc', content: [{
    type: 'bulletList', content: [
      hierarchyItem('listItem', 'Parent'), hierarchyItem('listItem', 'Child'),
      hierarchyItem('listItem', 'Grandchild'), hierarchyItem('listItem', 'Great-grandchild'),
    ],
  }] };
  let savedContent = '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child Grandchild Great-grandchild' });
  let saved = false;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      saved = true;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  for (const [text, levels] of [['Child', 1], ['Grandchild', 2], ['Great-grandchild', 3]]) {
    await selectHierarchyText(content, text);
    for (let level = 0; level < levels; level += 1) {
      fireEvent.click(within(toolbar).getByRole('button', { name: 'Indent' }));
    }
  }
  const styles = () => Array.from(content.querySelectorAll('ul')).map((list) => list.style.listStyleType || 'disc');
  expect(styles()).toEqual(['disc', 'circle', 'square', 'disc']);
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  expect(within(content).getByText('Great-grandchild').closest('ul').style.listStyleType).toBe('square');
  fireEvent.keyDown(content, { key: 'Tab' });
  expect(styles()).toEqual(['disc', 'circle', 'square', 'disc']);
  await waitFor(() => expect(saved).toBe(true), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(Array.from(reopened.querySelectorAll('ul')).map((list) => list.style.listStyleType || 'disc'))
    .toEqual(['disc', 'circle', 'square', 'disc']);
});

test('preserves a saved nested bullet style when outdenting', async () => {
  const nested = { type: 'bulletList', attrs: { bulletStyle: 'square' }, content: [hierarchyItem('listItem', 'Child')] };
  const document = { type: 'doc', content: [{
    type: 'bulletList', content: [hierarchyItem('listItem', 'Parent', [nested])],
  }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  const childList = within(content).getByText('Child', { selector: 'p' }).closest('ul');
  expect(childList.parentElement).toBe(content);
  expect(childList.style.listStyleType).toBe('square');
});

test('advances numbering across levels and preserves it after reopening', async () => {
  const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  const document = { type: 'doc', content: [{
    type: 'orderedList', content: labels.map((label) => hierarchyItem('listItem', label)),
  }] };
  let savedContent = '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: labels.join(' ') });
  let saved = false;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      saved = true;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  for (let index = 1; index < labels.length; index += 1) {
    await selectHierarchyText(content, labels[index]);
    for (let level = 0; level < index; level += 1) {
      fireEvent.click(within(toolbar).getByRole('button', { name: 'Indent' }));
    }
  }
  const styles = () => Array.from(content.querySelectorAll('ol')).map((list) => list.getAttribute('type'));
  expect(styles()).toEqual([null, 'a', 'A', 'i', 'I', null]);
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  expect(within(content).getByText('Sixth').closest('ol')).toHaveAttribute('type', 'I');
  fireEvent.keyDown(content, { key: 'Tab' });
  expect(styles()).toEqual([null, 'a', 'A', 'i', 'I', null]);
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelectorAll('ol')[5].children).toHaveLength(2);
  await waitFor(() => expect(saved).toBe(true), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(Array.from(reopened.querySelectorAll('ol')).map((list) => list.getAttribute('type')))
    .toEqual([null, 'a', 'A', 'i', 'I', null]);
  expect(reopened.querySelectorAll('ol')[5].children).toHaveLength(2);
});

test('preserves a saved nested numbering style when outdenting', async () => {
  const nested = { type: 'orderedList', attrs: { type: 'I' }, content: [hierarchyItem('listItem', 'Child')] };
  const document = { type: 'doc', content: [{
    type: 'orderedList', content: [hierarchyItem('listItem', 'Parent', [nested])],
  }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  const childList = within(content).getByText('Child', { selector: 'p' }).closest('ol');
  expect(childList.parentElement).toBe(content);
  expect(childList).toHaveAttribute('type', 'I');
});

test.each(hierarchyListTypes)('creates a sibling and exits an empty %s list item with Enter', async (_label, listType, itemType, selector) => {
  const nested = { type: listType, content: [hierarchyItem(itemType, 'Child')] };
  const document = { type: 'doc', content: [{ type: listType, content: [hierarchyItem(itemType, 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent\nChild' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelector(`${selector} ${selector}`).children).toHaveLength(2);
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelector(`${selector} ${selector}`).children).toHaveLength(1);
  expect(content.querySelector(selector).children).toHaveLength(2);
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelector(selector).children).toHaveLength(1);
  expect(content.querySelector(':scope > p')).toBeInTheDocument();
});

test.each([
  ['checklist within bullets', 'bulletList', 'listItem', 'taskList', 'taskItem', 'ul[data-type="taskList"]'],
  ['bullets within a checklist', 'taskList', 'taskItem', 'bulletList', 'listItem', 'ul:not([data-type])'],
])('Enter exits an empty %s item without losing its sibling', async (_label, outerType, outerItem, innerType, innerItem, selector) => {
  const nested = { type: innerType, content: [hierarchyItem(innerItem, 'Child')] };
  const document = { type: 'doc', content: [{ type: outerType, content: [hierarchyItem(outerItem, 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelector(selector).children).toHaveLength(2);
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(content.querySelector(selector).children).toHaveLength(1);
  expect(content).toHaveTextContent('Child');
  const selectionNode = window.getSelection().anchorNode;
  const selectionElement = selectionNode.nodeType === 1 ? selectionNode : selectionNode.parentElement;
  expect(selectionElement.closest(selector)).toBeNull();
});

test('Enter on an empty parent retains its nested items', async () => {
  const nested = { type: 'taskList', content: [hierarchyItem('taskItem', 'Child')] };
  const savedDocument = { type: 'doc', content: [{ type: 'bulletList', content: [hierarchyItem('listItem', '', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document: savedDocument, markdown: 'Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await act(async () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content.querySelector('li > p'));
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.keyDown(content, { key: 'Enter' });
  expect(within(content).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test.each([
  ...hierarchyListTypes.map(([label, listType, itemType]) => [label, listType, itemType, listType, itemType]),
  ['checklist within bullets', 'bulletList', 'listItem', 'taskList', 'taskItem'],
  ['bullets within a checklist', 'taskList', 'taskItem', 'bulletList', 'listItem'],
])('preserves %s children when the parent text is deleted', async (_label, listType, itemType, childList, childItem) => {
  const nested = { type: childList, content: [hierarchyItem(childItem, 'Child')] };
  const document = { type: 'doc', content: [{ type: listType, content: [hierarchyItem(itemType, 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent\nChild' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Parent', true);
  fireEvent.keyDown(content, { key: 'Backspace' });
  fireEvent.keyDown(content, { key: 'Backspace' });
  expect(content).toHaveTextContent('Child');
  if (childItem === 'taskItem') expect(within(content).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test('Delete at a parent boundary keeps nested checklist items', async () => {
  const nested = { type: 'taskList', content: [
    hierarchyItem('taskItem', 'Child'),
    hierarchyItem('taskItem', 'Second'),
  ] };
  const document = { type: 'doc', content: [{ type: 'bulletList', content: [hierarchyItem('listItem', 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child Second' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Parent');
  fireEvent.keyDown(content, { key: 'Delete' });
  expect(content).toHaveTextContent('Child');
  expect(content).toHaveTextContent('Second');
  expect(within(content).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test('Backspace at the start of a nested checklist keeps its checkbox', async () => {
  const nested = { type: 'taskList', content: [hierarchyItem('taskItem', 'Child')] };
  const document = { type: 'doc', content: [{ type: 'bulletList', content: [hierarchyItem('listItem', 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child', false, true);
  fireEvent.keyDown(content, { key: 'Backspace' });
  expect(within(content).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test.each([
  ['checklist within bullets', 'bulletList', 'listItem', 'taskList', 'taskItem'],
  ['bullets within a checklist', 'taskList', 'taskItem', 'bulletList', 'listItem'],
])('outdents a %s without losing its list type or descendants', async (_label, outerType, outerItem, innerType, innerItem) => {
  const grandchild = { type: innerType, content: [hierarchyItem(innerItem, 'Grandchild')] };
  const nested = { type: innerType, content: [hierarchyItem(innerItem, 'Child', [grandchild])] };
  const document = { type: 'doc', content: [{ type: outerType, content: [hierarchyItem(outerItem, 'Parent', [nested])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent\nChild\nGrandchild' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  const child = within(content).getByText('Child', { selector: 'p' });
  const item = child.closest('li');
  expect(item.closest('ul, ol').parentElement).toBe(content);
  expect(item).toHaveTextContent('Grandchild');
  expect(item.parentElement.getAttribute('data-type')).toBe(innerItem === 'taskItem' ? 'taskList' : null);
  if (innerItem === 'taskItem') expect(within(item).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
  fireEvent.keyDown(content, { key: 'Tab' });
  const nestedChild = within(content).getByText('Child', { selector: 'p' }).closest('li');
  expect(nestedChild.parentElement.parentElement.closest('li')).toHaveTextContent('Parent');
  expect(nestedChild).toHaveTextContent('Grandchild');
  if (innerItem === 'taskItem') expect(within(nestedChild).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test('outdenting a mixed list item preserves preceding, following, and child items', async () => {
  const grandchild = { type: 'taskList', content: [hierarchyItem('taskItem', 'Grandchild')] };
  const nested = { type: 'taskList', content: [
    hierarchyItem('taskItem', 'Before'),
    hierarchyItem('taskItem', 'Child', [grandchild]),
    hierarchyItem('taskItem', 'After'),
  ] };
  const document = { type: 'doc', content: [{ type: 'bulletList', content: [
    hierarchyItem('listItem', 'Parent', [nested]), hierarchyItem('listItem', 'Sibling'),
  ] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Before Child Grandchild After Sibling' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByRole('button', { name: 'Outdent' }));
  const texts = Array.from(content.querySelectorAll('p')).map((element) => element.textContent).filter(Boolean);
  expect(texts).toEqual(['Parent', 'Before', 'Child', 'Grandchild', 'After', 'Sibling']);
  const item = within(content).getByText('Child', { selector: 'p' }).closest('li');
  expect(item.parentElement.parentElement).toBe(content);
  expect(within(item).getByText('Grandchild')).toBeInTheDocument();
  expect(within(item).getByText('After')).toBeInTheDocument();
  expect(within(item).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test('preserves a separated mixed checklist after saving and reopening', async () => {
  const nested = { type: 'taskList', content: [hierarchyItem('taskItem', 'Child')] };
  const document = { type: 'doc', content: [{ type: 'bulletList', content: [hierarchyItem('listItem', 'Parent', [nested])] }] };
  let savedContent = '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Child' });
  let saved = false;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      saved = true;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  await waitFor(() => expect(saved).toBe(true), { timeout: 3000 });
  expect(savedContent).toMatch(/^<!-- shah-family-note-format:2 -->/);
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(reopened.querySelector('ul:not([data-type])')).toHaveTextContent('Parent');
  expect(within(reopened).getByRole('checkbox', { name: /^Task item checkbox for Child/ })).toBeChecked();
});

test('outdents a mixed item by only one level in a deeper hierarchy', async () => {
  const inner = { type: 'bulletList', content: [hierarchyItem('listItem', 'Child')] };
  const middle = { type: 'taskList', content: [hierarchyItem('taskItem', 'Middle', [inner])] };
  const document = { type: 'doc', content: [{ type: 'bulletList', content: [hierarchyItem('listItem', 'Parent', [middle])] }] };
  const formatted = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({ document, markdown: 'Parent Middle Child' }) };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  await selectHierarchyText(content, 'Child');
  fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
  const child = within(content).getByText('Child', { selector: 'p' });
  expect(child.closest('ul').parentElement.closest('li').querySelector(':scope > p')).toHaveTextContent('Parent');
  expect(within(content).getByRole('checkbox', { name: /^Task item checkbox for Middle/ })).toBeInTheDocument();
});

test('preserves nested list styles and text formatting while editing a saved styled note', async () => {
  const savedDocument = { type: 'doc', content: [{
    type: 'bulletList', attrs: { bulletStyle: 'square' }, content: [{
      type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
        { type: 'orderedList', attrs: { start: 1, type: 'i' }, content: [{
          type: 'listItem', content: [{
            type: 'paragraph', content: [{ type: 'text', text: 'Nested <text>', marks: [{ type: 'underline' }] }],
          }],
        }] },
      ],
    }],
  }] };
  let savedContent = '<!-- shah-family-note-format:2 -->\n' + JSON.stringify({
    document: savedDocument, markdown: '- Parent\n  i. <u>Nested &lt;text&gt;</u>',
  });
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  expect(within(screen.getByRole('complementary', { name: 'Note list' }))
    .getByRole('button', { name: /^Family recipes/ })).toHaveTextContent('Nested <text>');
  await act(async () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content.querySelector('ol u'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  expect(screen.getByRole('button', { name: 'Numbers' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Text styles'));
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  await waitFor(() => expect(savedContent).toContain('"type":"bold"'), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(reopened.querySelector('ul').style.listStyleType).toBe('square');
  expect(reopened.querySelector('ul ol')).toHaveAttribute('type', 'i');
  expect(reopened.querySelector('ol u')).toHaveTextContent('Nested <text>');
  await act(async () => {
    reopened.focus();
    const range = document.createRange();
    range.selectNodeContents(reopened.querySelector('ol u'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'));
  expect(screen.getByRole('button', { name: 'Bullets' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Bullets' }));
  expect(reopened.querySelector('ul').style.listStyleType).toBe('square');
  expect(reopened.querySelector('ul ul')).toBeInTheDocument();
  expect(reopened.querySelector('ul ul u')).toHaveTextContent('Nested <text>');
});

test.each([
  '{bad',
  JSON.stringify({ document: { type: 'doc', content: [{ type: 'unknown' }] }, markdown: 'Text' }),
])('does not allow editing malformed styled-note data', async (data) => {
  const broken = { ...note, content: '<!-- shah-family-note-format:2 -->\n' + data };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [broken] : [])));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid saved format');
  expect(screen.getByRole('textbox', { name: 'Note content' })).toHaveAttribute('contenteditable', 'false');
  expect(within(screen.getByRole('toolbar', { name: 'Note formatting' })).getByText('Lists'))
    .toHaveAttribute('aria-disabled', 'true');
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
});

test.each([1, 2, 3, 4, 5, 6])('saves and reopens H%i headings', async (level) => {
  let savedContent = note.content;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByText('Headings'));
  fireEvent.click(screen.getByRole('button', { name: `Heading - H${level}` }));
  await waitFor(() => expect(savedContent.trimEnd()).toBe(`${'#'.repeat(level)} Soup for everyone`), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(within(reopened).getByRole('heading', { name: 'Soup for everyone', level })).toBeInTheDocument();
  const sectionToggle = within(reopened).queryByRole('button', { name: 'Collapse section Soup for everyone' });
  if (level === 2) expect(sectionToggle).toBeInTheDocument();
  else expect(sectionToggle).not.toBeInTheDocument();
});

test('collapses heading sections without changing saved content and expands them when reopened', async () => {
  const formatted = { ...note, content: '## First\n\nAlpha\n\n### Detail\n\nMore details\n\n## Second\n\nBeta\n\n# Title\n\nOutside' };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [formatted] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  const main = within(screen.getByRole('navigation', { name: 'Notes and reminders navigation' }));
  fireEvent.click(main.getByRole('button', { name: 'Notes' }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  const collapse = within(content).getByRole('button', { name: 'Collapse section First' });
  collapse.focus();
  fireEvent.click(collapse);
  expect(within(content).getByRole('button', { name: 'Expand section First' })).toHaveAttribute('aria-expanded', 'false');
  expect(within(content).getByRole('button', { name: 'Expand section First' })).toHaveFocus();
  expect(within(content).getByText('Alpha')).toHaveClass('nr-folded-content');
  expect(content.querySelector('h3')).toHaveClass('nr-folded-content');
  expect(within(content).getByText('Beta')).not.toHaveClass('nr-folded-content');
  expect(within(content).getByText('Outside')).not.toHaveClass('nr-folded-content');
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
  fireEvent.click(within(content).getByRole('button', { name: 'Expand section First' }));
  expect(within(content).getByText('Alpha')).not.toHaveClass('nr-folded-content');
  fireEvent.click(within(content).getByRole('button', { name: 'Collapse section First' }));
  fireEvent.click(main.getByRole('button', { name: 'Dashboard' }));
  await screen.findByText('Nothing overdue.');
  fireEvent.click(main.getByRole('button', { name: 'Notes' }));
  await screen.findByRole('textbox', { name: 'Note content' });
  expect(within(content).getByText('Alpha')).not.toHaveClass('nr-folded-content');
  expect(within(content).getByRole('button', { name: 'Collapse section First' })).toHaveAttribute('aria-expanded', 'true');
});

test('allows existing literal underline tags without treating them as formatting', async () => {
  const legacy = { ...note, content: '<u>literal</u>' };
  global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [legacy] : [])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  expect(content).toHaveTextContent('<u>literal</u>');
  expect(content.querySelector('u')).not.toBeInTheDocument();
});

test('saves underlining and preserves literal HTML when reopening a note', async () => {
  let savedContent = 'Underline this\n\n<b>literal</b> <u>plain</u>';
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  act(() => content.focus());
  const text = within(content).getByText('Underline this');
  const range = document.createRange();
  range.selectNodeContents(text);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.click(screen.getByText('Text styles'));
  fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
  await waitFor(() => expect(savedContent).toContain('<u>Underline this</u>'), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const reopened = await screen.findByRole('textbox', { name: 'Note content' });
  expect(reopened.querySelector('u')).toHaveTextContent('Underline this');
  expect(reopened).toHaveTextContent('<b>literal</b>');
  expect(reopened).toHaveTextContent('<u>plain</u>');
  expect(reopened.querySelectorAll('u')).toHaveLength(1);
  expect(reopened.querySelector('b')).not.toBeInTheDocument();
});

test.each([
  ['Italic', 'em', '*Underline this*'],
  ['Strikethrough', 's', '~~Underline this~~'],
])('saves and reopens %s formatting', async (button, tag, markdown) => {
  let savedContent = 'Underline this';
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  act(() => content.focus());
  const range = document.createRange();
  range.selectNodeContents(within(content).getByText('Underline this'));
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  fireEvent.click(screen.getByText('Text styles'));
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => expect(savedContent).toContain(markdown), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect((await screen.findByRole('textbox', { name: 'Note content' })).querySelector(tag))
    .toHaveTextContent('Underline this');
});

test.each([
  ['Blockquote', 'blockquote', '> Soup for everyone'],
  ['Code block', 'pre', '```'],
  ['Divider', 'hr', '---'],
])('saves and reopens a %s', async (option, tag, markdown) => {
  let savedContent = note.content;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByText('Headings'));
  fireEvent.click(screen.getByRole('button', { name: option }));
  await waitFor(() => expect(savedContent).toContain(markdown), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect((await screen.findByRole('textbox', { name: 'Note content' })).querySelector(tag))
    .toBeInTheDocument();
});

test('hides the saved label in the note editor without disabling autosave', async () => {
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 1 } : url === '/api/notes' ? [note] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const editor = screen.getByLabelText('Note editor');
  const content = await within(editor).findByRole('textbox', { name: 'Note content' });
  expect(within(editor).queryByText('Saved')).not.toBeInTheDocument();
  fireEvent.click(content);
  fireEvent.click(within(editor).getByText('Headings'));
  fireEvent.click(within(editor).getByRole('button', { name: 'Heading - H2' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('## Soup for everyone'),
  })), { timeout: 3000 });
  await waitFor(() => expect(within(editor).queryByRole('status')).not.toBeInTheDocument());
});

test('shares the top formatting toolbar across selected notes', async () => {
  const second = { ...note, id: 4, title: 'Packing list', content: 'Shoes' };
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: url.endsWith('/4') ? 4 : 1 }
      : url === '/api/notes' ? [note, second] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const toolbar = await screen.findByRole('toolbar', { name: 'Note formatting' });
  let content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(within(toolbar).getByText('Headings'));
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Heading - H2' }));
  expect(within(content).getByRole('heading', { name: 'Soup for everyone' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Packing list/ }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note content' })).toHaveTextContent('Shoes'));
  expect(screen.getByRole('toolbar', { name: 'Note formatting' })).toBe(toolbar);
  content = screen.getByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(within(toolbar).getByText('Headings'));
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Heading - H2' }));
  expect(within(content).getByRole('heading', { name: 'Shoes' })).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/4', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('## Shoes'),
  })), { timeout: 3000 });
});

test('disables the shared formatting toolbar when no note is selected', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  ['Headings', 'Lists', 'Text styles'].forEach((group) =>
    expect(within(toolbar).getByText(group)).toHaveAttribute('aria-disabled', 'true'));
});

test('preserves legacy lines and literal angle brackets while editing another field', async () => {
  const legacy = { ...note, content: 'First line\nSecond line\n\nKeep <milk> & eggs\n<b>literal</b>' };
  global.fetch = jest.fn((url, options) => Promise.resolve(response(
    options?.method === 'PUT' ? { id: 1 } : url === '/api/notes' ? [legacy] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  expect(content).toHaveTextContent('First lineSecond line');
  expect(content.querySelector('br')).toBeInTheDocument();
  expect(content).toHaveTextContent('Keep <milk> & eggs');
  expect(content).toHaveTextContent('<b>literal</b>');
  fireEvent.click(screen.getByRole('button', { name: 'Options for Family recipes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename note' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename note' });
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Updated' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining(JSON.stringify(legacy.content).slice(1, -1)),
  })), { timeout: 3000 });
});

test('preserves literal HTML as text when formatting and reopening a note', async () => {
  let savedContent = '<b>literal</b> & eggs';
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT') {
      savedContent = JSON.parse(options.body).content;
      return Promise.resolve(response({ id: 1 }));
    }
    return Promise.resolve(response(url === '/api/notes' ? [{ ...note, content: savedContent }] : []));
  });
  const { unmount } = render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByText('Headings'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading - H2' }));
  await waitFor(() => expect(savedContent).toContain('## '), { timeout: 3000 });
  unmount();
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  expect(await screen.findByRole('textbox', { name: 'Note content' })).toHaveTextContent('<b>literal</b> & eggs');
});

test('requires a title before automatically saving content', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([])));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  content.focus();
  userEvent.type(content, 'Draft', { skipClick: true });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Add a title to save your changes'));
  fireEvent.click(screen.getByRole('button', { name: 'Close form' }));
  expect(await screen.findByText('Failed to save note: Add a title before saving your note.')).toBeInTheDocument();
  expect(content).toHaveTextContent('Draft');
  expect(global.fetch).not.toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' }));
});

test('restores trashed items and confirms permanent deletion', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/notes?trash=true' ? [note] : []
  )));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Notes sections' })).getByRole('button', { name: 'Trash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect(confirm).toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalledWith('/api/notes/1?permanent=true', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1/restore', { method: 'POST' }));
});

test('shows pinned and completed views and sends reminder actions', async () => {
  const completed = { ...reminder, id: 3, title: 'Finished call', is_completed: true };
  global.fetch = jest.fn((url, options) => {
    if (options?.method) return Promise.resolve(response({ id: 2 }));
    return Promise.resolve(response(
      url === '/api/notes' ? [note] : url === '/api/reminders' ? [reminder, completed]
        : url === '/api/reminder-lists' ? [defaultList] : []
    ));
  });
  render(<NotesReminders />);
  await screen.findByText('Family recipes');
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
  expect(await within(screen.getByLabelText('Note list')).findByText('Family recipes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Completed' }));
  expect(await screen.findByText('Finished call')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Reminders sections' }))
    .getByRole('button', { name: 'Reminders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Snooze 1h' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/reminders/2', expect.objectContaining({
    method: 'PUT',
    body: expect.stringContaining('snoozed_until'),
  })));
});

test('organizes notes and reminders under their main tabs with separate trash views', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/notes?trash=true' ? [note] : url === '/api/reminders?trash=true' ? [reminder]
      : url === '/api/reminder-lists?trash=true' ? [{ id: 11, name: 'Old list' }] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  const main = within(screen.getByRole('navigation', { name: 'Notes and reminders navigation' }));
  expect(main.getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Dashboard', 'Notes', 'Reminders']);
  expect(screen.queryByRole('navigation', { name: 'Notes sections' })).not.toBeInTheDocument();

  fireEvent.click(main.getByRole('button', { name: 'Notes' }));
  const notesNav = within(screen.getByRole('navigation', { name: 'Notes sections' }));
  expect(notesNav.getAllByRole('button').map((button) => button.textContent)).toEqual(['Notes', 'Pinned', 'Trash']);
  fireEvent.click(notesNav.getByRole('button', { name: 'Pinned' }));
  expect(await screen.findByText('Pin a note to keep it close.')).toBeInTheDocument();
  expect(main.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(notesNav.getByRole('button', { name: 'Trash' }));
  expect(notesNav.getByRole('button', { name: 'Trash' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Family recipes')).toBeInTheDocument();
  expect(screen.queryByText('Call home')).not.toBeInTheDocument();
  expect(screen.queryByText('Old list')).not.toBeInTheDocument();

  fireEvent.click(main.getByRole('button', { name: 'Reminders' }));
  const remindersNav = within(screen.getByRole('navigation', { name: 'Reminders sections' }));
  expect(remindersNav.getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Reminders', 'Calendar', 'Completed', 'Trash']);
  fireEvent.click(remindersNav.getByRole('button', { name: 'Completed' }));
  expect(main.getByRole('button', { name: 'Reminders' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Completed reminders will appear here.')).toBeInTheDocument();

  fireEvent.click(remindersNav.getByRole('button', { name: 'Trash' }));
  expect(remindersNav.getByRole('button', { name: 'Trash' })).toHaveAttribute('aria-current', 'page');
  expect(main.getByRole('button', { name: 'Reminders' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByText('Family recipes')).not.toBeInTheDocument();
  expect(screen.getByText('Call home')).toBeInTheDocument();
  expect(screen.getByText('Old list')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('heading', { name: 'Call home' }).closest('article')).getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/reminders/2/restore', { method: 'POST' }));
});

test('creates a list with multiple undated items, edits item notes, and keeps completed items at the bottom', async () => {
  let lists = [defaultList];
  let items = [];
  global.fetch = jest.fn((url, options) => {
    const body = options?.body && JSON.parse(options.body);
    if (url === '/api/reminder-lists' && options?.method === 'POST') {
      lists = [...lists, { id: 11, ...body, is_default: false }];
      return Promise.resolve(response({ id: 11 }, 201));
    }
    if (url === '/api/reminders' && options?.method === 'POST') {
      const item = { id: items.length + 1, description: '', due_date: null, due_time: null,
        priority: 'Medium', recurrence: null, snoozed_until: null, is_completed: false, ...body };
      items = [...items, item];
      return Promise.resolve(response({ id: item.id }, 201));
    }
    if (url.startsWith('/api/reminders/') && options?.method === 'PUT') {
      const id = Number(url.split('/').pop());
      items = items.map((item) => item.id === id ? { ...item, ...body } : item);
      return Promise.resolve(response({ id }));
    }
    return Promise.resolve(response(url === '/api/reminder-lists' ? lists : url === '/api/reminders' ? items : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '+ New list' }));
  const listDialog = await screen.findByRole('dialog', { name: 'New reminder list' });
  fireEvent.change(within(listDialog).getByLabelText('List name'), { target: { value: 'Groceries' } });
  expect(within(listDialog).queryByLabelText('List notes')).not.toBeInTheDocument();
  fireEvent.click(within(listDialog).getByRole('button', { name: 'Save list' }));
  expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
  for (const title of ['Milk', 'Bread']) {
    fireEvent.change(screen.getByLabelText('New reminder item'), { target: { value: title } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    await screen.findByRole('heading', { name: title });
  }
  const detail = screen.getByLabelText('Reminder list detail');
  expect(within(detail).getAllByText('No due date')).toHaveLength(2);
  expect(within(detail).getByLabelText('New reminder item').compareDocumentPosition(
    within(detail).getByRole('heading', { name: 'Milk' })
  ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(within(detail).getByRole('button', { name: 'Complete Milk' }));
  await waitFor(() => expect(within(detail).getByRole('button', { name: 'Reopen Milk' })).toHaveTextContent('✓'));
  expect(within(detail).getAllByRole('heading').map((heading) => heading.textContent))
    .toEqual(['Groceries', 'Bread', 'Milk']);
  const bread = within(detail).getByRole('heading', { name: 'Bread' }).closest('article');
  fireEvent.click(within(bread).getByRole('button', { name: 'Edit' }));
  const itemDialog = await screen.findByRole('dialog', { name: 'Edit reminder' });
  fireEvent.change(within(itemDialog).getByLabelText(/Notes/), { target: { value: 'Whole grain' } });
  fireEvent.click(within(itemDialog).getByRole('button', { name: 'Save Reminder' }));
  expect(await within(detail).findByText('Whole grain')).toBeInTheDocument();
  expect(items.find((item) => item.title === 'Bread').due_date).toBeNull();
  fireEvent.change(screen.getByLabelText('Search notes and reminders'), { target: { value: 'Groceries' } });
  expect(screen.getByRole('button', { name: 'Groceries' })).toBeInTheDocument();
});

test('hides list notes and priority filter without changing existing list data or item priorities', async () => {
  const lists = [{ ...defaultList, description: 'Existing list notes' }];
  const items = [
    { ...reminder, title: 'High priority', list_id: 10 },
    { ...reminder, id: 3, title: 'Low priority', priority: 'Low', list_id: 10 },
  ];
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/reminder-lists/10' && options?.method === 'PUT') {
      lists[0] = { ...lists[0], ...JSON.parse(options.body) };
      return Promise.resolve(response({ id: 10 }));
    }
    return Promise.resolve(response(url === '/api/reminder-lists' ? lists : url === '/api/reminders' ? items : []));
  });
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  const detail = await screen.findByLabelText('Reminder list detail');
  expect(within(detail).queryByLabelText('List notes')).not.toBeInTheDocument();
  expect(within(detail).queryByRole('combobox', { name: 'Priority' })).not.toBeInTheDocument();
  expect(within(detail).getByRole('heading', { name: 'High priority' })).toBeInTheDocument();
  expect(within(detail).getByRole('heading', { name: 'Low priority' })).toBeInTheDocument();
  fireEvent.click(within(detail).getByRole('button', { name: 'Rename' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit reminder list' });
  fireEvent.change(within(dialog).getByLabelText('List name'), { target: { value: 'Renamed' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save list' }));
  await waitFor(() => expect(lists[0].name).toBe('Renamed'));
  expect(lists[0].description).toBe('Existing list notes');
  expect(global.fetch).toHaveBeenCalledWith('/api/reminder-lists/10', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ name: 'Renamed' }),
  }));
  const lowItem = within(detail).getByRole('heading', { name: 'Low priority' }).closest('article');
  fireEvent.click(within(lowItem).getByRole('button', { name: 'Edit' }));
  expect(within(await screen.findByRole('dialog', { name: 'Edit reminder' }))
    .getByLabelText('Priority')).toHaveValue('Low');
});

test('excludes undated items from dashboard and calendar while allowing optional scheduling', async () => {
  const undated = { ...reminder, title: 'Undated task', due_date: null, due_time: null, list_id: 10 };
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/reminder-lists' ? [defaultList] : url === '/api/reminders' ? [undated] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  expect(screen.queryByText('Undated task')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
  expect(await screen.findByText('No reminders on this date.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Undated task' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '+ New Reminder' }));
  const dialog = await screen.findByRole('dialog', { name: 'New reminder' });
  expect(within(dialog).getByLabelText('Due date')).not.toBeRequired();
  fireEvent.change(within(dialog).getByLabelText(/Time/), { target: { value: '10:00' } });
  expect(within(dialog).getByLabelText('Due date')).toBeRequired();
});

test('trashes and restores a reminder list and confirms permanent deletion', async () => {
  let trashed = false;
  const list = { id: 11, name: 'Family', description: '', is_default: false };
  const item = { ...reminder, list_id: 11 };
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/reminder-lists/11' && options?.method === 'DELETE') {
      trashed = true;
      return Promise.resolve(response({ id: 11 }));
    }
    if (url === '/api/reminder-lists/11/restore' && options?.method === 'POST') {
      trashed = false;
      return Promise.resolve(response({ id: 11 }));
    }
    const data = url === '/api/reminder-lists' ? [defaultList, ...(!trashed ? [list] : [])]
      : url === '/api/reminder-lists?trash=true' ? (trashed ? [list] : [])
        : url === '/api/reminders' ? (trashed ? [] : [item]) : [];
    return Promise.resolve(response(data));
  });
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: /Family 1 remaining/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Trash list' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Call home' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Trash', exact: true }));
  expect(await screen.findByText('Reminder list and its items')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect(confirm).toHaveBeenCalledWith('Permanently delete "Family" and all its items? This cannot be undone.');
  expect(global.fetch).not.toHaveBeenCalledWith('/api/reminder-lists/11?permanent=true', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/reminder-lists/11/restore', { method: 'POST' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Reminders sections' })).getByRole('button', { name: 'Reminders' }));
  fireEvent.click(await screen.findByRole('button', { name: /Family 1 remaining/ }));
  expect(await screen.findByRole('heading', { name: 'Call home' })).toBeInTheDocument();
});
