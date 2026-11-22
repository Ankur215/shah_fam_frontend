import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ImportantDates, { nextDate } from './ImportantDates';

const response = (data, status = 200) => ({
  ok: status < 400, status, text: async () => JSON.stringify(data),
});
const members = [{
  id: 1, firstName: 'Asha', lastName: 'Shah',
  dateOfBirth: '2000-02-29', anniversaryDate: '2001-05-01',
}];

afterEach(() => jest.resetAllMocks());

test('yearly dates use February 28 in non-leap years and preserve future start dates', () => {
  expect(nextDate('2000-02-29', true, '2025-02-27')).toBe('2025-02-28');
  expect(nextDate('2000-02-29', true, '2025-03-01')).toBe('2026-02-28');
  expect(nextDate('2000-02-29', true, '2028-02-28')).toBe('2028-02-29');
  expect(nextDate('2030-07-01', true, '2025-01-01')).toBe('2030-07-01');
  expect(nextDate('2020-01-01', false, '2025-01-01')).toBe('2020-01-01');
});

test('shows completed years since saved dates, updating on the anniversary', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 1, 23, 59, 59));
  global.fetch = jest.fn(() => Promise.resolve(response([
    { id: 1, title: 'Family day', date: '2020-01-02', repeatYearly: true },
    { id: 2, title: 'Last year', date: '2025-01-01', repeatYearly: false },
    { id: 3, title: 'Future event', date: '2027-01-01', repeatYearly: false },
  ])));
  try {
    render(<ImportantDates members={[{ ...members[0], dateOfBirth: '1990-01-02' }]} />);
    const list = screen.getByRole('region', { name: 'Important dates' });
    const familyDay = (await within(list).findByText('Family day')).closest('article');
    const lastYear = within(list).getByText('Last year').closest('article');
    const future = within(list).getByText('Future event').closest('article');
    expect(familyDay).toHaveTextContent('Jan 2, 2020');
    expect(familyDay).not.toHaveTextContent('Jan 2, 2026');
    expect(familyDay).toHaveTextContent('5 years ago');
    expect(lastYear).toHaveTextContent('Jan 1, 2025');
    expect(lastYear).toHaveTextContent('1 year ago');
    expect(future).toHaveTextContent('Jan 1, 2027');
    expect(future).not.toHaveTextContent(/years? ago/);
    const upcoming = screen.getByRole('region', { name: 'Upcoming event' });
    expect(upcoming).toHaveTextContent('Jan 2, 2026');
    expect(upcoming).toHaveTextContent('0d 0h 0m 01s');

    act(() => jest.advanceTimersByTime(1000));
    expect(familyDay).toHaveTextContent('6 years ago');
    expect(upcoming).toHaveTextContent('Today');
  } finally {
    jest.useRealTimers();
  }
});

test('counts down to the next saved date regardless of manual order and skips past dates', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
  global.fetch = jest.fn(() => Promise.resolve(response([
    { id: 1, title: 'Past', date: '2025-12-01', repeatYearly: false, sortOrder: 0 },
    { id: 2, title: 'Later', date: '2026-01-03', repeatYearly: false, sortOrder: 1 },
    { id: 3, title: 'First', date: '2026-01-02', repeatYearly: false, sortOrder: 2 },
    { id: 4, title: 'Also first', date: '2026-01-02', repeatYearly: false, sortOrder: 3 },
  ])));
  try {
    render(<ImportantDates members={members} />);
    const upcoming = screen.getByRole('region', { name: 'Upcoming event' });
    await waitFor(() => expect(upcoming).toHaveTextContent('Also first'));
    expect(upcoming).toHaveTextContent('First');
    expect(upcoming).toHaveTextContent('1d 0h 0m 00s');
    expect(upcoming).not.toHaveTextContent('Past');
    expect(upcoming).not.toHaveTextContent('Later');
    act(() => jest.advanceTimersByTime(1000));
    expect(upcoming).toHaveTextContent('0d 23h 59m 59s');
    act(() => {
      jest.setSystemTime(new Date(2026, 0, 3, 0, 0, 0));
      jest.advanceTimersByTime(1000);
    });
    expect(upcoming).toHaveTextContent('Later');
    expect(upcoming).toHaveTextContent('Today');
    act(() => {
      jest.setSystemTime(new Date(2026, 0, 4, 0, 0, 0));
      jest.advanceTimersByTime(1000);
    });
    expect(upcoming).toHaveTextContent('No upcoming important dates');
  } finally {
    jest.useRealTimers();
  }
});

test('keeps explicitly saved dates visible even if members fail to load', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
  global.fetch = jest.fn(() => Promise.resolve(response([
    { id: 1, title: 'Special birthday', date: '1990-01-02', repeatYearly: true },
  ])));
  try {
    render(<ImportantDates members={[]} membersError onRetryMembers={() => {}} />);
    expect(await screen.findByText('Special birthday', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Could not load family member choices.')).toBeInTheDocument();
    expect(screen.getByText('Special birthday', { selector: 'strong' }).closest('article'))
      .toHaveTextContent('Jan 2, 1990');
  } finally {
    jest.useRealTimers();
  }
});

test('searches dates by title, linked member, or date without changing the upcoming event', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([
    { id: 1, title: 'Family reunion', date: '2099-01-02', repeatYearly: false, familyMemberId: 1 },
    { id: 2, title: 'Graduation', date: '2099-02-01', repeatYearly: false, familyMemberId: null },
  ])));
  render(<ImportantDates members={members} canEdit />);
  const list = screen.getByRole('region', { name: 'Important dates' });
  await within(list).findByText('Family reunion');
  const search = within(list).getByRole('searchbox', { name: 'Search important dates' });
  expect(within(list).getByText('2 dates')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: '  REUNION  ' } });
  expect(within(list).getByText('1 date')).toBeInTheDocument();
  expect(within(list).queryByText('Graduation')).not.toBeInTheDocument();
  expect(within(list).getByRole('button', { name: 'Move Family reunion down' })).toBeDisabled();
  expect(screen.getByRole('region', { name: 'Upcoming event' })).toHaveTextContent('Family reunion');

  fireEvent.change(search, { target: { value: 'asha shah' } });
  expect(within(list).getByText('Family reunion')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'Feb 1, 2099' } });
  expect(within(list).getByText('Graduation')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'unmatched' } });
  expect(within(list).getByText('No important dates found')).toBeInTheDocument();
  expect(within(list).getByText('0 dates')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: '' } });
  expect(within(list).getByText('2 dates')).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: 'Move Family reunion down' })).toBeEnabled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('saves manual ordering of entered dates', async () => {
  let dates = [
    { id: 1, title: 'First', date: '2099-01-01', repeatYearly: false, sortOrder: null },
    { id: 2, title: 'Second', date: '2099-01-02', repeatYearly: false, sortOrder: null },
  ];
  global.fetch = jest.fn((url, options = {}) => {
    if (options.method === 'PUT') {
      const { dateIds } = JSON.parse(options.body);
      dates = dateIds.map((id, sortOrder) => ({
        ...dates.find((item) => item.id === id), sortOrder,
      }));
    }
    return Promise.resolve(response(dates));
  });
  const { unmount } = render(<ImportantDates members={[]} canEdit />);
  const list = screen.getByRole('region', { name: 'Important dates' });
  const rowTitles = () => [...list.querySelectorAll('.important-date-title')].map((node) => node.textContent);
  await within(list).findByText('First');
  expect(rowTitles()).toEqual(['First', 'Second']);
  expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/important-dates/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateIds: [2, 1] }),
  }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move Second down' })).toBeEnabled());
  expect(rowTitles()).toEqual(['Second', 'First']);
  expect(screen.getByRole('region', { name: 'Upcoming event' })).toHaveTextContent('First');
  unmount();
  render(<ImportantDates members={[]} canEdit />);
  const reloaded = screen.getByRole('region', { name: 'Important dates' });
  await within(reloaded).findByText('First');
  expect([...reloaded.querySelectorAll('.important-date-title')].map((node) => node.textContent))
    .toEqual(['Second', 'First']);
});

test('restores the original order and reports a failed reorder', async () => {
  global.fetch = jest.fn((url, options = {}) => Promise.resolve(response(
    options.method === 'PUT' ? { error: 'Unavailable' } : [
      { id: 1, title: 'First', date: '2099-01-01', repeatYearly: false },
      { id: 2, title: 'Second', date: '2099-01-02', repeatYearly: false },
    ],
    options.method === 'PUT' ? 503 : 200,
  )));
  render(<ImportantDates members={[]} canEdit />);
  fireEvent.click(await screen.findByRole('button', { name: 'Move Second up' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reorder important dates. Unavailable');
  const titles = [...screen.getByRole('region', { name: 'Important dates' })
    .querySelectorAll('.important-date-title')].map((node) => node.textContent);
  expect(titles).toEqual(['First', 'Second']);
});

test('shows saved order without move controls to read-only users', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response([
    { id: 1, title: 'Earlier', date: '2099-01-01', repeatYearly: false, sortOrder: 1 },
    { id: 2, title: 'Later', date: '2099-01-02', repeatYearly: false, sortOrder: 0 },
  ])));
  render(<ImportantDates members={[]} canEdit={false} />);
  const list = screen.getByRole('region', { name: 'Important dates' });
  await within(list).findByText('Earlier');
  expect([...list.querySelectorAll('.important-date-title')].map((node) => node.textContent))
    .toEqual(['Later', 'Earlier']);
  expect(within(list).queryByRole('button', { name: /move/i })).not.toBeInTheDocument();
});

test('does not copy family birthdays and creates, edits, and deletes dates', async () => {
  let date = null;
  global.fetch = jest.fn((url, options = {}) => {
    if (options.method === 'POST' || options.method === 'PUT') {
      date = { id: 2, ...JSON.parse(options.body) };
      return Promise.resolve(response(date));
    }
    if (options.method === 'DELETE') {
      date = null;
      return Promise.resolve(response({ id: 2 }));
    }
    return Promise.resolve(response([]));
  });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<ImportantDates members={members} canEdit />);
  const dateList = screen.getByRole('region', { name: 'Important dates' });
  expect(await within(dateList).findByText('No important dates yet')).toBeInTheDocument();
  expect(screen.queryByText("Asha Shah's birthday")).not.toBeInTheDocument();
  expect(screen.queryByText(/anniversary/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /add important date/i }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Family day' } });
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2025-06-01' } });
  fireEvent.change(within(dialog).getByLabelText('Repeats'), { target: { value: 'yearly' } });
  fireEvent.change(within(dialog).getByLabelText(/family member/i), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save date' }));
  expect(await within(dateList).findByText('Family day')).toBeInTheDocument();
  expect(date).toEqual({ id: 2, title: 'Family day', date: '2025-06-01', repeatYearly: true, familyMemberId: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Family day' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reunion' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
  expect(await within(dateList).findByText('Reunion')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Reunion' }));
  await waitFor(() => expect(screen.queryByText('Reunion')).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledWith('/api/important-dates/2', { method: 'DELETE' });
  window.confirm.mockRestore();
});

test('shows load and save errors and prevents editing for read-only accounts', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response({ error: 'Unavailable' }, 503)));
  const { rerender } = render(<ImportantDates members={[]} canEdit={false} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  expect(screen.getByRole('region', { name: 'Upcoming event' }))
    .toHaveTextContent('Upcoming events are unavailable.');
  expect(screen.queryByRole('button', { name: /add important date/i })).not.toBeInTheDocument();
  rerender(<ImportantDates members={[]} canEdit />);
  fireEvent.click(screen.getByRole('button', { name: /add important date/i }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Unavailable');
});
