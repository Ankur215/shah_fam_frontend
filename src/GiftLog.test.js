import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  jest.restoreAllMocks();
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

  const { container } = render(<GiftLog />);

  const recipientGroup = await screen.findByRole('button', { name: /Maya Patel/ });
  expect(recipientGroup).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(recipientGroup);
  expect(await screen.findByText('Handmade photo album')).toBeInTheDocument();
  expect(screen.getByText('Maya Patel')).toBeInTheDocument();
  expect(screen.getByText('A memory from our trip.')).toBeInTheDocument();
  expect(container.querySelector('.gift-record h4')).toHaveTextContent('Birthday');
  expect(container.querySelector('.gift-record-gift')).toHaveTextContent(
    'Gift: Handmade photo album'
  );
  expect(container.querySelector('.gift-record-amount')).toHaveTextContent('35.50 USD');
  expect(global.fetch).toHaveBeenCalledWith('/api/gifts');
});

test('saves a gift and displays the saved entry', async () => {
  const savedGift = {
    id: 9,
    recipientName: 'Asha Shah',
    recipientType: 'Family',
    direction: 'Given',
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
  fireEvent.change(screen.getByPlaceholderText('What was given?'), {
    target: { value: 'A book' },
  });
  fireEvent.change(screen.getByLabelText('Gift date *'), {
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
      direction: 'Given',
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

test('records a received gift from the recipient group', async () => {
  const receivedGift = {
    id: 15,
    recipientName: 'Example Friend Group',
    recipientType: 'Friend',
    direction: 'Received',
    giftName: 'Wine bottle',
    occasion: 'Home visit',
    dateGiven: '2026-11-11',
    amount: '20.00',
    currency: 'USD',
    notes: '',
  };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse(receivedGift, 201));

  render(<GiftLog />);

  fireEvent.change(screen.getByLabelText('Direction'), {
    target: { value: 'Received' },
  });
  fireEvent.change(screen.getByLabelText('They’re my'), {
    target: { value: 'Friend' },
  });
  fireEvent.change(screen.getByLabelText('From *'), {
    target: { value: 'Example Friend Group' },
  });
  fireEvent.change(screen.getByPlaceholderText('What was given?'), {
    target: { value: 'Wine bottle' },
  });
  fireEvent.change(screen.getByLabelText('Gift date *'), {
    target: { value: '2026-11-11' },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '20.00' },
  });
  fireEvent.change(screen.getByLabelText('Currency code'), {
    target: { value: 'USD' },
  });
  fireEvent.change(screen.getByPlaceholderText('Birthday, wedding, just because…'), {
    target: { value: 'Home visit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save gift' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/gifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientName: 'Example Friend Group',
      recipientType: 'Friend',
      direction: 'Received',
      giftName: 'Wine bottle',
      occasion: 'Home visit',
      dateGiven: '2026-11-11',
      amount: '20.00',
      currency: 'USD',
      notes: '',
    }),
  });
  expect(await screen.findByText('Wine bottle')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Friend · 1 received/ }))
    .toHaveTextContent('Friend · 1 received');
  expect(screen.getByRole('heading', { name: 'Received' })).toBeInTheDocument();
  expect(screen.getByText('No gifts given to this person yet.')).toBeInTheDocument();
});

test('groups gifts by recipient and reveals all of their entries', async () => {
  const firstGift = {
    id: 21,
    recipientName: 'Tanmay-Janki',
    recipientType: 'Friend',
    direction: 'Given',
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
    direction: 'Received',
    giftName: 'Writing board',
    occasion: 'Siya - 2 year bday',
    amount: '50.00',
  };
  const thirdGift = {
    ...firstGift,
    id: 23,
    giftName: 'Family meal',
    occasion: 'New Year',
    amount: '12.50',
    currency: 'CAD',
  };
  global.fetch = jest.fn().mockResolvedValue(apiResponse([firstGift, secondGift, thirdGift]));

  render(<GiftLog />);

  const recipientGroup = await screen.findByRole('button', { name: /Tanmay-Janki/ });
  expect(recipientGroup).toHaveTextContent('2 given · 1 received');
  expect(recipientGroup).toHaveAttribute('aria-expanded', 'false');
  expect(document.getElementById('gift-group-21')).toHaveAttribute('hidden');

  fireEvent.click(recipientGroup);

  expect(recipientGroup).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById('gift-group-21')).not.toHaveAttribute('hidden');
  const givenSection = screen.getByRole('region', { name: 'Given' });
  const receivedSection = screen.getByRole('region', { name: 'Received' });
  expect(within(givenSection).getByText('Tummy time toy')).toBeInTheDocument();
  expect(within(givenSection).getByText('Siya born')).toBeInTheDocument();
  expect(within(givenSection).getByText('Family meal')).toBeInTheDocument();
  expect(within(givenSection).queryByText('Writing board')).not.toBeInTheDocument();
  expect(within(receivedSection).getByText('Writing board')).toBeInTheDocument();
  expect(within(receivedSection).getByText('Siya - 2 year bday')).toBeInTheDocument();
  expect(within(givenSection).getByText('Total: 12.50 CAD · 40.00 USD')).toBeInTheDocument();
  expect(within(receivedSection).getByText('Total: 50.00 USD')).toBeInTheDocument();

  const givenAccordion = within(givenSection).getByRole('button', {
    name: /Given.*2 gifts.*Total: 12.50 CAD · 40.00 USD/,
  });
  fireEvent.click(givenAccordion);
  expect(givenAccordion).toHaveAttribute('aria-expanded', 'false');
  expect(within(givenSection).getByText('Tummy time toy')).not.toBeVisible();
  fireEvent.click(givenAccordion);
  expect(within(givenSection).getByText('Tummy time toy')).toBeVisible();
});

test('edits a saved gift and displays the updated entry', async () => {
  const existingGift = {
    id: 12,
    recipientName: 'Maya Patel',
    recipientType: 'Friend',
    direction: 'Given',
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
  expect(screen.getByLabelText('To *')).toHaveValue('Maya Patel');
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
      direction: 'Given',
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

test('confirms and deletes a gift from its recipient history', async () => {
  const gift = {
    id: 31,
    recipientName: 'Maya Patel',
    recipientType: 'Friend',
    direction: 'Given',
    giftName: 'Photo album',
    occasion: 'Birthday',
    dateGiven: '2025-11-12',
    amount: '35.50',
    currency: 'USD',
    notes: '',
  };
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([gift]))
    .mockResolvedValueOnce(apiResponse({ id: gift.id }));

  render(<GiftLog />);

  fireEvent.click(await screen.findByRole('button', { name: /Maya Patel/ }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Delete Birthday gift for Maya Patel',
  }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(confirmSpy).toHaveBeenCalledWith(
    'Delete “Birthday — Photo album” for Maya Patel? This cannot be undone.'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/gifts/31', {
    method: 'DELETE',
  });
  expect(await screen.findByText('No gifts logged yet')).toBeInTheDocument();
});

test('keeps a gift when deletion is canceled', async () => {
  const gift = {
    id: 32,
    recipientName: 'Maya Patel',
    recipientType: 'Friend',
    direction: 'Received',
    giftName: 'Flowers',
    occasion: 'Thank you',
    dateGiven: '2025-11-12',
    amount: '',
    currency: '',
    notes: '',
  };
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  global.fetch = jest.fn().mockResolvedValue(apiResponse([gift]));

  render(<GiftLog />);

  fireEvent.click(await screen.findByRole('button', { name: /Maya Patel/ }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Delete Thank you gift for Maya Patel',
  }));

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Flowers')).toBeInTheDocument();
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

test('moves a gift within its direction and saves the reordered sequence', async () => {
  const firstGift = {
    id: 1,
    recipientName: 'Asha Shah',
    recipientType: 'Family',
    direction: 'Given',
    giftName: 'First gift',
    occasion: '',
    dateGiven: '2025-11-12',
    amount: '',
    currency: '',
    notes: '',
  };
  const secondGift = { ...firstGift, id: 2, giftName: 'Second gift' };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([firstGift, secondGift]))
    .mockResolvedValueOnce(apiResponse([secondGift, firstGift]));

  const { container } = render(<GiftLog />);
  fireEvent.click(await screen.findByRole('button', { name: /Asha Shah/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Move Second gift for Asha Shah up' })
  );

  await waitFor(() =>
    expect(global.fetch).toHaveBeenLastCalledWith('/api/gifts/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ giftIds: [2, 1] }),
    })
  );
  await waitFor(() => {
    const names = [...container.querySelectorAll('.gift-record h4')].map(
      (giftName) => giftName.textContent
    );
    expect(names).toEqual(['Second gift', 'First gift']);
  });
});
