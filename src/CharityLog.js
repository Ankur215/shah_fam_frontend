import { useEffect, useMemo, useState } from 'react';
import './CharityLog.css';
import { apiFetch } from './api';
import FormDialog from './FormDialog';

const CHARITY_ENDPOINT = `${process.env.REACT_APP_API_URL || ''}/api/charity-records`;
const DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function getLocalDateString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function formatDate(date) {
  return DATE_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

function sortRecords(records) {
  return [...records].sort(
    (first, second) => {
      const firstOrder = Number(first.sortOrder);
      const secondOrder = Number(second.sortOrder);
      const normalizedFirstOrder = Number.isFinite(firstOrder)
        ? firstOrder
        : Number.MAX_SAFE_INTEGER;
      const normalizedSecondOrder = Number.isFinite(secondOrder)
        ? secondOrder
        : Number.MAX_SAFE_INTEGER;
      return (
        normalizedFirstOrder - normalizedSecondOrder ||
        second.datePerformed.localeCompare(first.datePerformed) ||
        second.id - first.id
      );
    }
  );
}

function summarizeAmounts(records) {
  const totalsByCurrency = new Map();
  records.forEach((record) => {
    if (record.amount === '' || record.amount === null || record.amount === undefined) {
      return;
    }
    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount < 0) return;
    const currency = String(record.currency || '').trim().toUpperCase();
    const cents = Math.round(amount * 100);
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + cents);
  });

  const totals = [...totalsByCurrency.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([currency, cents]) =>
        `${(cents / 100).toFixed(2)}${currency ? ` ${currency}` : ''}`
    );
  return totals.length ? totals.join(' · ') : 'No amounts recorded';
}

async function readApiResponse(response) {
  const body = await response.text();
  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `The server returned HTTP ${response.status}.`
    );
  }
  if (data === null) {
    throw new Error('The API returned an empty or invalid JSON response.');
  }
  return data;
}

function CharityRecordEntry({
  record,
  familyMembers,
  index,
  recordCount,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  canReorder,
  isBusy,
}) {
  return (
    <article className="charity-record">
      <header className="charity-record-top">
        <div>
          <time dateTime={record.datePerformed}>{formatDate(record.datePerformed)}</time>
          <span className="charity-record-type">{record.workType}</span>
        </div>
        <div className="charity-record-actions">
          <button
            className="charity-move-button"
            type="button"
            disabled={isBusy || !canReorder || index === 0}
            aria-label={`Move ${record.activity} up`}
            title={canReorder ? 'Move record up' : 'Clear search to reorder records'}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            className="charity-move-button"
            type="button"
            disabled={isBusy || !canReorder || index === recordCount - 1}
            aria-label={`Move ${record.activity} down`}
            title={canReorder ? 'Move record down' : 'Clear search to reorder records'}
            onClick={onMoveDown}
          >
            ↓
          </button>
          <button
            className="charity-edit-button"
            type="button"
            disabled={isBusy}
            aria-label={`Edit ${record.activity} at ${record.organization}`}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="charity-delete-button"
            type="button"
            disabled={isBusy}
            aria-label={`Delete ${record.activity} at ${record.organization}`}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </header>
      <h3 className="charity-record-organization">{record.organization}</h3>
      <p className="charity-record-activity">
        <strong>Activity:</strong> {record.activity}
      </p>
      {(record.familyMemberIds || []).length > 0 && (
        <p className="charity-record-member">
          <strong>Family members:</strong>{' '}
          {record.familyMemberIds.map((id) => {
            const member = familyMembers.find((item) => item.id === id);
            return member
              ? `${member.firstName} ${member.lastName || ''}`.trim()
              : 'Linked family member';
          }).join(', ')}
        </p>
      )}
      {record.notes && (
        <p className="charity-record-notes">
          <strong>Notes:</strong> {record.notes}
        </p>
      )}
      {(record.amount || record.volunteerHours) && (
        <div className="charity-record-metrics">
          {record.amount && (
            <span>
              <strong>Amount:</strong>{' '}
              {record.amount}
              {record.currency ? ` ${record.currency}` : ''}
            </span>
          )}
          {record.volunteerHours && (
            <span>
              <strong>Volunteer hours:</strong>{' '}
              {record.volunteerHours}{' '}
              {Number(record.volunteerHours) === 1 ? 'hour' : 'hours'}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function CharityLog({ familyMembers = [], loadFamilyMembers = false }) {
  const [records, setRecords] = useState([]);
  const [assignedFamilyMembers, setAssignedFamilyMembers] = useState([]);
  const [familyMemberError, setFamilyMemberError] = useState('');
  const [editingRecord, setEditingRecord] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedFamilyMemberIds, setSelectedFamilyMemberIds] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState(null);
  const [error, setError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const charityFamilyMembers = loadFamilyMembers ? assignedFamilyMembers : familyMembers;

  function closeCharityForm() {
    setIsFormOpen(false);
    setEditingRecord(null);
    setSelectedFamilyMemberIds([]);
    if (!isLoadError) setError('');
  }

  useEffect(() => {
    if (!loadFamilyMembers) return undefined;
    let isCurrent = true;

    async function loadAssignedFamilyMembers() {
      setFamilyMemberError('');
      try {
        const response = await apiFetch(`${CHARITY_ENDPOINT}/family-members`);
        const data = await readApiResponse(response);
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid family member list.');
        }
        if (isCurrent) setAssignedFamilyMembers(data);
      } catch (loadError) {
        if (isCurrent) {
          setFamilyMemberError(
            `Could not load family members for charity records. ${loadError.message || 'Please try again.'}`
          );
        }
      }
    }

    loadAssignedFamilyMembers();
    return () => {
      isCurrent = false;
    };
  }, [loadFamilyMembers]);

  useEffect(() => {
    let isCurrent = true;

    async function loadRecords() {
      setIsLoading(true);
      setError('');
      setIsLoadError(false);
      try {
        const response = await apiFetch(CHARITY_ENDPOINT);
        const data = await readApiResponse(response);
        if (!Array.isArray(data)) {
          throw new Error('The server returned an unexpected charity records response.');
        }
        if (isCurrent) setRecords(sortRecords(data));
      } catch (loadError) {
        console.error('Could not load charity work records from the API.', loadError);
        if (isCurrent) {
          setError(
            `Could not load charity work records. ${loadError.message || 'Check that the API is running.'}`
          );
          setIsLoadError(true);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadRecords();
    return () => {
      isCurrent = false;
    };
  }, [loadAttempt]);

  async function saveRecord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const record = {
      organization: String(formData.get('organization') || '').trim(),
      workType: formData.get('workType'),
      activity: String(formData.get('activity') || '').trim(),
      datePerformed: formData.get('datePerformed'),
      amount: formData.get('amount') || '',
      currency: String(formData.get('currency') || '').trim().toUpperCase(),
      volunteerHours: formData.get('volunteerHours') || '',
      notes: String(formData.get('notes') || '').trim(),
    };
    if (
      selectedFamilyMemberIds.length !== (editingRecord?.familyMemberIds || []).length ||
      selectedFamilyMemberIds.some((id) => !(editingRecord?.familyMemberIds || []).includes(id))
    ) {
      record.familyMemberIds = selectedFamilyMemberIds;
    }

    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        editingRecord
          ? `${CHARITY_ENDPOINT}/${editingRecord.id}`
          : CHARITY_ENDPOINT,
        {
          method: editingRecord ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        }
      );
      const savedRecord = await readApiResponse(response);
      setRecords((currentRecords) => {
        if (editingRecord) {
          return sortRecords(
            currentRecords.map((currentRecord) =>
              currentRecord.id === savedRecord.id ? savedRecord : currentRecord
            )
          );
        }
        return [savedRecord, ...currentRecords].map((record, sortOrder) => ({
          ...record,
          sortOrder,
        }));
      });
      if (!editingRecord) form.reset();
      setEditingRecord(null);
      setSelectedFamilyMemberIds([]);
      setIsFormOpen(false);
    } catch (saveError) {
      console.error('Could not save charity work through the API.', saveError);
      setError(
        `Could not ${editingRecord ? 'update' : 'save'} charity work. ${saveError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRecord(record) {
    if (
      !window.confirm(
        `Delete “${record.activity}” for ${record.organization}? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingRecordId(record.id);
    setError('');
    try {
      const response = await apiFetch(`${CHARITY_ENDPOINT}/${record.id}`, {
        method: 'DELETE',
      });
      await readApiResponse(response);
      setRecords((currentRecords) =>
        currentRecords.filter((currentRecord) => currentRecord.id !== record.id)
      );
      if (editingRecord?.id === record.id) setEditingRecord(null);
    } catch (deleteError) {
      console.error('Could not delete charity work through the API.', deleteError);
      setError(
        `Could not delete charity work. ${deleteError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setDeletingRecordId(null);
    }
  }

  async function moveRecord(index, offset) {
    const targetIndex = index + offset;
    if (
      isReordering ||
      search.trim() ||
      targetIndex < 0 ||
      targetIndex >= records.length
    ) {
      return;
    }

    const previousRecords = records;
    const reorderedRecords = [...records];
    const [movedRecord] = reorderedRecords.splice(index, 1);
    reorderedRecords.splice(targetIndex, 0, movedRecord);
    setRecords(reorderedRecords);
    setIsReordering(true);
    setError('');

    try {
      const response = await apiFetch(`${CHARITY_ENDPOINT}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: reorderedRecords.map((record) => record.id) }),
      });
      const savedRecords = await readApiResponse(response);
      if (!Array.isArray(savedRecords)) {
        throw new Error('The server returned an unexpected charity record order.');
      }
      setRecords(sortRecords(savedRecords));
    } catch (reorderError) {
      console.error('Could not reorder charity work records through the API.', reorderError);
      setRecords(previousRecords);
      setError(
        `Could not reorder charity records. ${reorderError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsReordering(false);
    }
  }

  const totalVolunteerHours = useMemo(
    () =>
      records.reduce((total, record) => {
        const hours = Number(record.volunteerHours);
        return Number.isFinite(hours) && hours > 0 ? total + hours : total;
      }, 0),
    [records]
  );
  const visibleRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return records.filter((record) =>
      [record.organization, record.activity, record.workType]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    );
  }, [records, search]);

  return (
    <section className="page-content charity-page" aria-labelledby="charity-page-heading">
      <header className="charity-page-heading">
        <div>
          <span className="eyebrow">KINDNESS, REMEMBERED</span>
          <h1 id="charity-page-heading">Charity work</h1>
          <p>Keep a record of the ways your family gives back.</p>
        </div>
        <div className="charity-record-count" aria-label={`${records.length} records`}>
          <span aria-hidden="true">✦</span>
          <div>
            <strong>{records.length}</strong>
            <small>{records.length === 1 ? 'record saved' : 'records saved'}</small>
          </div>
        </div>
      </header>

      <div className="charity-summary">
        <div>
          <span className="summary-label">FINANCIAL SUPPORT</span>
          <strong>{summarizeAmounts(records)}</strong>
        </div>
        <div>
          <span className="summary-label">VOLUNTEER HOURS</span>
          <strong>{totalVolunteerHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
      </div>

      <div className="charity-page-actions">
        <button
          className="primary-button"
          type="button"
          disabled={isSaving || isReordering || deletingRecordId !== null}
          onClick={() => {
            closeCharityForm();
            setIsFormOpen(true);
          }}
        >
          + Record charity work
        </button>
      </div>
      {error && !isLoadError && !isFormOpen && (
        <div className="error-message" role="alert">{error}</div>
      )}
      <div className="charity-layout">
        {isFormOpen && (
        <FormDialog
          title={editingRecord ? 'Edit charity record' : 'Record charity work'}
          description="Capture donations, goods, volunteering, and other contributions."
          onClose={closeCharityForm}
          isBusy={isSaving}
        >
        <form
          className="charity-form-card"
          key={editingRecord?.id || 'new-charity-record'}
          onSubmit={saveRecord}
        >
          {familyMemberError && (
            <p className="error-message" role="alert">{familyMemberError}</p>
          )}
          <div className="charity-form-grid">
            <h3 className="charity-form-section-heading charity-form-full">Contribution details</h3>
            <label className="charity-form-full">
              Organization / charity <span className="required-mark">*</span>
              <input
                name="organization"
                required
                maxLength="150"
                placeholder="Who did your family support?"
                defaultValue={editingRecord?.organization || ''}
              />
            </label>
            <label className="charity-form-full">
              Activity / work done <span className="required-mark">*</span>
              <input
                name="activity"
                required
                maxLength="200"
                placeholder="Describe the charity work"
                defaultValue={editingRecord?.activity || ''}
              />
            </label>
            <label>
              Work type <span className="required-mark">*</span>
              <select name="workType" required defaultValue={editingRecord?.workType || 'Donation'}>
                <option>Donation</option>
                <option>Goods donation</option>
                <option>Volunteering</option>
                <option>Fundraising</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Date <span className="required-mark">*</span>
              <input
                name="datePerformed"
                type="date"
                required
                max={getLocalDateString()}
                defaultValue={editingRecord?.datePerformed || getLocalDateString()}
              />
            </label>
            <h3 className="charity-form-section-heading charity-form-full">
              Additional details <span>Optional</span>
            </h3>
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                placeholder="Optional"
                defaultValue={editingRecord?.amount || ''}
              />
            </label>
            <label>
              Currency
              <input
                name="currency"
                maxLength="3"
                placeholder="USD / INR"
                aria-label="Currency code"
                defaultValue={editingRecord?.currency || ''}
              />
            </label>
            <label>
              Volunteer hours
              <input
                name="volunteerHours"
                type="number"
                min="0"
                max="99999.99"
                step="0.25"
                placeholder="Optional"
                defaultValue={editingRecord?.volunteerHours || ''}
              />
            </label>
            <label className="charity-form-full">
              Notes
              <textarea
                name="notes"
                rows="3"
                maxLength="2000"
                placeholder="Add any details or a memory…"
                defaultValue={editingRecord?.notes || ''}
              />
            </label>
            <fieldset className="charity-member-link charity-form-full">
              <legend>Family members for this charity record</legend>
              <p id="charity-family-member-help">
                Select family members to share this record with people who have
                Charity work access and access to any selected member. When no
                members are linked, people with Charity work access in this workspace
                can see it.
              </p>
              {editingRecord?.hasOtherFamilyMembers && (
                <p>Additional family members you cannot access will remain selected.</p>
              )}
              <div className="charity-member-options" aria-describedby="charity-family-member-help">
                {charityFamilyMembers.length ? charityFamilyMembers.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={selectedFamilyMemberIds.includes(member.id)}
                      onChange={(event) => setSelectedFamilyMemberIds((current) =>
                        event.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id)
                      )}
                    />
                    {member.firstName} {member.lastName || ''}
                  </label>
                )) : <p>No family members available to select.</p>}
              </div>
            </fieldset>
          </div>

          {error && !isLoadError && (
            <div className="error-message" role="alert">{error}</div>
          )}

          <div className="charity-form-actions">
            <span>Fields marked * are required.</span>
            <div>
                <button
                  className="cancel-button"
                  type="button"
                  disabled={isSaving || isReordering || deletingRecordId !== null}
                  onClick={closeCharityForm}
                >
                  Cancel
                </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving || isReordering || deletingRecordId !== null}
              >
                {isSaving
                  ? 'Saving…'
                  : editingRecord
                    ? 'Save changes'
                    : 'Save record'}
              </button>
            </div>
          </div>
        </form>
        </FormDialog>
        )}

        <section className="charity-history-card" aria-labelledby="charity-history-heading">
          <div className="charity-history-heading">
            <div>
              <h2 id="charity-history-heading">All charity records</h2>
              <p>Every saved entry, newest first.</p>
            </div>
            <span>{records.length}</span>
          </div>

          {error && isLoadError && (
            <div className="error-message" role="alert">
              <span>{error}</span>
              {!isLoading && (
                <button
                  className="retry-button"
                  type="button"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="charity-empty-state" role="status">Loading charity records…</div>
          ) : isLoadError ? (
            <div className="charity-empty-state">Charity records are unavailable right now.</div>
          ) : records.length === 0 ? (
            <div className="charity-empty-state">
              <h3>No charity work recorded yet</h3>
              <p>Your family’s contributions will be saved here.</p>
            </div>
          ) : (
            <>
              <label className="charity-search">
                <span aria-hidden="true">⌕</span>
                <span className="visually-hidden">Search charity records</span>
                <input
                  type="search"
                  placeholder="Search organization or activity…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="charity-record-list">
                {visibleRecords.length > 0 ? (
                  visibleRecords.map((record, index) => (
                    <CharityRecordEntry
                      key={record.id}
                      record={record}
                      familyMembers={charityFamilyMembers}
                      index={index}
                      recordCount={visibleRecords.length}
                      canReorder={!search.trim()}
                      isBusy={isSaving || isReordering || deletingRecordId !== null}
                      onMoveUp={() => moveRecord(index, -1)}
                      onMoveDown={() => moveRecord(index, 1)}
                      onEdit={() => {
                        setEditingRecord(record);
                        setSelectedFamilyMemberIds(record.familyMemberIds || []);
                        setError('');
                        setIsFormOpen(true);
                      }}
                      onDelete={() => deleteRecord(record)}
                    />
                  ))
                ) : (
                  <div className="charity-empty-state">
                    <h3>No matching records</h3>
                    <p>Try a different organization or activity.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

export default CharityLog;
