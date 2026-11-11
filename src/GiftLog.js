import { useEffect, useMemo, useState } from 'react';
import './GiftLog.css';

const GIFTS_ENDPOINT = `${process.env.REACT_APP_API_URL || ''}/api/gifts`;
const GIFT_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
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

function formatGiftDate(date) {
  return GIFT_DATE_FORMATTER.format(new Date(`${date}T00:00:00Z`));
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

function GiftLog() {
  const [gifts, setGifts] = useState([]);
  const [editingGift, setEditingGift] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [groupSearch, setGroupSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadGifts() {
      setIsLoading(true);
      setError('');
      setIsLoadError(false);
      try {
        const response = await fetch(GIFTS_ENDPOINT);
        const data = await readApiResponse(response);
        if (!Array.isArray(data)) {
          throw new Error('The server returned an unexpected gifts response.');
        }
        if (isCurrent) setGifts(data);
      } catch (loadError) {
        console.error('Could not load gifts from the API.', loadError);
        if (isCurrent) {
          setError(
            `Could not load gifts. ${loadError.message || 'Check that the API is running.'}`
          );
          setIsLoadError(true);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadGifts();
    return () => {
      isCurrent = false;
    };
  }, [loadAttempt]);

  async function saveGift(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const gift = {
      recipientName: String(formData.get('recipientName') || '').trim(),
      recipientType: formData.get('recipientType'),
      giftName: String(formData.get('giftName') || '').trim(),
      occasion: String(formData.get('occasion') || '').trim(),
      dateGiven: formData.get('dateGiven'),
      amount: formData.get('amount') || '',
      currency: String(formData.get('currency') || '').trim().toUpperCase(),
      notes: String(formData.get('notes') || '').trim(),
    };

    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(
        editingGift ? `${GIFTS_ENDPOINT}/${editingGift.id}` : GIFTS_ENDPOINT,
        {
          method: editingGift ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gift),
        }
      );
      const savedGift = await readApiResponse(response);
      const savedRecipientKey = savedGift.recipientName.trim().toLocaleLowerCase();
      setExpandedGroups((currentGroups) => ({
        ...currentGroups,
        [savedRecipientKey]: true,
      }));
      setGifts((currentGifts) =>
        editingGift
          ? currentGifts.map((currentGift) =>
              currentGift.id === savedGift.id ? savedGift : currentGift
            )
          : [savedGift, ...currentGifts]
      );
      if (!editingGift) form.reset();
      setEditingGift(null);
    } catch (saveError) {
      console.error(
        `Could not ${editingGift ? 'update' : 'save'} a gift through the API.`,
        saveError
      );
      setError(
        `Could not ${editingGift ? 'update' : 'save'} gift. ${saveError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  const familyGiftCount = gifts.filter((gift) => gift.recipientType === 'Family').length;
  const friendGiftCount = gifts.filter((gift) => gift.recipientType === 'Friend').length;
  const recipientGroups = useMemo(() => {
    const groups = new Map();
    gifts.forEach((gift) => {
      const key = gift.recipientName.trim().toLocaleLowerCase();
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: gift.recipientName,
          recipientType: gift.recipientType,
          gifts: [],
        });
      }
      groups.get(key).gifts.push(gift);
    });
    return [...groups.values()].sort((first, second) =>
      first.name.localeCompare(second.name)
    );
  }, [gifts]);
  const normalizedSearch = groupSearch.trim().toLocaleLowerCase();
  const visibleRecipientGroups = recipientGroups.filter((group) =>
    group.name.toLocaleLowerCase().includes(normalizedSearch)
  );

  return (
    <section className="page-content gift-page" aria-labelledby="gift-page-heading">
      <header className="gift-page-heading">
        <div>
          <span className="eyebrow">THOUGHTFULNESS, REMEMBERED</span>
          <h1 id="gift-page-heading">Gift log</h1>
          <p>Keep a little record of the gifts you’ve shared with the people you love.</p>
        </div>
        <div className="gift-total" aria-label={`${gifts.length} gifts recorded`}>
          <span aria-hidden="true">✦</span>
          <div>
            <strong>{gifts.length}</strong>
            <small>{gifts.length === 1 ? 'gift remembered' : 'gifts remembered'}</small>
          </div>
        </div>
      </header>

      <div className="gift-stats">
        <div className="gift-stat-card">
          <span className="gift-stat-icon">♧</span>
          <div>
            <span className="summary-label">FAMILY</span>
            <strong>{familyGiftCount}</strong>
            <small>{familyGiftCount === 1 ? 'gift given' : 'gifts given'}</small>
          </div>
        </div>
        <div className="gift-stat-card gift-stat-friends">
          <span className="gift-stat-icon">♡</span>
          <div>
            <span className="summary-label">FRIENDS</span>
            <strong>{friendGiftCount}</strong>
            <small>{friendGiftCount === 1 ? 'gift given' : 'gifts given'}</small>
          </div>
        </div>
      </div>

      <div className="gift-layout">
        <form
          className="gift-form-card"
          key={editingGift?.id || 'new-gift'}
          onSubmit={saveGift}
        >
          <div className="gift-card-heading">
            <span className="gift-card-icon" aria-hidden="true">
              {editingGift ? '✎' : '＋'}
            </span>
            <div>
              <h2>{editingGift ? 'Edit gift' : 'Record a gift'}</h2>
              <p>
                {editingGift
                  ? 'Update the details and save your changes.'
                  : 'Capture who it was for and the occasion.'}
              </p>
            </div>
          </div>

          <div className="gift-form-grid">
            <label>
              For <span className="required-mark">*</span>
              <input
                name="recipientName"
                required
                maxLength="100"
                autoComplete="name"
                placeholder="Person’s name"
                defaultValue={editingGift?.recipientName || ''}
              />
            </label>
            <label>
              They’re my
              <select
                name="recipientType"
                defaultValue={editingGift?.recipientType || 'Family'}
              >
                <option>Family</option>
                <option>Friend</option>
                <option>Other</option>
              </select>
            </label>
            <label className="gift-form-full">
              Gift <span className="required-mark">*</span>
              <input
                name="giftName"
                required
                maxLength="150"
                placeholder="What did you give?"
                defaultValue={editingGift?.giftName || ''}
              />
            </label>
            <label>
              Occasion
              <input
                name="occasion"
                maxLength="100"
                placeholder="Birthday, wedding, just because…"
                defaultValue={editingGift?.occasion || ''}
              />
            </label>
            <label>
              Date given <span className="required-mark">*</span>
              <input
                name="dateGiven"
                type="date"
                required
                max={getLocalDateString()}
                defaultValue={editingGift?.dateGiven || getLocalDateString()}
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
                defaultValue={editingGift?.amount || ''}
              />
            </label>
            <label>
              Currency
              <input
                name="currency"
                maxLength="3"
                placeholder="USD / INR"
                aria-label="Currency code"
                defaultValue={editingGift?.currency || ''}
              />
            </label>
            <label className="gift-form-full">
              Details or note
              <textarea
                name="notes"
                rows="3"
                maxLength="2000"
                placeholder="Add a memory, message, or any other details…"
                defaultValue={editingGift?.notes || ''}
              />
            </label>
          </div>

          {error && !isLoadError && (
            <div className="error-message" role="alert">{error}</div>
          )}

          <div className="gift-form-actions">
            <span>
              {editingGift ? 'Editing a saved entry.' : 'Fields marked * are required.'}
            </span>
            <div className="gift-form-buttons">
              {editingGift && (
                <button
                  className="cancel-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setEditingGift(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              )}
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving
                  ? 'Saving…'
                  : editingGift
                    ? 'Save changes'
                    : 'Save gift'}
              </button>
            </div>
          </div>
        </form>

        <section className="gift-history-card" aria-labelledby="gift-history-heading">
          <div className="gift-history-heading">
            <div>
              <h2 id="gift-history-heading">Gifts by person</h2>
              <p>Choose a name to open their gift history.</p>
            </div>
            <span className="gift-history-count">
              {recipientGroups.length} {recipientGroups.length === 1 ? 'person' : 'people'}
            </span>
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
            <div className="gift-empty-state" role="status">Loading your gift journal…</div>
          ) : isLoadError ? (
            <div className="gift-empty-state">Your gift journal is unavailable right now.</div>
          ) : recipientGroups.length > 0 ? (
            <>
              <label className="gift-search">
                <span aria-hidden="true">⌕</span>
                <span className="visually-hidden">Search recipients</span>
                <input
                  type="search"
                  placeholder="Find someone by name…"
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                />
              </label>
              {visibleRecipientGroups.length > 0 ? (
                <div className="gift-groups">
                  {visibleRecipientGroups.map((group) => {
                    const isExpanded = Boolean(expandedGroups[group.key]);
                    const panelId = `gift-group-${group.gifts[0].id}`;
                    return (
                      <section className="gift-group" key={group.key}>
                        <button
                          className="gift-group-toggle"
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={panelId}
                          onClick={() =>
                            setExpandedGroups((currentGroups) => ({
                              ...currentGroups,
                              [group.key]: !currentGroups[group.key],
                            }))
                          }
                        >
                          <span className="gift-group-avatar" aria-hidden="true">
                            {group.name.slice(0, 1).toLocaleUpperCase()}
                          </span>
                          <span className="gift-group-summary">
                            <strong>{group.name}</strong>
                            <span>
                              {group.recipientType} · {group.gifts.length}{' '}
                              {group.gifts.length === 1 ? 'gift' : 'gifts'}
                            </span>
                          </span>
                          <span className="gift-group-action">
                            {isExpanded ? 'Hide gifts' : 'View gifts'}
                            <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                          </span>
                        </button>
                        <div
                          className="gift-group-records"
                          id={panelId}
                          hidden={!isExpanded}
                        >
                          {group.gifts.map((gift) => (
                            <article className="gift-record" key={gift.id}>
                              <div className="gift-record-top">
                                <span className={`gift-recipient-type gift-recipient-${gift.recipientType.toLowerCase()}`}>
                                  {gift.recipientType}
                                </span>
                                <div className="gift-record-actions">
                                  <time dateTime={gift.dateGiven}>
                                    {formatGiftDate(gift.dateGiven)}
                                  </time>
                                  <button
                                    className="gift-edit-button"
                                    type="button"
                                    aria-label={`Edit ${gift.occasion || gift.giftName} gift for ${gift.recipientName}`}
                                    onClick={() => setEditingGift(gift)}
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                              <h3>{gift.giftName}</h3>
                              <div className="gift-record-details">
                                {gift.occasion && <span>{gift.occasion}</span>}
                                {gift.amount && (
                                  <span>
                                    {gift.amount}{gift.currency ? ` ${gift.currency}` : ''}
                                  </span>
                                )}
                              </div>
                              {gift.notes && <p className="gift-notes">{gift.notes}</p>}
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="gift-empty-state">
                  <h3>No people found</h3>
                  <p>Try another name.</p>
                </div>
              )}
            </>
          ) : (
            <div className="gift-empty-state">
              <span className="gift-empty-icon" aria-hidden="true">✦</span>
              <h3>No gifts logged yet</h3>
              <p>Your thoughtful moments will be kept here.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default GiftLog;
