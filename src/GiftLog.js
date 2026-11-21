import { useEffect, useMemo, useState } from 'react';
import './GiftLog.css';
import { apiFetch } from './api';
import FormDialog from './FormDialog';

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

function summarizeGiftAmounts(gifts) {
  const totalsByCurrency = new Map();

  gifts.forEach((gift) => {
    if (gift.amount === '' || gift.amount === null || gift.amount === undefined) return;
    const amount = Number(gift.amount);
    if (!Number.isFinite(amount) || amount < 0) return;

    const currency = String(gift.currency || '').trim().toUpperCase();
    const cents = Math.round(amount * 100);
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + cents);
  });

  const totals = [...totalsByCurrency.entries()]
    .sort(([firstCurrency], [secondCurrency]) => firstCurrency.localeCompare(secondCurrency))
    .map(([currency, cents]) => {
      const amount = (cents / 100).toFixed(2);
      return currency ? `${amount} ${currency}` : `${amount} (no currency)`;
    });

  return totals.length ? `Total: ${totals.join(' · ')}` : 'No amounts recorded';
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

function GiftEntry({
  gift,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isBusy,
}) {
  const moveDescription = gift.occasion
    ? `${gift.occasion} gift`
    : gift.giftName;

  return (
    <article className="gift-record">
      <div className="gift-record-top">
        <time dateTime={gift.dateGiven}>{formatGiftDate(gift.dateGiven)}</time>
        <div className="gift-record-actions">
          <button
            className="gift-move-button"
            type="button"
            disabled={isBusy || !canMoveUp}
            aria-label={`Move ${moveDescription} for ${gift.recipientName} up`}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            className="gift-move-button"
            type="button"
            disabled={isBusy || !canMoveDown}
            aria-label={`Move ${moveDescription} for ${gift.recipientName} down`}
            onClick={onMoveDown}
          >
            ↓
          </button>
          <button
            className="gift-edit-button"
            type="button"
            disabled={isBusy}
            aria-label={`Edit ${gift.occasion || gift.giftName} gift for ${gift.recipientName}`}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="gift-delete-button"
            type="button"
            disabled={isBusy}
            aria-label={`Delete ${gift.occasion || gift.giftName} gift for ${gift.recipientName}`}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
      <h4>{gift.occasion || gift.giftName}</h4>
      <div className="gift-record-details">
        {gift.occasion && (
          <span className="gift-record-gift">Gift: {gift.giftName}</span>
        )}
        {gift.amount && (
          <span className="gift-record-amount">
            {gift.amount}{gift.currency ? ` ${gift.currency}` : ''}
          </span>
        )}
      </div>
      {gift.notes && <p className="gift-notes">{gift.notes}</p>}
    </article>
  );
}

function GiftLog({ familyMembers = [], loadFamilyMembers = false }) {
  const [gifts, setGifts] = useState([]);
  const [assignedFamilyMembers, setAssignedFamilyMembers] = useState([]);
  const [familyMemberError, setFamilyMemberError] = useState('');
  const [editingGift, setEditingGift] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedFamilyMemberIds, setSelectedFamilyMemberIds] = useState([]);
  const [giftDirection, setGiftDirection] = useState('Given');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [groupSearch, setGroupSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [deletingGiftId, setDeletingGiftId] = useState(null);
  const [error, setError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const giftFamilyMembers = loadFamilyMembers
    ? assignedFamilyMembers
    : familyMembers;

  function closeGiftForm() {
    setIsFormOpen(false);
    setEditingGift(null);
    setSelectedFamilyMemberIds([]);
    setGiftDirection('Given');
    if (!isLoadError) setError('');
  }

  useEffect(() => {
    if (!loadFamilyMembers) return undefined;
    let isCurrent = true;

    async function loadAssignedFamilyMembers() {
      setFamilyMemberError('');
      try {
        const response = await apiFetch(`${GIFTS_ENDPOINT}/family-members`);
        const data = await readApiResponse(response);
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid family member list.');
        }
        if (isCurrent) setAssignedFamilyMembers(data);
      } catch (loadError) {
        if (isCurrent) {
          setFamilyMemberError(
            `Could not load family members for gift records. ${loadError.message || 'Please try again.'}`
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

    async function loadGifts() {
      setIsLoading(true);
      setError('');
      setIsLoadError(false);
      try {
        const response = await apiFetch(GIFTS_ENDPOINT);
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
      direction: formData.get('direction'),
      giftName: String(formData.get('giftName') || '').trim(),
      occasion: String(formData.get('occasion') || '').trim(),
      dateGiven: formData.get('dateGiven'),
      amount: formData.get('amount') || '',
      currency: String(formData.get('currency') || '').trim().toUpperCase(),
      notes: String(formData.get('notes') || '').trim(),
      familyMemberIds: selectedFamilyMemberIds,
    };

    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(
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
      setSelectedFamilyMemberIds([]);
      setGiftDirection('Given');
      setIsFormOpen(false);
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

  async function deleteGift(gift) {
    const description = [gift.occasion, gift.giftName].filter(Boolean).join(' — ');
    if (!window.confirm(`Delete “${description}” for ${gift.recipientName}? This cannot be undone.`)) {
      return;
    }

    setDeletingGiftId(gift.id);
    setError('');
    try {
      const response = await apiFetch(`${GIFTS_ENDPOINT}/${gift.id}`, {
        method: 'DELETE',
      });
      await readApiResponse(response);
      setGifts((currentGifts) =>
        currentGifts.filter((currentGift) => currentGift.id !== gift.id)
      );
      if (editingGift?.id === gift.id) {
        setEditingGift(null);
        setSelectedFamilyMemberIds([]);
        setGiftDirection('Given');
      }
    } catch (deleteError) {
      console.error('Could not delete a gift through the API.', deleteError);
      setError(
        `Could not delete gift. ${deleteError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setDeletingGiftId(null);
    }
  }

  async function moveGift(categoryGifts, index, offset) {
    if (isReordering) return;
    const destination = index + offset;
    if (destination < 0 || destination >= categoryGifts.length) return;

    const previousGifts = gifts;
    const reorderedCategory = [...categoryGifts];
    [reorderedCategory[index], reorderedCategory[destination]] = [
      reorderedCategory[destination],
      reorderedCategory[index],
    ];
    const categoryIds = new Set(categoryGifts.map((gift) => gift.id));
    let categoryIndex = 0;
    const reorderedGifts = gifts.map((gift) =>
      categoryIds.has(gift.id) ? reorderedCategory[categoryIndex++] : gift
    );
    setGifts(reorderedGifts);
    setIsReordering(true);
    setError('');

    try {
      const response = await apiFetch(`${GIFTS_ENDPOINT}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftIds: reorderedGifts.map((gift) => gift.id) }),
      });
      const savedGifts = await readApiResponse(response);
      if (!Array.isArray(savedGifts)) {
        throw new Error('The server returned an unexpected gifts order response.');
      }
      setGifts(savedGifts);
    } catch (reorderError) {
      console.error('Could not reorder gifts through the API.', reorderError);
      setGifts(previousGifts);
      setError(
        `Could not reorder gifts. ${reorderError.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsReordering(false);
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
          <p>Keep track of thoughtful gifts given and received.</p>
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
            <small>{familyGiftCount === 1 ? 'gift recorded' : 'gifts recorded'}</small>
          </div>
        </div>
        <div className="gift-stat-card gift-stat-friends">
          <span className="gift-stat-icon">♡</span>
          <div>
            <span className="summary-label">FRIENDS</span>
            <strong>{friendGiftCount}</strong>
            <small>{friendGiftCount === 1 ? 'gift recorded' : 'gifts recorded'}</small>
          </div>
        </div>
      </div>

      <div className="gift-page-actions">
        <button
          className="primary-button"
          type="button"
          disabled={isSaving || isReordering || deletingGiftId !== null}
          onClick={() => {
            closeGiftForm();
            setIsFormOpen(true);
          }}
        >
          + Record a gift
        </button>
      </div>
      <div className="gift-layout">
        {isFormOpen && (
        <FormDialog
          title={editingGift ? 'Edit gift' : 'Record a gift'}
          description={editingGift
            ? 'Update the details and save your changes.'
            : 'Capture who it was for and the occasion.'}
          onClose={closeGiftForm}
          isBusy={isSaving}
        >
        <form
          className="gift-form-card"
          key={editingGift?.id || 'new-gift'}
          onSubmit={saveGift}
        >
          {familyMemberError && (
            <p className="gift-error" role="alert">{familyMemberError}</p>
          )}
          <div className="gift-form-grid">
            <h3 className="gift-form-section-heading gift-form-full">Gift details</h3>
            <label>
              Direction
              <select
                name="direction"
                value={giftDirection}
                onChange={(event) => setGiftDirection(event.target.value)}
              >
                <option value="Given">Given (we gave)</option>
                <option value="Received">Received (we got)</option>
              </select>
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
              {giftDirection === 'Received' ? 'From' : 'To'}{' '}
              <span className="required-mark">*</span>
              <input
                name="recipientName"
                required
                maxLength="100"
                autoComplete="name"
                placeholder="Person’s name"
                list={giftFamilyMembers.length ? 'gift-family-members' : undefined}
                defaultValue={editingGift?.recipientName || ''}
              />
              {giftFamilyMembers.length > 0 && (
                <datalist id="gift-family-members">
                  {giftFamilyMembers.map((member) => (
                    <option
                      key={member.id}
                      value={`${member.firstName} ${member.lastName || ''}`.trim()}
                    />
                  ))}
                </datalist>
              )}
            </label>
            <label>
              Gift <span className="required-mark">*</span>
              <input
                name="giftName"
                required
                maxLength="150"
                placeholder="What was given?"
                defaultValue={editingGift?.giftName || ''}
              />
            </label>
            <label>
              Gift date <span className="required-mark">*</span>
              <input
                name="dateGiven"
                type="date"
                required
                max={getLocalDateString()}
                defaultValue={editingGift?.dateGiven || getLocalDateString()}
              />
            </label>
            <h3 className="gift-form-section-heading gift-form-full">
              Additional details <span>Optional</span>
            </h3>
            <label className="gift-form-full">
              Occasion
              <input
                name="occasion"
                maxLength="100"
                placeholder="Birthday, wedding, just because…"
                defaultValue={editingGift?.occasion || ''}
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
            <fieldset className="gift-member-link gift-form-full">
              <legend>Family members for this gift</legend>
              <p id="gift-family-member-help">
                Select family members to share this gift with people who have Gift log
                access and access to any selected member.
                {editingGift?.workspaceVisible === false &&
                  !(editingGift.familyMemberIds || []).length &&
                  !editingGift.hasOtherFamilyMembers
                  ? ' This older unlinked family gift remains visible only to the workspace super admin.'
                  : ' When no members are linked, people with Gift log access in this workspace can see it.'}
              </p>
              {editingGift?.hasOtherFamilyMembers && (
                <p>Additional family members you cannot access will remain selected.</p>
              )}
              <div className="gift-member-options" aria-describedby="gift-family-member-help">
                {giftFamilyMembers.length ? giftFamilyMembers.map((member) => (
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

          <div className="gift-form-actions">
            <span>
              {editingGift ? 'Editing a saved entry.' : 'Fields marked * are required.'}
            </span>
            <div className="gift-form-buttons">
                <button
                  className="cancel-button"
                  type="button"
                  disabled={isSaving || isReordering || deletingGiftId !== null}
                  onClick={closeGiftForm}
                >
                  Cancel
                </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving || isReordering || deletingGiftId !== null}
              >
                {isSaving
                  ? 'Saving…'
                  : editingGift
                    ? 'Save changes'
                    : 'Save gift'}
              </button>
            </div>
          </div>
        </form>
        </FormDialog>
        )}

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
                    const categories = ['Given', 'Received'].map((direction) => ({
                      direction,
                      gifts: group.gifts.filter(
                        (gift) => (gift.direction || 'Given') === direction
                      ),
                    }));
                    const directionSummary = categories
                      .filter((category) => category.gifts.length > 0)
                      .map((category) =>
                        `${category.gifts.length} ${category.direction.toLowerCase()}`
                      )
                      .join(' · ');
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
                              {group.recipientType} · {directionSummary}
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
                          {categories.map((category) => {
                            const categoryKey = `${group.key}:${category.direction}`;
                            const categoryPanelId = `${panelId}-${category.direction.toLowerCase()}-records`;
                            const isCategoryExpanded =
                              expandedCategories[categoryKey] !== false;

                            return (
                              <section
                                className="gift-direction-group"
                                key={category.direction}
                                aria-labelledby={`${panelId}-${category.direction.toLowerCase()}`}
                              >
                                <button
                                  className="gift-direction-toggle"
                                  type="button"
                                  aria-expanded={isCategoryExpanded}
                                  aria-controls={categoryPanelId}
                                  onClick={() =>
                                    setExpandedCategories((currentCategories) => ({
                                      ...currentCategories,
                                      [categoryKey]: !isCategoryExpanded,
                                    }))
                                  }
                                >
                                  <span
                                    className="gift-direction-title"
                                    id={`${panelId}-${category.direction.toLowerCase()}`}
                                    role="heading"
                                    aria-level="3"
                                  >
                                    {category.direction}
                                  </span>
                                  <span className="gift-direction-metrics">
                                    <span className="gift-direction-count">
                                      {category.gifts.length}{' '}
                                      {category.gifts.length === 1 ? 'gift' : 'gifts'}
                                    </span>
                                    <span className="gift-direction-total">
                                      {summarizeGiftAmounts(category.gifts)}
                                    </span>
                                    <span className="gift-direction-chevron" aria-hidden="true">
                                      {isCategoryExpanded ? '−' : '+'}
                                    </span>
                                  </span>
                                </button>
                                <div id={categoryPanelId} hidden={!isCategoryExpanded}>
                                  {category.gifts.length > 0 ? (
                                    category.gifts.map((gift) => (
                                      <GiftEntry
                                        key={gift.id}
                                        gift={gift}
                                        isBusy={
                                          isSaving ||
                                          isReordering ||
                                          deletingGiftId !== null
                                        }
                                        canMoveUp={category.gifts.indexOf(gift) > 0}
                                        canMoveDown={
                                          category.gifts.indexOf(gift) <
                                          category.gifts.length - 1
                                        }
                                        onMoveUp={() =>
                                          moveGift(
                                            category.gifts,
                                            category.gifts.indexOf(gift),
                                            -1
                                          )
                                        }
                                        onMoveDown={() =>
                                          moveGift(
                                            category.gifts,
                                            category.gifts.indexOf(gift),
                                            1
                                          )
                                        }
                                        onEdit={() => {
                                          setEditingGift(gift);
                                          setSelectedFamilyMemberIds(gift.familyMemberIds || []);
                                          setGiftDirection(gift.direction || 'Given');
                                          setError('');
                                          setIsFormOpen(true);
                                        }}
                                        onDelete={() => deleteGift(gift)}
                                      />
                                    ))
                                  ) : (
                                    <p className="gift-direction-empty">
                                      {category.direction === 'Given'
                                        ? 'No gifts given to this person yet.'
                                        : 'No gifts received from this person yet.'}
                                    </p>
                                  )}
                                </div>
                              </section>
                            );
                          })}
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
