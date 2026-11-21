import { useCallback, useEffect, useState } from 'react';
import './AccountManagement.css';
import { API_URL, apiFetch, readApiResponse } from './api';
import FAMILY_THEMES from './familyThemes';
import FormDialog from './FormDialog';

const ACCESS_MODULES = {
  family: 'Family members and family tree',
  medical: 'Medical reports',
  gifts: 'Gift log',
  charity: 'Charity work',
  notes: 'Notes & Reminders',
};
const DEFAULT_ACCESS_PAGES = ['family', 'medical'];

function ModuleAccessFieldset({ accessPages, onChange }) {
  return (
    <fieldset className="account-page-permissions">
      <legend>Module access</legend>
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

function FamilyMemberAccessFieldset({ familyMembers, selectedIds, onChange }) {
  return (
    <fieldset className="account-page-permissions">
      <legend>Family member access</legend>
      {familyMembers.length ? (
        familyMembers.map((member) => {
          const label = `${member.firstName} ${member.lastName}`.trim();
          return (
            <label key={member.id}>
              <input
                checked={selectedIds.includes(member.id)}
                onChange={(event) => {
                  const isSelected = event.target.checked;
                  onChange((current) =>
                    isSelected
                      ? [...current, member.id]
                      : current.filter((id) => id !== member.id)
                  );
                }}
                type="checkbox"
              />
              {label}
              {member.workspaceName ? ` (${member.workspaceName})` : ''}
            </label>
          );
        })
      ) : (
        <p className="account-muted">No family members are available to assign.</p>
      )}
    </fieldset>
  );
}

function AccountManagement({
  authUser = { role: 'admin' },
  onUserUpdated = () => {},
}) {
  const isSuperAdmin = authUser.role === 'super_admin';
  const isPrimaryWorkspace = Boolean(authUser.workspaceId)
    && Number(authUser.workspaceId) === Number(authUser.currentWorkspaceId);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountRole, setAccountRole] = useState('user');
  const [accountSection, setAccountSection] = useState('accounts');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(authUser.currentWorkspaceId || '');
  const [familyName, setFamilyName] = useState(authUser.familyName || '');
  const [familyTheme, setFamilyTheme] = useState(authUser.theme || 'sage');
  const [familyMembers, setFamilyMembers] = useState([]);
  const [familyMemberIds, setFamilyMemberIds] = useState([]);
  const [accessPages, setAccessPages] = useState(DEFAULT_ACCESS_PAGES);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editAccessPages, setEditAccessPages] = useState([]);
  const [editFamilyMemberIds, setEditFamilyMemberIds] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [appearanceError, setAppearanceError] = useState('');
  const [appearanceNotice, setAppearanceNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`);
      const data = await readApiResponse(response);
      if (!Array.isArray(data)) {
        throw new Error('The server returned an invalid account list.');
      }
      setUsers(data);
      if (isSuperAdmin) {
        const workspaceResponse = await apiFetch(`${API_URL}/api/super-admin/workspaces`);
        const workspaceData = await readApiResponse(workspaceResponse);
        setWorkspaces(workspaceData);
      }
      const familyMembersResponse = await apiFetch(`${API_URL}/api/auth/family-members`);
      const familyMemberData = await readApiResponse(familyMembersResponse);
      if (!Array.isArray(familyMemberData)) {
        throw new Error('The server returned an invalid family member list.');
      }
      setFamilyMembers(familyMemberData);
      setFamilyMemberIds(
        familyMemberData
          .filter((member) =>
            !isSuperAdmin
            || Number(member.workspaceId) === Number(authUser.currentWorkspaceId)
          )
          .map((member) => member.id)
      );
    } catch (loadError) {
      setError(loadError.message || 'Could not load user accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [authUser.currentWorkspaceId, isSuperAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (isSuperAdmin) {
      setWorkspaceId(authUser.currentWorkspaceId || '');
      setFamilyName(authUser.familyName || '');
      setFamilyTheme(authUser.theme || 'sage');
    }
  }, [
    authUser.currentWorkspaceId,
    authUser.familyName,
    authUser.theme,
    isSuperAdmin,
  ]);

  useEffect(() => {
    setAppearanceError('');
    setAppearanceNotice('');
  }, [authUser.currentWorkspaceId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role: accountRole,
          accessPages,
          familyMemberIds,
        }),
      });
      const user = await readApiResponse(response);
      setUsers((currentUsers) =>
        [...currentUsers, user].sort((first, second) =>
          first.email.localeCompare(second.email)
        )
      );
      setEmail('');
      setPassword('');
      setAccountRole('user');
      setAccessPages([...DEFAULT_ACCESS_PAGES]);
      setFamilyMemberIds(
        familyMembers
          .filter((member) =>
            !isSuperAdmin || Number(member.workspaceId) === Number(workspaceId)
          )
          .map((member) => member.id)
      );
      if (user.role === 'admin') {
        const response = await apiFetch(`${API_URL}/api/super-admin/workspaces`);
        setWorkspaces(await readApiResponse(response));
        window.dispatchEvent(new Event('family-workspaces-updated'));
      }
      setNotice(
        `${user.role === 'admin' ? 'Admin' : 'Normal user'} account created for ${user.email}. Share the temporary password securely.`
      );
      setIsCreateOpen(false);
    } catch (createError) {
      setError(createError.message || 'Could not create the account.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAppearanceSave(event) {
    event.preventDefault();
    setIsSavingAppearance(true);
    setAppearanceError('');
    setAppearanceNotice('');
    try {
      const response = await apiFetch(
        `${API_URL}/api/super-admin/workspaces/${authUser.workspaceId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ familyName, theme: familyTheme }),
        }
      );
      const workspace = await readApiResponse(response);
      setFamilyName(workspace.familyName);
      setFamilyTheme(workspace.theme);
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspace.id
            ? { ...item, name: workspace.familyName, theme: workspace.theme }
            : item
        )
      );
      onUserUpdated({
        ...authUser,
        familyName: workspace.familyName,
        theme: workspace.theme,
      });
      setAppearanceNotice('Family name and theme updated.');
    } catch (saveError) {
      setAppearanceError(saveError.message || 'Could not update family appearance.');
    } finally {
      setIsSavingAppearance(false);
    }
  }

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditEmail(user.email);
    setEditPassword('');
    setEditAccessPages(user.accessPages || []);
    setEditFamilyMemberIds(user.familyMemberIds || []);
    setError('');
    setNotice('');
  }

  function closeCreateForm() {
    setIsCreateOpen(false);
    setEmail('');
    setPassword('');
    setAccountRole('user');
    setAccessPages([...DEFAULT_ACCESS_PAGES]);
    setFamilyMemberIds(
      familyMembers
        .filter((member) =>
          !isSuperAdmin || Number(member.workspaceId) === Number(workspaceId)
        )
        .map((member) => member.id)
    );
    setError('');
  }

  function cancelEditing() {
    setEditingUserId(null);
    setEditEmail('');
    setEditPassword('');
    setEditAccessPages([]);
    setEditFamilyMemberIds([]);
  }

  async function handleUpdate(event, user) {
    event.preventDefault();
    setIsUpdating(true);
    setError('');
    setNotice('');
    const updatedAccount = {
      email: editEmail,
      accessPages: editAccessPages,
      familyMemberIds: editFamilyMemberIds,
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
    const accountType = user.role === 'user'
      ? 'normal user'
      : user.role === 'super_admin'
        ? 'super admin'
        : 'admin';
    if (
      !window.confirm(
        `Delete the ${accountType} account for ${user.email}? It will be deactivated and retained.`
      )
    ) {
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
      setNotice(`Account deactivated for ${user.email}; its record was retained.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the account.');
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSelfPromotion() {
    if (!window.confirm(
      'Become a super admin? Your family workspace will be copied into a separate tree, and the original workspace will remain unchanged.'
    )) return;
    setIsPromoting(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(
        `${API_URL}/api/super-admin/users/${authUser.id}/promote`,
        { method: 'POST' }
      );
      const result = await readApiResponse(response);
      onUserUpdated(result.user);
      setNotice('You are now a super admin. Your family tree is an independent copy.');
    } catch (promoteError) {
      setError(promoteError.message || 'Could not promote your account.');
    } finally {
      setIsPromoting(false);
    }
  }

  return (
    <section className="page-content account-page" aria-labelledby="accounts-heading">
      <header className="account-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1 id="accounts-heading">
          {isSuperAdmin && accountSection === 'settings' ? 'Settings' : 'User accounts'}
        </h1>
        <p>
          {isSuperAdmin && accountSection === 'settings'
            ? 'Changes apply only to your primary family workspace.'
            : 'Assign module and family-member access to each account. Only super admins can change family information.'}
        </p>
        {accountSection === 'accounts' && (
          <p className="account-hint">
            {isSuperAdmin
              ? 'Create admins and users within your family tenant. Promoting an admin creates an independent copy of their family data.'
              : 'You can create and manage users in your family workspace. Become a super admin to manage a separate copy of your family tree.'}
          </p>
        )}
        {!isSuperAdmin && (
          <button
            className="account-submit"
            disabled={isPromoting}
            onClick={handleSelfPromotion}
            type="button"
          >
            {isPromoting ? 'Creating independent family copy…' : 'Become a super admin'}
          </button>
        )}
      </header>

      {isSuperAdmin && (
        <nav className="account-section-nav" aria-label="Account management">
          <button
            aria-pressed={accountSection === 'accounts'}
            className={accountSection === 'accounts' ? 'account-section-active' : ''}
            onClick={() => setAccountSection('accounts')}
            type="button"
          >
            User accounts
          </button>
          <button
            aria-pressed={accountSection === 'settings'}
            className={accountSection === 'settings' ? 'account-section-active' : ''}
            onClick={() => setAccountSection('settings')}
            type="button"
          >
            Settings
          </button>
        </nav>
      )}

      {error && !isCreateOpen && editingUserId === null && (
        <p className="account-error" role="alert">{error}</p>
      )}
      {notice && <p className="account-notice" role="status">{notice}</p>}

      {isSuperAdmin && accountSection === 'settings' && (
          <section
            className="account-card"
            aria-labelledby="family-appearance-heading"
          >
            <h2 id="family-appearance-heading">Family appearance</h2>
            {!isPrimaryWorkspace && (
              <p className="account-muted">Refresh the page to access your primary family workspace.</p>
            )}
            <form className="account-form" onSubmit={handleAppearanceSave}>
              <label htmlFor="family-display-name">Family name</label>
              <input
                disabled={!isPrimaryWorkspace || isSavingAppearance}
                id="family-display-name"
                maxLength={100}
                onChange={(event) => {
                  setFamilyName(event.target.value);
                  setAppearanceNotice('');
                }}
                required
                value={familyName}
              />
              <fieldset
                className="account-theme-picker"
                disabled={!isPrimaryWorkspace || isSavingAppearance}
              >
                <legend>Color theme</legend>
                <div className="account-theme-options">
                  {FAMILY_THEMES.map((theme) => (
                    <label
                      key={theme.id}
                      className="account-theme-option"
                      title={theme.label}
                    >
                      <input
                        type="radio"
                        name="family-display-theme"
                        value={theme.id}
                        checked={familyTheme === theme.id}
                        onChange={(event) => {
                          setFamilyTheme(event.target.value);
                          setAppearanceNotice('');
                        }}
                        aria-label={theme.label}
                      />
                      <span
                        className="account-theme-swatch"
                        style={{ '--theme-swatch': theme.color }}
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              {appearanceError && (
                <p className="account-error" role="alert">{appearanceError}</p>
              )}
              {appearanceNotice && (
                <p className="account-notice" role="status">{appearanceNotice}</p>
              )}
              <button
                className="account-submit"
                disabled={!isPrimaryWorkspace || isSavingAppearance}
                type="submit"
              >
                {isSavingAppearance ? 'Saving…' : 'Save family appearance'}
              </button>
            </form>
          </section>
      )}

      {(!isSuperAdmin || accountSection === 'accounts') && (
        <>
        <section className="account-card" aria-labelledby="create-account-heading">
        <h2 id="create-account-heading">Create an account</h2>
        <button
          className="account-submit"
          type="button"
          disabled={isLoading}
          onClick={() => {
            setError('');
            setNotice('');
            setIsCreateOpen(true);
          }}
        >
          + Create an account
        </button>
        {isCreateOpen && (
        <FormDialog
          title="Create an account"
          onClose={closeCreateForm}
          isBusy={isSaving}
        >
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
          {isSuperAdmin && (
            <>
              <label htmlFor="new-account-role">Account type</label>
              <select
                id="new-account-role"
                onChange={(event) => setAccountRole(event.target.value)}
                value={accountRole}
              >
                <option value="user">User</option>
                <option value="admin">Admin (new family workspace)</option>
              </select>
            </>
          )}
          <ModuleAccessFieldset
            accessPages={accessPages}
            onChange={setAccessPages}
          />
          <FamilyMemberAccessFieldset
            familyMembers={
              isSuperAdmin
                ? familyMembers.filter(
                  (member) => Number(member.workspaceId) === Number(workspaceId)
                )
                : familyMembers
            }
            onChange={setFamilyMemberIds}
            selectedIds={familyMemberIds}
          />
          <div className="account-hint">
            Accounts can view only selected family members. Module access does not grant family-editing permission.
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
          <button
            className="account-submit"
            disabled={isSaving || isLoading}
            type="submit"
          >
            {isSaving
              ? 'Creating…'
              : accountRole === 'admin'
                ? 'Create admin account'
                : isSuperAdmin
                  ? 'Create user account'
                  : 'Create normal user account'}
          </button>
        </form>
        </FormDialog>
        )}
      </section>

      <section className="account-card" aria-labelledby="existing-accounts-heading">
        <h2 id="existing-accounts-heading">Existing accounts</h2>
        {isLoading ? (
          <p className="account-muted">Loading accounts…</p>
        ) : users.length ? (
          <ul className="account-list">
            {users.map((user) => (
              <li key={user.id}>
                {editingUserId === user.id && (
                  <FormDialog
                    title={`Edit ${user.email}`}
                    onClose={() => {
                      cancelEditing();
                      setError('');
                    }}
                    isBusy={isUpdating}
                  >
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
                    <FamilyMemberAccessFieldset
                      familyMembers={familyMembers}
                      onChange={setEditFamilyMemberIds}
                      selectedIds={editFamilyMemberIds}
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
                    {error && <p className="account-error" role="alert">{error}</p>}
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
                  </FormDialog>
                )}
                  <>
                    <span className={`account-role account-role-${user.role}`}>
                      {user.role === 'super_admin'
                        ? 'Super admin'
                        : user.role === 'admin'
                          ? 'Admin user'
                          : 'Normal user'}
                    </span>
                    <span className="account-email">{user.email}</span>
                    {isSuperAdmin && user.role !== 'super_admin' && (
                      <small className="account-access">
                        Workspace: {user.familyName || workspaces.find((item) => item.id === user.workspaceId)?.name || 'Unknown'}
                      </small>
                    )}
                    {(user.role === 'user' || user.role === 'admin') && (
                      <>
                        <small className="account-access">
                          {(user.accessPages || [])
                            .map((page) => ACCESS_MODULES[page] || page)
                            .join(', ') || 'No page access'}
                        </small>
                        <small className="account-access">
                          Family members: {familyMembers
                            .filter((member) => (user.familyMemberIds || []).includes(member.id))
                            .map((member) => `${member.firstName} ${member.lastName}`.trim())
                            .join(', ') || 'None'}
                        </small>
                        <div className="account-actions">
                          {(isSuperAdmin || user.role === 'user') && user.id !== authUser.id && (
                            <>
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
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </>
              </li>
            ))}
          </ul>
        ) : (
          <p className="account-muted">No accounts found.</p>
        )}
        </section>
        </>
      )}
    </section>
  );
}

export default AccountManagement;
