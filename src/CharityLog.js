import { useEffect, useMemo, useState } from 'react';
import './CharityLog.css';

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
    (first, second) =>
      second.datePerformed.localeCompare(first.datePerformed) ||
      second.id - first.id
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

function CharityRecordEntry({ record, onEdit, onDelete, isBusy }) {
  return (
    <article className="charity-record">
      <header className="charity-record-top">
        <div>
          <time dateTime={record.datePerformed}>{formatDate(record.datePerformed)}</time>
          <span className="charity-record-type">{record.workType}</span>
        </div>
        <div className="charity-record-actions">
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
      <h3>{record.activity}</h3>
      <p className="charity-record-organization">{record.organization}</p>
      {(record.amount || record.volunteerHours) && (
        <div className="charity-record-metrics">
          {record.amount && (
            <span>
              {record.amount}
              {record.currency ? ` ${record.currency}` : ''}
            </span>
          )}
          {record.volunteerHours && (
            <span>
              {record.volunteerHours} volunteer{' '}
              {Number(record.volunteerHours) === 1 ? 'hour' : 'hours'}
            </span>
          )}
        </div>
      )}
      {record.notes && <p className="charity-record-notes">{record.notes}</p>}
    </article>
  );
}

function CharityLog() {
  const [records, setRecords] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState(null);
  const [error, setError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadRecords() {
      setIsLoading(true);
      setError('');
      setIsLoadError(false);
      try {
        const response = await fetch(CHARITY_ENDPOINT);
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

    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(
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
      setRecords((currentRecords) =>
        sortRecords(
          editingRecord
            ? currentRecords.map((currentRecord) =>
                currentRecord.id === savedRecord.id ? savedRecord : currentRecord
              )
            : [...currentRecords, savedRecord]
        )
      );
      if (!editingRecord) form.reset();
      setEditingRecord(null);
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
      const response = await fetch(`${CHARITY_ENDPOINT}/${record.id}`, {
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

      <div className="charity-layout">
        <form
          className="charity-form-card"
          key={editingRecord?.id || 'new-charity-record'}
          onSubmit={saveRecord}
        >
          <div className="charity-card-heading">
            <span aria-hidden="true">{editingRecord ? '✎' : '＋'}</span>
            <div>
              <h2>{editingRecord ? 'Edit charity record' : 'Record charity work'}</h2>
              <p>Capture donations, goods, volunteering, and other contributions.</p>
            </div>
          </div>

          <div className="charity-form-grid">
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
          </div>

          {error && !isLoadError && (
            <div className="error-message" role="alert">{error}</div>
          )}

          <div className="charity-form-actions">
            <span>Fields marked * are required.</span>
            <div>
              {editingRecord && (
                <button
                  className="cancel-button"
                  type="button"
                  disabled={isSaving || deletingRecordId !== null}
                  onClick={() => {
                    setEditingRecord(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving || deletingRecordId !== null}
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
                  visibleRecords.map((record) => (
                    <CharityRecordEntry
                      key={record.id}
                      record={record}
                      isBusy={isSaving || deletingRecordId !== null}
                      onEdit={() => {
                        setEditingRecord(record);
                        setError('');
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
