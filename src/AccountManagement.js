import { useEffect, useState } from 'react';
import './AccountManagement.css';
import { API_URL, apiFetch, readApiResponse } from './api';

const ACCESS_MODULES = {
  family: 'Family members and family tree',
  medical: 'Medical reports',
  gifts: 'Gift log',
  charity: 'Charity work',
};
const DEFAULT_ACCESS_PAGES = ['family', 'medical'];

function ModuleAccessFieldset({ accessPages, onChange }) {
  return (
    <fieldset className="account-page-permissions">
      <legend>Normal user page access</legend>
      {Object.entries(ACCESS_MODULES).map(([module, label]) => (
        <label key={module}>
          <input
            checked={accessPages.includes(module)}
            onChange={(event) => {
              const isSelected = event.target.checked;
              onChange((current) =>
                isSelected
                  ? [...current, module]
                  : current.filter((page) => page !== module)
              );
            }}
            type="checkbox"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function AccountManagement() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessPages, setAccessPages] = useState(DEFAULT_ACCESS_PAGES);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editAccessPages, setEditAccessPages] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);

  async function loadUsers() {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`);
      const data = await readApiResponse(response);
      if (!Array.isArray(data)) {
        throw new Error('The server returned an invalid account list.');
      }
      setUsers(data);
    } catch (loadError) {
      setError(loadError.message || 'Could not load user accounts.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, accessPages }),
      });
      const user = await readApiResponse(response);
      setUsers((currentUsers) =>
        [...currentUsers, user].sort((first, second) =>
          first.email.localeCompare(second.email)
        )
      );
      setEmail('');
      setPassword('');
      setAccessPages([...DEFAULT_ACCESS_PAGES]);
      setNotice(
        `Normal user account created for ${user.email} in your family workspace. Share the temporary password securely.`
      );
    } catch (createError) {
      setError(createError.message || 'Could not create the account.');
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditEmail(user.email);
    setEditPassword('');
    setEditAccessPages(user.accessPages || []);
    setError('');
    setNotice('');
  }

  function cancelEditing() {
    setEditingUserId(null);
    setEditEmail('');
    setEditPassword('');
    setEditAccessPages([]);
  }

  async function handleUpdate(event, user) {
    event.preventDefault();
    setIsUpdating(true);
    setError('');
    setNotice('');
    const updatedAccount = {
      email: editEmail,
      accessPages: editAccessPages,
    };
    if (editPassword) updatedAccount.password = editPassword;

    try {
      const response = await apiFetch(`${API_URL}/api/auth/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAccount),
      });
      const updatedUser = await readApiResponse(response);
      setUsers((currentUsers) =>
        currentUsers
          .map((currentUser) =>
            currentUser.id === updatedUser.id ? updatedUser : currentUser
          )
          .sort((first, second) => first.email.localeCompare(second.email))
      );
      setNotice(`Account updated for ${updatedUser.email}.`);
      cancelEditing();
    } catch (updateError) {
      setError(updateError.message || 'Could not update the account.');
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete the normal user account for ${user.email}?`)) {
      return;
    }
    setDeletingUserId(user.id);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users/${user.id}`, {
        method: 'DELETE',
      });
      await readApiResponse(response);
      setUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.id !== user.id)
      );
      if (editingUserId === user.id) cancelEditing();
      setNotice(`Account deleted for ${user.email}.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the account.');
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <section className="page-content account-page" aria-labelledby="accounts-heading">
      <header className="account-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1 id="accounts-heading">User accounts</h1>
        <p>Normal users can access selected pages in your family workspace. Each admin has a separate family workspace.</p>
        <p className="account-hint">
          Admin accounts are created independently. Sign out and choose Admin sign up from the sign-in page.
        </p>
      </header>

      <section className="account-card" aria-labelledby="create-account-heading">
        <h2 id="create-account-heading">Create an account</h2>
        <form className="account-form" onSubmit={handleSubmit}>
          <label htmlFor="new-user-email">Email address</label>
          <input
            autoComplete="email"
            id="new-user-email"
            maxLength={255}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <ModuleAccessFieldset
            accessPages={accessPages}
            onChange={setAccessPages}
          />
          <div className="account-hint">
            Users can view and edit the modules selected for them.
          </div>
          <label htmlFor="new-user-password">Temporary password</label>
          <input
            autoComplete="new-password"
            id="new-user-password"
            maxLength={128}
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <p className="account-hint">Use at least 12 characters, then share it securely.</p>
          {error && <p className="account-error" role="alert">{error}</p>}
          {notice && <p className="account-notice" role="status">{notice}</p>}
          <button className="account-submit" disabled={isSaving} type="submit">
            {isSaving ? 'Creating…' : 'Create normal user account'}
          </button>
        </form>
      </section>

      <section className="account-card" aria-labelledby="existing-accounts-heading">
        <h2 id="existing-accounts-heading">Existing accounts</h2>
        {isLoading ? (
          <p className="account-muted">Loading accounts…</p>
        ) : users.length ? (
          <ul className="account-list">
            {users.map((user) => (
              <li key={user.id}>
                {editingUserId === user.id ? (
                  <form
                    className="account-edit-form"
                    aria-label={`Edit ${user.email}`}
                    onSubmit={(event) => handleUpdate(event, user)}
                  >
                    <label htmlFor={`edit-user-email-${user.id}`}>Email address</label>
                    <input
                      autoComplete="email"
                      id={`edit-user-email-${user.id}`}
                      maxLength={255}
                      onChange={(event) => setEditEmail(event.target.value)}
                      required
                      type="email"
                      value={editEmail}
                    />
                    <ModuleAccessFieldset
                      accessPages={editAccessPages}
                      onChange={setEditAccessPages}
                    />
                    <label htmlFor={`edit-user-password-${user.id}`}>
                      New password (leave blank to keep current password)
                    </label>
                    <input
                      autoComplete="new-password"
                      id={`edit-user-password-${user.id}`}
                      maxLength={128}
                      minLength={12}
                      onChange={(event) => setEditPassword(event.target.value)}
                      type="password"
                      value={editPassword}
                    />
                    <div className="account-actions">
                      <button disabled={isUpdating} type="submit">
                        {isUpdating ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        disabled={isUpdating}
                        onClick={cancelEditing}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className={`account-role account-role-${user.role}`}>
                      {user.role === 'admin' ? 'Admin user' : 'Normal user'}
                    </span>
                    <span className="account-email">{user.email}</span>
                    {user.role === 'user' && (
                      <>
                        <small className="account-access">
                          {(user.accessPages || [])
                            .map((page) => ACCESS_MODULES[page] || page)
                            .join(', ') || 'No page access'}
                        </small>
                        <div className="account-actions">
                          <button
                            disabled={deletingUserId !== null}
                            onClick={() => startEditing(user)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            disabled={deletingUserId !== null}
                            onClick={() => handleDelete(user)}
                            type="button"
                          >
                            {deletingUserId === user.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="account-muted">No accounts found.</p>
        )}
      </section>
    </section>
  );
}

export default AccountManagement;
