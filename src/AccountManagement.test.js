import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AccountManagement from './AccountManagement';

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

test('lists accounts and lets an administrator create a normal user', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'admin@example.com', role: 'admin' },
    ]))
    .mockResolvedValueOnce(
      apiResponse({
        id: 2,
        email: 'family@example.com',
        role: 'user',
        accessPages: ['family', 'medical', 'gifts', 'charity'],
      }, 201)
    );

  render(<AccountManagement />);
  const adminEmail = await screen.findByText('admin@example.com');
  const adminRow = within(adminEmail.closest('li'));
  expect(adminRow.getByText('Admin user')).toBeInTheDocument();
  expect(
    adminRow.getByText('Admin user').compareDocumentPosition(adminEmail) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'a-secure-family-password' },
  });
  fireEvent.click(screen.getByLabelText('Gift log'));
  fireEvent.click(screen.getByLabelText('Charity work'));
  fireEvent.click(screen.getByRole('button', { name: 'Create normal user account' }));

  const accountRow = await screen.findByText('family@example.com');
  const row = within(accountRow.closest('li'));
  expect(row.getByText('Normal user')).toBeInTheDocument();
  expect(
    row.getByText('Family members and family tree, Medical reports, Gift log, Charity work')
  ).toBeInTheDocument();
  expect(
    row.getByText('Normal user').compareDocumentPosition(accountRow) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(await screen.findByRole('status')).toHaveTextContent(
    /share the temporary password securely/i
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'family@example.com',
      password: 'a-secure-family-password',
      accessPages: ['family', 'medical', 'gifts', 'charity'],
    }),
  });
});

test('keeps admin creation out of user account management', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse([{ id: 1, email: 'admin@example.com', role: 'admin' }])
  );
  render(<AccountManagement />);
  await screen.findByText('admin@example.com');
  expect(screen.queryByLabelText('Account type')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Admin user' })).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Create normal user account' })
  ).toBeInTheDocument();
  expect(screen.getByText(/Admin sign up/)).toBeInTheDocument();
});

test('lets an administrator update a normal user account', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      {
        id: 2,
        email: 'family@example.com',
        role: 'user',
        accessPages: ['family', 'medical'],
      },
    ]))
    .mockResolvedValueOnce(apiResponse({
      id: 2,
      email: 'updated-family@example.com',
      role: 'user',
      accessPages: ['medical', 'gifts'],
    }));

  render(<AccountManagement />);
  const accountRow = await screen.findByText('family@example.com');
  fireEvent.click(within(accountRow.closest('li')).getByRole('button', { name: 'Edit' }));

  const editForm = screen.getByRole('form', { name: 'Edit family@example.com' });
  fireEvent.change(within(editForm).getByLabelText('Email address'), {
    target: { value: 'updated-family@example.com' },
  });
  fireEvent.click(
    within(editForm).getByLabelText('Family members and family tree')
  );
  fireEvent.click(within(editForm).getByLabelText('Gift log'));
  fireEvent.change(
    within(editForm).getByLabelText(
      'New password (leave blank to keep current password)'
    ),
    { target: { value: 'updated-secure-password' } }
  );
  fireEvent.click(within(editForm).getByRole('button', { name: 'Save changes' }));

  const updatedAccount = await screen.findByText('updated-family@example.com');
  expect(
    within(updatedAccount.closest('li')).getByText('Medical reports, Gift log')
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users/2', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updated-family@example.com',
      accessPages: ['medical', 'gifts'],
      password: 'updated-secure-password',
    }),
  });
});

test('lets an administrator delete a normal user account after confirmation', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      {
        id: 2,
        email: 'family@example.com',
        role: 'user',
        accessPages: ['family'],
      },
    ]))
    .mockResolvedValueOnce(apiResponse({ message: 'Normal user account deleted.' }));
  jest.spyOn(window, 'confirm').mockReturnValue(true);

  render(<AccountManagement />);
  const accountRow = await screen.findByText('family@example.com');
  fireEvent.click(
    within(accountRow.closest('li')).getByRole('button', { name: 'Delete' })
  );

  expect(await screen.findByText('No accounts found.')).toBeInTheDocument();
  expect(window.confirm).toHaveBeenCalledWith(
    'Delete the normal user account for family@example.com?'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users/2', {
    method: 'DELETE',
  });
});
