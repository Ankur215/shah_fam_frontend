import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CharityLog from './CharityLog';

function apiResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

test('loads and shows every charity work record newest first', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse([
      {
        id: 1,
        organization: 'Community Pantry',
        workType: 'Goods donation',
        activity: 'Donated groceries',
        datePerformed: '2025-03-10',
        amount: '',
        currency: '',
        volunteerHours: '',
        notes: '',
      },
      {
        id: 2,
        organization: 'Local Shelter',
        workType: 'Volunteering',
        activity: 'Prepared dinner',
        datePerformed: '2026-02-15',
        amount: '',
        currency: '',
        volunteerHours: '2.50',
        notes: 'Helped serve families',
      },
    ])
  );

  const { container } = render(<CharityLog />);

  const entries = await screen.findAllByRole('article');
  expect(entries.map((entry) => within(entry).getByRole('heading').textContent)).toEqual([
    'Prepared dinner',
    'Donated groceries',
  ]);
  expect(screen.getByText('Local Shelter')).toBeInTheDocument();
  expect(screen.getByText('2.50 volunteer hours')).toBeInTheDocument();
  expect(screen.getByText('Helped serve families')).toBeInTheDocument();
  expect(container.querySelector('.charity-summary')).toHaveTextContent('2.5');
  expect(global.fetch).toHaveBeenCalledWith('/api/charity-records');
});

test('saves a charity work record and includes its optional contribution details', async () => {
  const savedRecord = {
    id: 7,
    organization: 'Community Food Bank',
    workType: 'Volunteering',
    activity: 'Packed meal boxes',
    datePerformed: '2026-11-10',
    amount: '25.50',
    currency: 'USD',
    volunteerHours: '2.50',
    notes: 'Family volunteer day',
  };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse(savedRecord, 201));

  render(<CharityLog />);

  fireEvent.change(screen.getByLabelText(/organization \/ charity/i), {
    target: { value: 'Community Food Bank' },
  });
  fireEvent.change(screen.getByLabelText(/work type/i), {
    target: { value: 'Volunteering' },
  });
  fireEvent.change(screen.getByLabelText(/activity \/ work done/i), {
    target: { value: 'Packed meal boxes' },
  });
  fireEvent.change(screen.getByLabelText(/date/i), {
    target: { value: '2026-11-10' },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '25.50' },
  });
  fireEvent.change(screen.getByLabelText('Currency code'), {
    target: { value: 'usd' },
  });
  fireEvent.change(screen.getByLabelText(/volunteer hours/i), {
    target: { value: '2.5' },
  });
  fireEvent.change(screen.getByLabelText('Notes'), {
    target: { value: 'Family volunteer day' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save record' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/charity-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization: 'Community Food Bank',
      workType: 'Volunteering',
      activity: 'Packed meal boxes',
      datePerformed: '2026-11-10',
      amount: '25.50',
      currency: 'USD',
      volunteerHours: '2.5',
      notes: 'Family volunteer day',
    }),
  });
  expect(await screen.findByText('Packed meal boxes')).toBeInTheDocument();
  expect(screen.getByText('Family volunteer day')).toBeInTheDocument();
});

test('moves a charity record and saves the new sequence', async () => {
  const firstRecord = {
    id: 1,
    organization: 'Community Pantry',
    workType: 'Donation',
    activity: 'Donated groceries',
    datePerformed: '2026-03-10',
    amount: '',
    currency: '',
    volunteerHours: '',
    notes: '',
    sortOrder: 0,
  };
  const secondRecord = {
    ...firstRecord,
    id: 2,
    organization: 'Local Shelter',
    activity: 'Prepared dinner',
    sortOrder: 1,
  };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([firstRecord, secondRecord]))
    .mockResolvedValueOnce(
      apiResponse([
        { ...secondRecord, sortOrder: 0 },
        { ...firstRecord, sortOrder: 1 },
      ])
    );

  const { container } = render(<CharityLog />);

  expect(
    (await screen.findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent)
  ).toEqual(['Donated groceries', 'Prepared dinner']);
  fireEvent.click(screen.getByRole('button', { name: 'Move Prepared dinner up' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/charity-records/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordIds: [2, 1] }),
  });
  expect(
    [...container.querySelectorAll('.charity-record h3')].map((heading) => heading.textContent)
  ).toEqual(['Prepared dinner', 'Donated groceries']);
});

test('edits and deletes an existing charity record', async () => {
  const record = {
    id: 12,
    organization: 'Community Food Bank',
    workType: 'Donation',
    activity: 'Donated groceries',
    datePerformed: '2026-08-20',
    amount: '35.00',
    currency: 'USD',
    volunteerHours: '',
    notes: '',
  };
  const updatedRecord = { ...record, activity: 'Donated fresh produce' };
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([record]))
    .mockResolvedValueOnce(apiResponse(updatedRecord))
    .mockResolvedValueOnce(apiResponse({ id: record.id }));

  render(<CharityLog />);

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Edit Donated groceries at Community Food Bank',
    })
  );
  fireEvent.change(screen.getByLabelText(/activity \/ work done/i), {
    target: { value: 'Donated fresh produce' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/charity-records/12', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization: 'Community Food Bank',
      workType: 'Donation',
      activity: 'Donated fresh produce',
      datePerformed: '2026-08-20',
      amount: '35.00',
      currency: 'USD',
      volunteerHours: '',
      notes: '',
    }),
  });

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete Donated fresh produce at Community Food Bank',
    })
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(confirmSpy).toHaveBeenCalled();
  expect(global.fetch).toHaveBeenLastCalledWith('/api/charity-records/12', {
    method: 'DELETE',
  });
  expect(await screen.findByText('No charity work recorded yet')).toBeInTheDocument();
});
