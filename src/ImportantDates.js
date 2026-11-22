import { useEffect, useState } from 'react';
import FormDialog from './FormDialog';
import { API_URL, apiFetch, readApiResponse } from './api';
import UpcomingEventCard, { useCurrentTime } from './UpcomingEventCard';
import { formatElapsedYears } from './elapsedYears';

const endpoint = `${API_URL}/api/important-dates`;

function localDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function nextDate(date, yearly, today = localDateString(new Date())) {
  if (!yearly || date > today) return date;
  const [, month, day] = date.split('-').map(Number);
  const occurrence = (year) => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  };
  const year = Number(today.slice(0, 4));
  const thisYear = occurrence(year);
  return thisYear < today ? occurrence(year + 1) : thisYear;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function ImportantDates({ members, membersLoading, membersError, onRetryMembers, canEdit }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const now = useCurrentTime();

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(false);
    setError('');
    async function load() {
      try {
        const data = await readApiResponse(await apiFetch(endpoint));
        if (!Array.isArray(data)) throw new Error('Unexpected response from the server.');
        if (current) setDates(data);
      } catch (loadError) {
        if (current) {
          setLoadError(true);
          setError(`Could not load important dates. ${loadError.message}`);
        }
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [attempt]);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = form.get('title').trim();
    if (!title) {
      setFormError('Enter a title.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const saved = await readApiResponse(await apiFetch(
        editing.id ? `${endpoint}/${editing.id}` : endpoint,
        {
          method: editing.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            date: form.get('date'),
            repeatYearly: form.get('repeatYearly') === 'yearly',
            familyMemberId: form.get('familyMemberId') ? Number(form.get('familyMemberId')) : null,
          }),
        }
      ));
      setDates((previous) => editing.id
        ? previous.map((item) => item.id === saved.id ? saved : item)
        : [...previous, saved]);
      setEditing(null);
    } catch (saveError) {
      setFormError(`Could not save important date. ${saveError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await readApiResponse(await apiFetch(`${endpoint}/${item.id}`, { method: 'DELETE' }));
      setDates((previous) => previous.filter((date) => date.id !== item.id));
    } catch (deleteError) {
      setError(`Could not delete important date. ${deleteError.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function moveDate(index, offset) {
    const destination = index + offset;
    if (busy || search.trim() || destination < 0 || destination >= events.length) return;
    const reordered = [...events];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    const previousDates = dates;
    setDates(reordered.map((item, sortOrder) => ({ ...item, sortOrder })));
    setBusy(true);
    setError('');
    try {
      const saved = await readApiResponse(await apiFetch(`${endpoint}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateIds: reordered.map((item) => item.id) }),
      }));
      if (!Array.isArray(saved)) throw new Error('Unexpected response from the server.');
      setDates(saved);
    } catch (reorderError) {
      setDates(previousDates);
      setError(`Could not reorder important dates. ${reorderError.message}`);
    } finally {
      setBusy(false);
    }
  }

  const today = localDateString(new Date(now));
  const chronologicalEvents = dates
    .map((item) => ({ ...item, next: nextDate(item.date, item.repeatYearly, today) }))
    .sort((a, b) => {
      const aPast = a.next < today;
      const bPast = b.next < today;
      return Number(aPast) - Number(bPast) ||
        (aPast ? b.next.localeCompare(a.next) : a.next.localeCompare(b.next)) ||
        a.title.localeCompare(b.title);
    });
  const events = [...chronologicalEvents].sort((a, b) => {
    if (a.sortOrder == null && b.sortOrder == null) return 0;
    if (a.sortOrder == null) return 1;
    if (b.sortOrder == null) return -1;
    return a.sortOrder - b.sortOrder;
  });
  const upcoming = chronologicalEvents.find((item) => item.next >= today);
  const query = search.trim().toLowerCase();
  const filteredEvents = query ? events.filter((item) => {
    const member = members.find((person) => person.id === item.familyMemberId);
    return [
      item.title, member?.firstName, member?.lastName, item.date, displayDate(item.date),
    ].filter(Boolean).join(' ').toLowerCase().includes(query);
  }) : events;

  return (
    <>
    <div className="summary-row">
      <UpcomingEventCard
        date={!loading && !loadError ? upcoming?.next : undefined}
        description={upcoming && chronologicalEvents.filter((item) => item.next === upcoming.next)
          .map((item) => item.title).join(' · ')}
        now={now}
        emptyMessage={loading ? 'Loading upcoming events…'
          : loadError ? 'Upcoming events are unavailable.'
            : 'No upcoming important dates'}
      />
    </div>
    <section className="members-panel important-dates" aria-labelledby="important-dates-heading">
      <div className="panel-heading">
        <div>
          <h2 id="important-dates-heading">Important dates</h2>
          <p>Keep meaningful dates together in one place.</p>
        </div>
        {canEdit && <button className="primary-button" type="button" disabled={busy || membersLoading || membersError} onClick={() => {
          setFormError('');
          setEditing({});
        }}><span aria-hidden="true">＋</span> Add important date</button>}
      </div>
      {!canEdit && <p className="family-readonly-note">Only a super administrator can change family information.</p>}
      <div className="member-toolbar">
        <label className="search-box">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="visually-hidden">Search important dates</span>
          <input
            type="search"
            placeholder="Search by title, member, or date..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="member-count">
          {filteredEvents.length} {filteredEvents.length === 1 ? 'date' : 'dates'}
        </span>
      </div>
      {error && <div className="error-message" role="alert">
        <span>{error}</span>
        <button className="retry-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Reload</button>
      </div>}
      {membersError && <div className="error-message" role="alert">
        <span>Could not load family member choices.</span>
        <button className="retry-button" type="button" onClick={onRetryMembers}>Retry</button>
      </div>}
      {loading || membersLoading ? <div className="empty-state" role="status">Loading important dates…</div>
        : filteredEvents.length ? <div className="important-date-list">
          {filteredEvents.map((item, index) => {
            const member = members.find((person) => person.id === item.familyMemberId);
            const elapsed = formatElapsedYears(item.date, 'ago', new Date(now));
            return <article className="important-date-row" key={item.id}>
              <span className="important-date-icon" aria-hidden="true">◇</span>
              <div className="important-date-details">
                <div className="important-date-label">
                  <strong className="important-date-title">{item.title}</strong>
                  <span>{item.repeatYearly ? 'Yearly' : 'One-time'}
                    {member && ` · ${`${member.firstName} ${member.lastName || ''}`.trim()}`}
                  </span>
                </div>
                <div className="important-date-when">
                  <strong>{displayDate(item.date)}</strong>
                  {elapsed && <span className="elapsed-years">{elapsed}</span>}
                </div>
              </div>
              {canEdit && <div className="member-actions">
                <button className="member-move-button" type="button" disabled={busy || loadError || membersError || Boolean(query) || index === 0} title={query ? 'Clear search to reorder the full list' : 'Move up'} aria-label={`Move ${item.title} up`} onClick={() => moveDate(index, -1)}>↑</button>
                <button className="member-move-button" type="button" disabled={busy || loadError || membersError || Boolean(query) || index === events.length - 1} title={query ? 'Clear search to reorder the full list' : 'Move down'} aria-label={`Move ${item.title} down`} onClick={() => moveDate(index, 1)}>↓</button>
                <button className="member-edit-button" type="button" disabled={busy || membersError} aria-label={`Edit ${item.title}`} onClick={() => { setFormError(''); setEditing(item); }}>Edit</button>
                <button className="member-edit-button" type="button" disabled={busy} aria-label={`Delete ${item.title}`} onClick={() => remove(item)}>Delete</button>
              </div>}
            </article>;
          })}
        </div> : !error && !membersError && <div className="empty-state">
          <h3>{query ? 'No important dates found' : 'No important dates yet'}</h3>
          <p>{query ? 'Try another title, member, or date.' : 'Add a meaningful date to see it here.'}</p>
        </div>}
      <p className="storage-note">Yearly dates on February 29 are observed on February 28 in non-leap years.</p>
      {editing && <FormDialog title={editing.id ? 'Edit important date' : 'Add important date'} onClose={() => setEditing(null)} isBusy={busy}>
        <form onSubmit={save}>
          <div className="form-grid">
            <label>Title<input name="title" defaultValue={editing.title || ''} maxLength={255} required /></label>
            <label>Date<input name="date" type="date" defaultValue={editing.date || ''} required /></label>
            <label>Repeats<select name="repeatYearly" defaultValue={editing.repeatYearly ? 'yearly' : 'once'}>
              <option value="once">One-time</option><option value="yearly">Yearly</option>
            </select></label>
            <label>Family member (optional)<select name="familyMemberId" defaultValue={editing.familyMemberId || ''}>
              <option value="">Entire family</option>
              {members.map((member) => <option key={member.id} value={member.id}>{`${member.firstName} ${member.lastName || ''}`.trim()}</option>)}
            </select></label>
          </div>
          {formError && <p className="error-message" role="alert">{formError}</p>}
          <div className="form-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save date'}</button>
          </div>
        </form>
      </FormDialog>}
    </section>
    </>
  );
}

export default ImportantDates;
