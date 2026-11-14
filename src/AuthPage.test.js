import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthPage from './AuthPage';

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

test('signs in with an email and password', async () => {
  const user = { id: 2, email: 'family@example.com', role: 'user' };
  const onAuthenticated = jest.fn();
  global.fetch = jest.fn().mockResolvedValue(apiResponse({ user }));

  render(<AuthPage onAuthenticated={onAuthenticated} />);
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a-secure-family-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'family@example.com',
      password: 'a-secure-family-password',
    }),
  });
});

test('creates an administrator using an invitation code', async () => {
  const user = { id: 1, email: 'admin@example.com', role: 'admin' };
  const onAuthenticated = jest.fn();
  global.fetch = jest.fn().mockResolvedValue(apiResponse({ user }, 201));

  render(<AuthPage onAuthenticated={onAuthenticated} />);
  fireEvent.click(screen.getByRole('button', { name: 'Admin sign up' }));
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a-secure-admin-password' },
  });
  fireEvent.change(screen.getByLabelText('Admin invitation code'), {
    target: { value: 'private-invitation-code' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));

  await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/admin-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'a-secure-admin-password',
      signupCode: 'private-invitation-code',
    }),
  });
});

test('shows invalid credentials errors', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse({ error: 'Invalid email or password.' }, 401)
  );

  render(<AuthPage onAuthenticated={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'incorrect-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Invalid email or password.'
  );
});

test('requests a password reset without revealing account details', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse({
      message: 'If an account exists for that email, a password reset link will be sent.',
    }, 202)
  );

  render(<AuthPage onAuthenticated={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'If an account exists'
  );
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'family@example.com' }),
  });
});

test('resets the password using the token from the email link', async () => {
  window.history.pushState({}, '', '/?reset_token=single-use-token');
  global.fetch = jest.fn().mockResolvedValue(
    apiResponse({ message: 'Your password has been reset. You can now sign in.' })
  );

  render(<AuthPage onAuthenticated={jest.fn()} />);
  expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'a-new-secure-password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'a-new-secure-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Your password has been reset'
  );
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'single-use-token',
      password: 'a-new-secure-password',
    }),
  });
  expect(window.location.search).toBe('');
});
