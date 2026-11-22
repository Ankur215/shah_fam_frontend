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
      theme: 'rose',
    }));

  render(
    <AccountManagement
      authUser={{
        id: 1,
        role: 'super_admin',
        workspaceId: 1,
        currentWorkspaceId: 1,
        familyName: 'Old Family',
        theme: 'sage',
      }}
      onUserUpdated={onUserUpdated}
    />
  );
  await screen.findByText('root@example.com');
  expect(screen.getByRole('button', { name: 'User accounts' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('heading', { name: 'User accounts' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Active family workspace')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Family name' })).toHaveValue('Old Family');
  expect(screen.getByRole('radio', { name: 'Rose' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Slate' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Amber' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Indigo' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Family name'), {
    target: { value: 'Shah Family' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Rose' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save family appearance' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Family name and theme updated.'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/super-admin/workspaces/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ familyName: 'Shah Family', theme: 'rose' }),
  });
  expect(onUserUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ familyName: 'Shah Family', theme: 'rose' })
  );
});

test('filters accounts by email or role and shows the matching count', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([
      { id: 1, email: 'root@example.com', role: 'admin' },
      { id: 2, email: 'family@example.com', role: 'user' },
    ]))
    .mockResolvedValueOnce(apiResponse([]));

  render(<AccountManagement />);
  await screen.findByText('family@example.com');
  const search = screen.getByRole('searchbox', { name: 'Search user accounts' });
  expect(screen.getByText('2 accounts')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'FAMILY@' } });
  expect(screen.getByText('family@example.com')).toBeInTheDocument();
  expect(screen.queryByText('root@example.com')).not.toBeInTheDocument();
  expect(screen.getByText('1 account')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'admin' } });
  expect(screen.getByText('root@example.com')).toBeInTheDocument();
  expect(screen.queryByText('family@example.com')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText('No accounts match your search.')).toBeInTheDocument();
  expect(screen.getByText('0 accounts')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByText('2 accounts')).toBeInTheDocument();
});

test('allows appearance editing only in the primary family workspace', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([{ id: 1, email: 'root@example.com', role: 'super_admin' }]))
    .mockResolvedValueOnce(apiResponse([
      { id: 1, name: 'Primary Family', theme: 'sage' },
      { id: 2, name: 'Family copy', theme: 'ocean' },
    ]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse([
      { id: 1, name: 'Primary Family', theme: 'sage' },
      { id: 2, name: 'Family copy', theme: 'ocean' },
    ]))
    .mockResolvedValueOnce(apiResponse([]));

  const primaryUser = {
    id: 1,
    role: 'super_admin',
    workspaceId: 1,
    currentWorkspaceId: 1,
    familyName: 'Primary Family',
    theme: 'sage',
  };
  const { rerender } = render(<AccountManagement authUser={primaryUser} />);
  await screen.findByText('root@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByLabelText('Family name')).toBeEnabled();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

  rerender(<AccountManagement authUser={{
    ...primaryUser,
    currentWorkspaceId: 2,
    familyName: 'Family copy',
    theme: 'ocean',
  }} />);
  expect(screen.getByLabelText('Family name')).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Ocean' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save family appearance' })).toBeDisabled();
  expect(screen.getByText(/refresh the page to access your primary family workspace/i)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/super-admin\/workspaces\/\d+$/),
    expect.objectContaining({ method: 'PUT' })
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(6));
});

test('keeps the edited family name when saving fails', async () => {
  const onUserUpdated = jest.fn();
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([{ id: 1, email: 'root@example.com', role: 'super_admin' }]))
    .mockResolvedValueOnce(apiResponse([{ id: 1, name: 'Old Family', theme: 'sage' }]))
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(apiResponse({ error: 'Could not update family appearance.' }, 503));

  render(<AccountManagement authUser={{
    id: 1,
    role: 'super_admin',
    workspaceId: 1,
    currentWorkspaceId: 1,
    familyName: 'Old Family',
    theme: 'sage',
  }} onUserUpdated={onUserUpdated} />);
  await screen.findByText('root@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByLabelText('Family name'), { target: { value: 'New Family' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save family appearance' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update family appearance.');
  expect(screen.getByLabelText('Family name')).toHaveValue('New Family');
  expect(onUserUpdated).not.toHaveBeenCalled();
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

  fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
  expect(screen.getByLabelText('Notes & Reminders')).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'a-secure-family-password' },
  });
  fireEvent.click(screen.getByLabelText('Gift'));
  fireEvent.click(screen.getByLabelText('Charity'));
  fireEvent.click(screen.getByRole('button', { name: 'Create normal user account' }));

  const accountRow = await screen.findByText('family@example.com');
  const row = within(accountRow.closest('li'));
  expect(row.getByText('Normal user')).toBeInTheDocument();
  expect(
    row.getByText('Family members and family tree, Medical reports, Gift, Charity')
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
  fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
  expect(screen.queryByLabelText('Account type')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Admin user' })).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Create normal user account' })
  ).toBeInTheDocument();
  expect(screen.getByText(/become a super admin to manage a separate copy/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Become a super admin' })).toBeInTheDocument();
});

test('closing account creation clears the temporary password', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([{ id: 1, email: 'admin@example.com', role: 'admin' }]))
    .mockResolvedValueOnce(apiResponse([]));
  render(<AccountManagement />);
  await screen.findByText('admin@example.com');
  const openButton = screen.getByRole('button', { name: /create an account/i });
  fireEvent.click(openButton);
  fireEvent.change(screen.getByLabelText('Temporary password'), {
    target: { value: 'temporary-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close form' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(openButton);
  expect(screen.getByLabelText('Temporary password')).toHaveValue('');
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
      familyName: 'New admin family',
      accessPages: ['family', 'medical', 'gifts', 'charity'],
      familyMemberIds: [11],
    }, 201))
    .mockResolvedValueOnce(apiResponse([
      { id: 1, name: 'Root family' },
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
  fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
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
  expect(screen.getByText('Workspace: New admin family')).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
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
  fireEvent.click(within(editForm).getByLabelText('Gift'));
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
    within(updatedAccount.closest('li')).getByText('Medical reports, Gift')
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
