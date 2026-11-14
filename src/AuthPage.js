import { useState } from 'react';
import './AuthPage.css';
import { API_URL, apiFetch, readApiResponse } from './api';

function AuthPage({ onAuthenticated, initialError = '' }) {
  const [resetToken, setResetToken] = useState(() => (
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('reset_token') || ''
  ));
  const [mode, setMode] = useState(resetToken ? 'reset-password' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const isAdminSignup = mode === 'admin-signup';
      const isForgotPassword = mode === 'forgot-password';
      const isResetPassword = mode === 'reset-password';
      if (isResetPassword && password !== confirmPassword) {
        throw new Error('The passwords do not match.');
      }
      const endpoint = isAdminSignup
        ? 'admin-signup'
        : isForgotPassword
          ? 'forgot-password'
          : isResetPassword
            ? 'reset-password'
            : 'login';
      const response = await apiFetch(
        `${API_URL}/api/auth/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isAdminSignup
              ? { email, password, signupCode }
              : isForgotPassword
                ? { email }
                : isResetPassword
                  ? { token: resetToken, password }
                  : { email, password }
          ),
        }
      );
      const data = await readApiResponse(response);
      if (isForgotPassword) {
        setNotice(data.message);
        return;
      }
      if (isResetPassword) {
        setPassword('');
        setConfirmPassword('');
        setResetToken('');
        window.history.replaceState({}, '', window.location.pathname);
        changeMode('login');
        setNotice(data.message);
        return;
      }
      if (!data.user || !['admin', 'user'].includes(data.user.role)) {
        throw new Error('The server returned an invalid account response.');
      }
      onAuthenticated(data.user);
    } catch (submitError) {
      setError(submitError.message || 'Could not sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
  }

  const isForgotPassword = mode === 'forgot-password';
  const isResetPassword = mode === 'reset-password';
  const hasPasswordField = !isForgotPassword;
  const hasEmailField = !isResetPassword;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <a className="auth-brand" href="/" aria-label="Shah Family">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-name">
            <strong>Shah Family</strong>
            <small>Our family space</small>
          </span>
        </a>

        <span className="eyebrow">
          {mode === 'login'
            ? 'WELCOME BACK'
            : mode === 'admin-signup'
              ? 'ADMINISTRATOR ACCESS'
              : 'ACCOUNT RECOVERY'}
        </span>
        <h1 id="auth-heading">
          {mode === 'login'
            ? 'Your family, together.'
            : mode === 'admin-signup'
              ? 'Create an admin account'
              : isForgotPassword
                ? 'Forgot your password?'
                : 'Choose a new password'}
        </h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to continue to your private family space.'
            : mode === 'admin-signup'
              ? 'Find ADMIN_SIGNUP_CODE in shah_fam_backend/.env and enter it below. Keep this code private.'
              : isForgotPassword
                ? 'Enter your email address and we will send a password reset link if an account exists.'
                : 'Your new password must be at least 12 characters.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {hasEmailField && (
            <>
              <label htmlFor="auth-email">Email address</label>
              <input
                autoComplete="email"
                autoFocus
                id="auth-email"
                maxLength={255}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </>
          )}

          {hasPasswordField && (
            <>
              <label htmlFor="auth-password">
                {isResetPassword ? 'New password' : 'Password'}
              </label>
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                id="auth-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </>
          )}

          {isResetPassword && (
            <>
              <label htmlFor="auth-confirm-password">Confirm new password</label>
              <input
                autoComplete="new-password"
                id="auth-confirm-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </>
          )}

          {mode === 'admin-signup' && (
            <>
              <label htmlFor="admin-signup-code">Admin invitation code</label>
              <input
                autoComplete="off"
                id="admin-signup-code"
                onChange={(event) => setSignupCode(event.target.value)}
                required
                type="password"
                value={signupCode}
              />
              <p className="auth-hint">
                On macOS, get the code from the backend folder with{' '}
                <code>grep ADMIN_SIGNUP_CODE .env</code>. Keep it private.
                Passwords must be at least 12 characters.
              </p>
            </>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'admin-signup'
                  ? 'Create admin account'
                  : isForgotPassword
                    ? 'Send reset link'
                    : 'Reset password'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              <button type="button" onClick={() => changeMode('forgot-password')}>
                Forgot password?
              </button>
              <br />
              Need to set up an administrator?{' '}
              <button type="button" onClick={() => changeMode('admin-signup')}>
                Admin sign up
              </button>
              <br />
            </>
          ) : isForgotPassword || isResetPassword ? (
            <>
              Remembered it?{' '}
              <button type="button" onClick={() => changeMode('login')}>
                Sign in
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => changeMode('login')}>
                Sign in
              </button>
            </>
          )}
        </div>
        <p className="auth-privacy">Private access for your family.</p>
      </section>
    </main>
  );
}

export default AuthPage;
