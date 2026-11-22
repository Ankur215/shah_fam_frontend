import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

test('shows birthdays without anniversaries and creates, edits, and deletes dates', async () => {
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
  expect(await screen.findByText("Asha Shah's birthday")).toBeInTheDocument();
  expect(screen.queryByText(/anniversary/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /add important date/i }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Family day' } });
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2025-06-01' } });
  fireEvent.change(within(dialog).getByLabelText('Repeats'), { target: { value: 'yearly' } });
  fireEvent.change(within(dialog).getByLabelText(/family member/i), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save date' }));
  expect(await screen.findByText('Family day')).toBeInTheDocument();
  expect(date).toEqual({ id: 2, title: 'Family day', date: '2025-06-01', repeatYearly: true, familyMemberId: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Family day' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reunion' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
  expect(await screen.findByText('Reunion')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Reunion' }));
  await waitFor(() => expect(screen.queryByText('Reunion')).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledWith('/api/important-dates/2', { method: 'DELETE' });
  window.confirm.mockRestore();
});

test('shows load and save errors and prevents editing for read-only accounts', async () => {
  global.fetch = jest.fn(() => Promise.resolve(response({ error: 'Unavailable' }, 503)));
  const { rerender } = render(<ImportantDates members={[]} canEdit={false} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  expect(screen.queryByRole('button', { name: /add important date/i })).not.toBeInTheDocument();
  rerender(<ImportantDates members={[]} canEdit />);
  fireEvent.click(screen.getByRole('button', { name: /add important date/i }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save date' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Unavailable');
});
