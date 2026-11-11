import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GiftLog from './GiftLog';

function apiResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

afterEach(() => {
  jest.resetAllMocks();
});

test('loads gift history from the API', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse([
      {
        id: 8,
        recipientName: 'Maya Patel',
        recipientType: 'Friend',
        giftName: 'Handmade photo album',
        occasion: 'Birthday',
        dateGiven: '2025-11-12',
        amount: '35.50',
        currency: 'USD',
        notes: 'A memory from our trip.',
      },
    ])
  );

  render(<GiftLog />);

  const recipientGroup = await screen.findByRole('button', { name: /Maya Patel/ });
  expect(recipientGroup).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(recipientGroup);
  expect(await screen.findByText('Handmade photo album')).toBeInTheDocument();
  expect(screen.getByText('Maya Patel')).toBeInTheDocument();
  expect(screen.getByText('A memory from our trip.')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/gifts');
});

test('saves a gift and displays the saved entry', async () => {
  const savedGift = {
    id: 9,
    recipientName: 'Asha Shah',
    recipientType: 'Family',
    giftName: 'A book',
    occasion: 'Just because',
    dateGiven: '2025-10-10',
    amount: '',
    currency: '',
    notes: '',
  };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse(savedGift, 201));

  render(<GiftLog />);

  fireEvent.change(screen.getByPlaceholderText('Person’s name'), {
    target: { value: 'Asha Shah' },
  });
  fireEvent.change(screen.getByPlaceholderText('What did you give?'), {
    target: { value: 'A book' },
  });
  fireEvent.change(screen.getByLabelText('Date given *'), {
    target: { value: '2025-10-10' },
  });
  fireEvent.change(screen.getByPlaceholderText('Birthday, wedding, just because…'), {
    target: { value: 'Just because' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save gift' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/gifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientName: 'Asha Shah',
      recipientType: 'Family',
      giftName: 'A book',
      occasion: 'Just because',
      dateGiven: '2025-10-10',
      amount: '',
      currency: '',
      notes: '',
    }),
  });
  expect(await screen.findByText('A book')).toBeInTheDocument();
  expect(screen.getByText('Asha Shah')).toBeInTheDocument();
});

test('groups gifts by recipient and reveals all of their entries', async () => {
  const firstGift = {
    id: 21,
    recipientName: 'Tanmay-Janki',
    recipientType: 'Friend',
    giftName: 'Tummy time toy',
    occasion: 'Siya born',
    dateGiven: '2026-11-11',
    amount: '40.00',
    currency: 'USD',
    notes: '',
  };
  const secondGift = {
    ...firstGift,
    id: 22,
    giftName: 'Writing board',
    occasion: 'Siya - 2 year bday',
    amount: '50.00',
  };
  global.fetch = jest.fn().mockResolvedValue(apiResponse([firstGift, secondGift]));

  render(<GiftLog />);

  const recipientGroup = await screen.findByRole('button', { name: /Tanmay-Janki/ });
  expect(recipientGroup).toHaveTextContent('2 gifts');
  expect(recipientGroup).toHaveAttribute('aria-expanded', 'false');
  expect(document.getElementById('gift-group-21')).toHaveAttribute('hidden');

  fireEvent.click(recipientGroup);

  expect(recipientGroup).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById('gift-group-21')).not.toHaveAttribute('hidden');
  expect(await screen.findByText('Tummy time toy')).toBeInTheDocument();
  expect(screen.getByText('Writing board')).toBeInTheDocument();
  expect(screen.getByText('Siya born')).toBeInTheDocument();
  expect(screen.getByText('Siya - 2 year bday')).toBeInTheDocument();
});

test('edits a saved gift and displays the updated entry', async () => {
  const existingGift = {
    id: 12,
    recipientName: 'Maya Patel',
    recipientType: 'Friend',
    giftName: 'Photo album',
    occasion: 'Birthday',
    dateGiven: '2025-11-12',
    amount: '35.50',
    currency: 'USD',
    notes: 'An old note',
  };
  const updatedGift = {
    ...existingGift,
    giftName: 'Framed photo',
    amount: '45.00',
    notes: 'Updated note',
  };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([existingGift]))
    .mockResolvedValueOnce(apiResponse(updatedGift));

  render(<GiftLog />);

  fireEvent.click(await screen.findByRole('button', { name: /Maya Patel/ }));
  fireEvent.click(await screen.findByRole('button', {
    name: 'Edit Birthday gift for Maya Patel',
  }));
  expect(screen.getByRole('heading', { name: 'Edit gift' })).toBeInTheDocument();
  expect(screen.getByLabelText('For *')).toHaveValue('Maya Patel');
  expect(screen.getByLabelText('They’re my')).toHaveValue('Friend');
  expect(screen.getByLabelText('Gift *')).toHaveValue('Photo album');
  expect(screen.getByLabelText('Amount')).toHaveValue(35.5);
  expect(screen.getByLabelText('Details or note')).toHaveValue('An old note');

  fireEvent.change(screen.getByLabelText('Gift *'), {
    target: { value: 'Framed photo' },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '45.00' },
  });
  fireEvent.change(screen.getByLabelText('Details or note'), {
    target: { value: 'Updated note' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/gifts/12', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientName: 'Maya Patel',
      recipientType: 'Friend',
      giftName: 'Framed photo',
      occasion: 'Birthday',
      dateGiven: '2025-11-12',
      amount: '45.00',
      currency: 'USD',
      notes: 'Updated note',
    }),
  });
  expect(await screen.findByText('Framed photo')).toBeInTheDocument();
  expect(screen.getByText('Updated note')).toBeInTheDocument();
  expect(screen.queryByText('Photo album')).not.toBeInTheDocument();
});

test('shows an API error when gift history cannot be loaded', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse({ error: 'Could not load gifts from the database.' }, 503)
  );

  render(<GiftLog />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load gifts from the database.'
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
