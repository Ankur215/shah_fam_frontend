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

test('lets a super admin update the active family name and theme', async () => {
  const onUserUpdated = jest.fn();
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'root@example.com', role: 'super_admin' },
    ]))
    .mockResolvedValueOnce(apiResponse([
      { id: 1, name: 'Old Family', theme: 'sage' },
    ]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse({
      id: 1,
      familyName: 'Shah Family',
      theme: 'ocean',
    }));

  render(
    <AccountManagement
      authUser={{
        id: 1,
        role: 'super_admin',
        currentWorkspaceId: 1,
        familyName: 'Old Family',
        theme: 'sage',
      }}
      onUserUpdated={onUserUpdated}
    />
  );
  await screen.findByText('root@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Active family workspace')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Family name'), {
    target: { value: 'Shah Family' },
  });
  fireEvent.change(screen.getByLabelText('Color theme'), {
    target: { value: 'ocean' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save family appearance' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Family name and theme updated.'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/super-admin/workspaces/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyName: 'Shah Family', theme: 'ocean' }),
  });
  expect(onUserUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ familyName: 'Shah Family', theme: 'ocean' })
  );
});

test('lists accounts and lets an administrator create a normal user', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'admin@example.com', role: 'admin' },
    ]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(
      apiResponse({
        id: 2,
        email: 'family@example.com',
        role: 'user',
        accessPages: ['family', 'medical', 'gifts', 'charity'],
        familyMemberIds: [],
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
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'family@example.com',
      password: 'a-secure-family-password',
      role: 'user',
      accessPages: ['family', 'medical', 'gifts', 'charity'],
      familyMemberIds: [],
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
  expect(screen.getByText(/become a super admin to manage a separate copy/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Become a super admin' })).toBeInTheDocument();
});

test('lets a super admin create an admin in a new family workspace', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'root@example.com', role: 'super_admin', workspaceId: 1 },
    ]))
    .mockResolvedValueOnce(apiResponse([{ id: 1, name: 'Root family' }]))
    .mockResolvedValueOnce(apiResponse([
      {
        id: 11,
        firstName: 'Asha',
        lastName: 'Shah',
        workspaceId: 1,
        workspaceName: 'Root family',
      },
    ]))
    .mockResolvedValueOnce(apiResponse({
      id: 2,
      email: 'new-admin@example.com',
      role: 'admin',
      workspaceId: 2,
      accessPages: ['family', 'medical', 'gifts', 'charity'],
      familyMemberIds: [11],
    }, 201))
    .mockResolvedValueOnce(apiResponse([
      { id: 1, name: 'Root family' },
      { id: 2, name: 'new-admin@example.com' },
    ]));

  render(
    <AccountManagement
      authUser={{
        id: 1,
        role: 'super_admin',
        currentWorkspaceId: 1,
      }}
    />
  );
  await screen.findByText('root@example.com');
  expect(screen.queryByLabelText('Family workspace', { selector: '#new-account-workspace' }))
    .not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'new-admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Account type'), {
    target: { value: 'admin' },
  });
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'a-secure-admin-password' },
  });
  expect(screen.getByLabelText('Asha Shah (Root family)')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));

  expect(
    await screen.findByText('new-admin@example.com', { selector: '.account-email' })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'new-admin@example.com',
      password: 'a-secure-admin-password',
      role: 'admin',
      accessPages: ['family', 'medical'],
      familyMemberIds: [11],
    }),
  });
});

test('creates a super-admin user in the active workspace without a workspace field', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'root@example.com', role: 'super_admin', workspaceId: 1 },
    ]))
    .mockResolvedValueOnce(apiResponse([{ id: 1, name: 'Root family' }]))
    .mockResolvedValueOnce(apiResponse([
      {
        id: 11,
        firstName: 'Asha',
        lastName: 'Shah',
        workspaceId: 1,
        workspaceName: 'Root family',
      },
    ]))
    .mockResolvedValueOnce(apiResponse({
      id: 3,
      email: 'family-user@example.com',
      role: 'user',
      workspaceId: 1,
      accessPages: ['family', 'medical'],
      familyMemberIds: [11],
    }, 201));

  render(
    <AccountManagement
      authUser={{
        id: 1,
        role: 'super_admin',
        currentWorkspaceId: 1,
      }}
    />
  );
  await screen.findByText('root@example.com');
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family-user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'a-secure-family-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create user account' }));

  await screen.findByText('family-user@example.com', { selector: '.account-email' });
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'family-user@example.com',
      password: 'a-secure-family-password',
      role: 'user',
      accessPages: ['family', 'medical'],
      familyMemberIds: [11],
    }),
  });
});

test('lets an admin become a super admin with a copied family workspace', async () => {
  const updatedUser = {
    id: 7,
    email: 'admin@example.com',
    role: 'super_admin',
    workspaceId: 3,
    currentWorkspaceId: 3,
    workspaces: [{ id: 3, name: 'Family (copy)' }],
  };
  const onUserUpdated = jest.fn();
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 7, email: 'admin@example.com', role: 'admin', workspaceId: 2 },
    ]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse({
      message: 'Admin promoted with an independent family copy.',
      user: updatedUser,
      workspace: { id: 3, name: 'Family (copy)' },
    }));
  jest.spyOn(window, 'confirm').mockReturnValue(true);

  render(
    <AccountManagement
      authUser={{ id: 7, email: 'admin@example.com', role: 'admin' }}
      onUserUpdated={onUserUpdated}
    />
  );
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Become a super admin' }));

  await waitFor(() => expect(onUserUpdated).toHaveBeenCalledWith(updatedUser));
  expect(window.confirm).toHaveBeenCalledWith(
    'Become a super admin? Your family workspace will be copied into a separate tree, and the original workspace will remain unchanged.'
  );
  expect(global.fetch).toHaveBeenLastCalledWith(
    '/api/super-admin/users/7/promote',
    { method: 'POST' }
  );
});

test('lets an administrator update a normal user account', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      {
        id: 2,
        email: 'family@example.com',
        role: 'user',
        accessPages: ['family', 'medical'],
        familyMemberIds: [9],
      },
    ]))
    .mockResolvedValueOnce(apiResponse([
      {
        id: 9,
        firstName: 'Asha',
        lastName: 'Shah',
        workspaceId: 1,
        workspaceName: 'Family',
      },
    ]))
    .mockResolvedValueOnce(apiResponse({
      id: 2,
      email: 'updated-family@example.com',
      role: 'user',
      accessPages: ['medical', 'gifts'],
      familyMemberIds: [],
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
  expect(within(editForm).getByLabelText('Asha Shah (Family)')).toBeChecked();
  fireEvent.click(within(editForm).getByLabelText('Asha Shah (Family)'));
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
      familyMemberIds: [],
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
        familyMemberIds: [],
      },
    ]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse({ message: 'Normal user account deleted.' }));
  jest.spyOn(window, 'confirm').mockReturnValue(true);

  render(<AccountManagement />);
  const accountRow = await screen.findByText('family@example.com');
  fireEvent.click(
    within(accountRow.closest('li')).getByRole('button', { name: 'Delete' })
  );

  expect(await screen.findByText('No accounts found.')).toBeInTheDocument();
  expect(window.confirm).toHaveBeenCalledWith(
    'Delete the normal user account for family@example.com? It will be deactivated and retained.'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/auth/users/2', {
    method: 'DELETE',
  });
});
