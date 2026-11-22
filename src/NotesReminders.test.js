import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  fireEvent.click(screen.getByLabelText('Text formatting'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
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
  fireEvent.click(screen.getByText('Aa'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
  expect(within(content).getByRole('heading', { name: 'Soup for everyone' })).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/notes/1', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('## Soup for everyone'),
  })), { timeout: 3000 });
});

test.each(['Title', 'Heading', 'Subheading', 'Body', 'Bulleted list', 'Numbered list', 'Checklist'])(
  'closes the formatting menu after selecting %s', async (option) => {
    global.fetch = jest.fn((url) => Promise.resolve(response(url === '/api/notes' ? [note] : [])));
    render(<NotesReminders />);
    await screen.findByText('Family recipes');
    fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
    const toolbar = await screen.findByRole('toolbar', { name: 'Note formatting' });
    const content = await screen.findByRole('textbox', { name: 'Note content' });
    fireEvent.click(content);
    const summary = within(toolbar).getByLabelText('Text formatting');
    const menu = summary.closest('details');
    fireEvent.click(summary);
    expect(menu).toHaveAttribute('open');
    fireEvent.click(within(toolbar).getByRole('button', { name: option }));
    expect(menu).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(menu).toHaveAttribute('open');
  }
);

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
  fireEvent.click(within(editor).getByLabelText('Text formatting'));
  fireEvent.click(within(editor).getByRole('button', { name: 'Heading' }));
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
  fireEvent.click(within(toolbar).getByLabelText('Text formatting'));
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Heading' }));
  expect(within(content).getByRole('heading', { name: 'Soup for everyone' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Packing list/ }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Note content' })).toHaveTextContent('Shoes'));
  expect(screen.getByRole('toolbar', { name: 'Note formatting' })).toBe(toolbar);
  content = screen.getByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(within(toolbar).getByLabelText('Text formatting'));
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Heading' }));
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
  expect(within(toolbar).getByRole('button', { name: 'B Bold' })).toBeDisabled();
  expect(within(toolbar).getByLabelText('Text formatting')).toHaveAttribute('aria-disabled', 'true');
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
  fireEvent.click(screen.getByText('Aa'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
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

test('organizes notes and reminders under their main tabs and keeps trash shared', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(response(
    url === '/api/notes?trash=true' ? [note] : url === '/api/reminders?trash=true' ? [reminder] : []
  )));
  render(<NotesReminders />);
  await screen.findByText('Nothing overdue.');
  const main = within(screen.getByRole('navigation', { name: 'Notes and reminders navigation' }));
  expect(main.getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Dashboard', 'Notes', 'Reminders', 'Trash']);
  expect(screen.queryByRole('navigation', { name: 'Notes sections' })).not.toBeInTheDocument();

  fireEvent.click(main.getByRole('button', { name: 'Notes' }));
  const notesNav = within(screen.getByRole('navigation', { name: 'Notes sections' }));
  expect(notesNav.getAllByRole('button').map((button) => button.textContent)).toEqual(['Notes', 'Pinned']);
  fireEvent.click(notesNav.getByRole('button', { name: 'Pinned' }));
  expect(await screen.findByText('Pin a note to keep it close.')).toBeInTheDocument();
  expect(main.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');

  fireEvent.click(main.getByRole('button', { name: 'Reminders' }));
  const remindersNav = within(screen.getByRole('navigation', { name: 'Reminders sections' }));
  expect(remindersNav.getAllByRole('button').map((button) => button.textContent))
    .toEqual(['Reminders', 'Calendar', 'Completed']);
  fireEvent.click(remindersNav.getByRole('button', { name: 'Completed' }));
  expect(main.getByRole('button', { name: 'Reminders' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Completed reminders will appear here.')).toBeInTheDocument();

  fireEvent.click(main.getByRole('button', { name: 'Trash' }));
  expect(screen.getByText('Family recipes')).toBeInTheDocument();
  expect(screen.getByText('Call home')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Reminders sections' })).not.toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Reminders', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: /Family 1 remaining/ }));
  expect(await screen.findByRole('heading', { name: 'Call home' })).toBeInTheDocument();
});
