import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const savedMember = {
  id: 1,
  firstName: 'Asha',
  lastName: 'Shah',
  relationship: 'Self',
  gender: '',
  dateOfBirth: '',
  gujaratiBirthdayMonth: '',
  gujaratiBirthdayPaksha: '',
  gujaratiBirthdayTithi: '',
  anniversaryDate: '',
  phone: '',
  email: '',
  address: '',
};

function apiResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(apiResponse([]));
});

afterEach(() => {
  jest.resetAllMocks();
});

test('shows the family member empty state after loading members from the API', async () => {
  render(<App />);

  expect(
    await screen.findByRole('heading', { name: /your family story starts here/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /add your first member/i })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/family-members');
});

test('opens the gift log from the main navigation', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /gift log/i }));

  expect(
    await screen.findByRole('heading', { name: 'Gifts by person' })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/gifts');
});

test('offers specific sibling, in-law, and extended-family relationships', async () => {
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );

  for (const relationship of [
    'Brother',
    'Sister',
    'Brother-in-law',
    'Sister-in-law',
    'Father-in-law',
    'Mother-in-law',
    'Son-in-law',
    'Daughter-in-law',
    'Niece',
    'Nephew',
  ]) {
    expect(screen.getByRole('option', { name: relationship })).toBeInTheDocument();
  }
});

test('posts a family member to the API and displays the saved record', async () => {
  global.fetch
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(
      apiResponse({
        ...savedMember,
        phone: '+1 555-0100',
        gujaratiBirthdayMonth: 'Kartak',
        gujaratiBirthdayPaksha: 'Sud',
        gujaratiBirthdayTithi: 'Poonam',
      })
    );

  render(<App />);

  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: 'Shah' },
  });
  fireEvent.change(screen.getByLabelText(/relationship/i), {
    target: { value: 'Self' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati birthday month'), {
    target: { value: 'Kartak' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati birthday paksha'), {
    target: { value: 'Sud' },
  });
  expect(screen.getByRole('option', { name: 'Poonam' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Amas' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Gujarati birthday tithi'), {
    target: { value: 'Poonam' },
  });
  expect(screen.getByLabelText('Country')).toHaveValue('IN');
  expect(screen.getByLabelText('Country code')).toHaveValue('+91');
  fireEvent.change(screen.getByLabelText('Country'), {
    target: { value: 'US' },
  });
  expect(screen.getByLabelText('Country code')).toHaveValue('+1');
  fireEvent.change(screen.getByLabelText(/phone number/i), {
    target: { value: '555-0100' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Asha',
      lastName: 'Shah',
      relationship: 'Self',
      gender: '',
      dateOfBirth: '',
      gujaratiBirthdayMonth: 'Kartak',
      gujaratiBirthdayPaksha: 'Sud',
      gujaratiBirthdayTithi: 'Poonam',
      anniversaryDate: '',
      phone: '+1 555-0100',
      email: '',
      address: '',
    }),
  });
  expect(await screen.findByText('Asha Shah')).toBeInTheDocument();
  expect(screen.getByText('Kartak · Sud Poonam')).toBeInTheDocument();
});

test('edits an existing family member through the API', async () => {
  const memberWithCountryCode = {
    ...savedMember,
    phone: '+44 20 1234 5678',
    gujaratiBirthdayMonth: 'Vaishakh',
    gujaratiBirthdayPaksha: 'Vad',
    gujaratiBirthdayTithi: 'Amas',
  };
  const updatedMember = { ...memberWithCountryCode, lastName: 'Patel' };
  global.fetch
    .mockResolvedValueOnce(apiResponse([memberWithCountryCode]))
    .mockResolvedValueOnce(apiResponse(updatedMember));

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha Shah' }));
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Asha');
  expect(screen.getByLabelText(/last name/i)).toHaveValue('Shah');
  expect(screen.getByLabelText('Country')).toHaveValue('GB');
  expect(screen.getByLabelText('Country code')).toHaveValue('+44');
  expect(screen.getByLabelText(/phone number/i)).toHaveValue('20 1234 5678');
  expect(screen.getByLabelText('Gujarati birthday month')).toHaveValue('Vaishakh');
  expect(screen.getByLabelText('Gujarati birthday paksha')).toHaveValue('Vad');
  expect(screen.getByLabelText('Gujarati birthday tithi')).toHaveValue('Amas');
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: 'Patel' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Asha',
      lastName: 'Patel',
      relationship: 'Self',
      gender: '',
      dateOfBirth: '',
      gujaratiBirthdayMonth: 'Vaishakh',
      gujaratiBirthdayPaksha: 'Vad',
      gujaratiBirthdayTithi: 'Amas',
      anniversaryDate: '',
      phone: '+44 20 1234 5678',
      email: '',
      address: '',
    }),
  });
  expect(await screen.findByText('Asha Patel')).toBeInTheDocument();
  expect(screen.queryByText('Asha Shah')).not.toBeInTheDocument();
});

test('keeps the form open and displays an API error when saving fails', async () => {
  global.fetch
    .mockResolvedValueOnce(apiResponse([savedMember]))
    .mockResolvedValueOnce(
      apiResponse({ error: 'Could not save family member to the database.' }, 503)
    );

  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: /add family member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /could not save family member to the database/i
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Asha Shah')).toBeInTheDocument();
});

test('shows the HTTP status when the API returns an empty error response', async () => {
  global.fetch
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '',
    });

  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /server returned http 500 with an empty response/i
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('validates required name, email, phone, and future birthday before saving', async () => {
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: '   ' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'not-an-email' },
  });
  fireEvent.change(screen.getByLabelText(/phone/i), {
    target: { value: '123-45' },
  });
  fireEvent.change(screen.getByLabelText('Birthday', { exact: true }), {
    target: { value: '2999-01-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByText('First name is required.')).toBeInTheDocument();
  expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
  expect(screen.getByText(/phone number with 7–15 digits/i)).toBeInTheDocument();
  expect(screen.getByText(/birthday cannot be in the future/i)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('requires a country when a phone number is entered', async () => {
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.change(screen.getByLabelText('Country'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText(/phone number/i), {
    target: { value: '555-0100' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(
    await screen.findByText(/choose a country to add its calling code/i)
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
