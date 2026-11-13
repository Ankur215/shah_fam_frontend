import { useEffect, useMemo, useState } from 'react';
import './App.css';
import CharityLog from './CharityLog';
import FamilyGraph from './FamilyGraph';
import GiftLog from './GiftLog';

const API_URL = process.env.REACT_APP_API_URL || '';
const FAMILY_MEMBERS_ENDPOINT = `${API_URL}/api/family-members`;
const PHONE_CHARACTERS_PATTERN = /^[\d\s().-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_COUNTRY = 'IN';
const GUJARATI_BIRTHDAY_MONTHS = [
  'Kartak',
  'Magshar',
  'Posh',
  'Maha',
  'Fagan',
  'Chaitra',
  'Vaishakh',
  'Jeth',
  'Ashadh',
  'Shravan',
  'Bhadarvo',
  'Aaso',
];
const GUJARATI_TITHI_NAMES = [
  'Ekam',
  'Bij',
  'Trij',
  'Choth',
  'Pancham',
  'Chhath',
  'Satam',
  'Atham',
  'Nom',
  'Dasham',
  'Agiyaras',
  'Baras',
  'Teras',
  'Chaudas',
];
const COUNTRIES = [
  { value: 'IN', name: 'India', dialingCode: '+91' },
  { value: 'US', name: 'United States', dialingCode: '+1' },
  { value: 'CA', name: 'Canada', dialingCode: '+1' },
  { value: 'GB', name: 'United Kingdom', dialingCode: '+44' },
  { value: 'AU', name: 'Australia', dialingCode: '+61' },
  { value: 'NZ', name: 'New Zealand', dialingCode: '+64' },
  { value: 'PK', name: 'Pakistan', dialingCode: '+92' },
  { value: 'NP', name: 'Nepal', dialingCode: '+977' },
  { value: 'BD', name: 'Bangladesh', dialingCode: '+880' },
  { value: 'LK', name: 'Sri Lanka', dialingCode: '+94' },
  { value: 'AE', name: 'United Arab Emirates', dialingCode: '+971' },
  { value: 'SG', name: 'Singapore', dialingCode: '+65' },
  { value: 'MY', name: 'Malaysia', dialingCode: '+60' },
  { value: 'CN', name: 'China', dialingCode: '+86' },
  { value: 'JP', name: 'Japan', dialingCode: '+81' },
  { value: 'DE', name: 'Germany', dialingCode: '+49' },
  { value: 'FR', name: 'France', dialingCode: '+33' },
  { value: 'IE', name: 'Ireland', dialingCode: '+353' },
  { value: 'SA', name: 'Saudi Arabia', dialingCode: '+966' },
  { value: 'QA', name: 'Qatar', dialingCode: '+974' },
  { value: 'ZA', name: 'South Africa', dialingCode: '+27' },
];

function getLocalDateString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function getPhoneParts(phone = '') {
  const normalizedPhone = typeof phone === 'string' ? phone : '';
  const country = COUNTRIES.find(({ dialingCode }) =>
    normalizedPhone.startsWith(dialingCode)
  );
  return country
    ? {
        country: country.value,
        countryCode: country.dialingCode,
        phoneNumber: normalizedPhone.slice(country.dialingCode.length).trim(),
      }
    : { country: '', countryCode: '', phoneNumber: normalizedPhone };
}

function validateMember(member, countryCode, phoneNumber) {
  const errors = {};
  const firstName = member.firstName.trim();
  const lastName = member.lastName.trim();
  const email = member.email.trim();
  const today = getLocalDateString();

  if (phoneNumber && !countryCode) {
    errors.country = 'Choose a country to add its calling code.';
  }
  if (!firstName) {
    errors.firstName = 'First name is required.';
  } else if (firstName.length > 100) {
    errors.firstName = 'First name must be 100 characters or fewer.';
  }
  if (lastName.length > 100) {
    errors.lastName = 'Last name must be 100 characters or fewer.';
  }
  if (phoneNumber) {
    const digitCount = phoneNumber.replace(/\D/g, '').length;
    if (
      member.phone.length > 30 ||
      !PHONE_CHARACTERS_PATTERN.test(phoneNumber) ||
      digitCount < 7 ||
      digitCount > 15
    ) {
      errors.phone = 'Enter a phone number with 7–15 digits and no more than 30 characters.';
    }
  }
  if (email && (email.length > 255 || !EMAIL_PATTERN.test(email))) {
    errors.email = 'Enter a valid email address (up to 255 characters).';
  }
  if (member.dateOfBirth && member.dateOfBirth > today) {
    errors.dateOfBirth = 'Birthday cannot be in the future.';
  }
  if (member.dateOfDeath && member.dateOfDeath > today) {
    errors.dateOfDeath = 'Death date cannot be in the future.';
  }
  if (
    member.dateOfBirth &&
    member.dateOfDeath &&
    member.dateOfDeath < member.dateOfBirth
  ) {
    errors.dateOfDeath = 'Death date cannot be before the birthday.';
  }
  const hasGujaratiBirthday =
    member.gujaratiBirthdayMonth ||
    member.gujaratiBirthdayPaksha ||
    member.gujaratiBirthdayTithi;
  if (hasGujaratiBirthday && !member.gujaratiBirthdayMonth) {
    errors.gujaratiBirthdayMonth = 'Choose a month for the Gujarati birthday.';
  }
  if (hasGujaratiBirthday && !member.gujaratiBirthdayPaksha) {
    errors.gujaratiBirthdayPaksha = 'Choose Sud or Vad for the Gujarati birthday.';
  }
  if (hasGujaratiBirthday && !member.gujaratiBirthdayTithi) {
    errors.gujaratiBirthdayTithi = 'Choose a tithi for the Gujarati birthday.';
  }
  if (
    (member.gujaratiBirthdayPaksha === 'Sud' && member.gujaratiBirthdayTithi === 'Amas') ||
    (member.gujaratiBirthdayPaksha === 'Vad' && member.gujaratiBirthdayTithi === 'Poonam')
  ) {
    errors.gujaratiBirthdayTithi = 'Choose a tithi that matches the selected paksha.';
  }
  const hasGujaratiDeathTithi =
    member.gujaratiDeathMonth ||
    member.gujaratiDeathPaksha ||
    member.gujaratiDeathTithi;
  if (hasGujaratiDeathTithi && !member.gujaratiDeathMonth) {
    errors.gujaratiDeathMonth = 'Choose a month for the Gujarati death tithi.';
  }
  if (hasGujaratiDeathTithi && !member.gujaratiDeathPaksha) {
    errors.gujaratiDeathPaksha = 'Choose Sud or Vad for the Gujarati death tithi.';
  }
  if (hasGujaratiDeathTithi && !member.gujaratiDeathTithi) {
    errors.gujaratiDeathTithi = 'Choose a tithi for the Gujarati death date.';
  }
  if (
    (member.gujaratiDeathPaksha === 'Sud' && member.gujaratiDeathTithi === 'Amas') ||
    (member.gujaratiDeathPaksha === 'Vad' && member.gujaratiDeathTithi === 'Poonam')
  ) {
    errors.gujaratiDeathTithi = 'Choose a tithi that matches the selected paksha.';
  }
  const hasGujaratiAnniversaryTithi =
    member.gujaratiAnniversaryMonth ||
    member.gujaratiAnniversaryPaksha ||
    member.gujaratiAnniversaryTithi;
  if (hasGujaratiAnniversaryTithi && !member.gujaratiAnniversaryMonth) {
    errors.gujaratiAnniversaryMonth =
      'Choose a month for the Gujarati wedding anniversary.';
  }
  if (hasGujaratiAnniversaryTithi && !member.gujaratiAnniversaryPaksha) {
    errors.gujaratiAnniversaryPaksha =
      'Choose Sud or Vad for the Gujarati wedding anniversary.';
  }
  if (hasGujaratiAnniversaryTithi && !member.gujaratiAnniversaryTithi) {
    errors.gujaratiAnniversaryTithi =
      'Choose a tithi for the Gujarati wedding anniversary.';
  }
  if (
    (member.gujaratiAnniversaryPaksha === 'Sud' &&
      member.gujaratiAnniversaryTithi === 'Amas') ||
    (member.gujaratiAnniversaryPaksha === 'Vad' &&
      member.gujaratiAnniversaryTithi === 'Poonam')
  ) {
    errors.gujaratiAnniversaryTithi =
      'Choose a tithi that matches the selected paksha.';
  }
  if (member.relationship.length > 50) {
    errors.relationship = 'Relationship must be 50 characters or fewer.';
  }
  if (member.gender.length > 50) {
    errors.gender = 'Gender must be 50 characters or fewer.';
  }
  if (member.address.trim().length > 255) {
    errors.address = 'Address must be 255 characters or fewer.';
  }

  return errors;
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
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Server returned HTTP ${response.status} with ${
            body ? 'an invalid response.' : 'an empty response.'
          }`;
    throw new Error(message);
  }

  if (data === null) {
    throw new Error('The API returned an empty or invalid JSON response.');
  }

  return data;
}

function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

function calculateElapsedYears(date) {
  if (!date) return null;

  const today = new Date();
  const startDate = new Date(`${date}T00:00:00`);
  let years = today.getFullYear() - startDate.getFullYear();
  const anniversaryHasPassed =
    today.getMonth() > startDate.getMonth() ||
    (today.getMonth() === startDate.getMonth() &&
      today.getDate() >= startDate.getDate());

  if (!anniversaryHasPassed) years -= 1;
  return years >= 0 ? years : null;
}

function formatElapsedYears(date, description) {
  const years = calculateElapsedYears(date);
  if (years === null) return '';
  return `${years} ${years === 1 ? 'year' : 'years'} ${description}`;
}

function formatDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function MedicalReports() {
  return (
    <section
      className="page-content medical-reports-page"
      aria-labelledby="medical-reports-heading"
    >
      <header className="medical-reports-heading">
        <span className="eyebrow">HEALTH RECORDS</span>
        <h1 id="medical-reports-heading">Medical reports</h1>
        <p>Redacted summaries of the medical documents you choose to keep here.</p>
      </header>

      <article className="medical-report-card">
        <div className="medical-report-header">
          <div>
            <span className="eyebrow">PULMONARY FUNCTION TEST</span>
            <h2>Reported interpretation</h2>
          </div>
          <time dateTime="2024-04-24">Apr 24, 2024</time>
        </div>
        <p className="medical-report-result">
          Normal spirometry. No significant bronchodilator response.
        </p>
        <p className="medical-report-note" role="note">
          Redacted summary from a scanned report. Numerical measurements were
          omitted because OCR could not read the table reliably. This summary is
          not medical advice; confirm the report with a qualified clinician.
        </p>
      </article>
    </section>
  );
}

function App() {
  const [members, setMembers] = useState([]);
  const [activePage, setActivePage] = useState('members');
  const [isLogsMenuOpen, setIsLogsMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedPaksha, setSelectedPaksha] = useState('');
  const [selectedTithi, setSelectedTithi] = useState('');
  const [isDeceased, setIsDeceased] = useState(false);
  const [selectedDeathPaksha, setSelectedDeathPaksha] = useState('');
  const [selectedDeathTithi, setSelectedDeathTithi] = useState('');
  const [selectedAnniversaryPaksha, setSelectedAnniversaryPaksha] = useState('');
  const [selectedAnniversaryTithi, setSelectedAnniversaryTithi] = useState('');
  const [apiError, setApiError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReorderingMembers, setIsReorderingMembers] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [validationErrors, setValidationErrors] = useState({});

  function openMemberForm(member = null) {
    setEditingMember(member);
    setSelectedCountry(member ? getPhoneParts(member.phone).country : DEFAULT_COUNTRY);
    setSelectedPaksha(member?.gujaratiBirthdayPaksha || '');
    setSelectedTithi(member?.gujaratiBirthdayTithi || '');
    setIsDeceased(Boolean(member?.isDeceased || member?.dateOfDeath));
    setSelectedDeathPaksha(member?.gujaratiDeathPaksha || '');
    setSelectedDeathTithi(member?.gujaratiDeathTithi || '');
    setSelectedAnniversaryPaksha(member?.gujaratiAnniversaryPaksha || '');
    setSelectedAnniversaryTithi(member?.gujaratiAnniversaryTithi || '');
    setValidationErrors({});
    setApiError('');
    setIsFormOpen(true);
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadMembers() {
      setIsLoading(true);
      setApiError('');
      setIsLoadError(false);
      try {
        const response = await fetch(FAMILY_MEMBERS_ENDPOINT);
        const data = await readApiResponse(response);
        if (!Array.isArray(data)) {
          throw new Error('The server returned an unexpected family-members response.');
        }
        if (isCurrent) setMembers(data);
      } catch (error) {
        console.error('Could not load family members from the API.', error);
        if (isCurrent) {
          setApiError(
            `Could not load family members. ${error.message || 'Check that the API is running.'}`
          );
          setIsLoadError(true);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadMembers();
    return () => {
      isCurrent = false;
    };
  }, [loadAttempt]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      const searchableText = [
        member.firstName,
        member.lastName,
        member.relationship,
        member.email,
        member.city,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [members, search]);
  const editingPhone = getPhoneParts(editingMember?.phone);
  const availableTithis = selectedPaksha
    ? [...GUJARATI_TITHI_NAMES, selectedPaksha === 'Sud' ? 'Poonam' : 'Amas']
    : [];
  const availableAnniversaryTithis = selectedAnniversaryPaksha
    ? [
        ...GUJARATI_TITHI_NAMES,
        selectedAnniversaryPaksha === 'Sud' ? 'Poonam' : 'Amas',
      ]
    : [];
  const relationshipCandidates = members
    .filter((member) => member.id !== editingMember?.id)
    .sort((first, second) =>
      `${first.lastName || ''}${first.firstName}`.localeCompare(
        `${second.lastName || ''}${second.firstName}`
      )
    );

  async function saveMember(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const country = COUNTRIES.find(({ value }) => value === formData.get('country'));
    const countryCode = country?.dialingCode || '';
    const phoneNumber = String(formData.get('phoneNumber') || '').trim();
    const member = {
      firstName: String(formData.get('firstName') || '').trim(),
      lastName: String(formData.get('lastName') || '').trim(),
      relationship: formData.get('relationship'),
      parentIds: formData.getAll('parentIds').map(Number),
      spouseIds: formData.getAll('spouseIds').map(Number),
      gender: formData.get('gender'),
      dateOfBirth: formData.get('dateOfBirth'),
      gujaratiBirthdayMonth: formData.get('gujaratiBirthdayMonth'),
      gujaratiBirthdayPaksha: formData.get('gujaratiBirthdayPaksha'),
      gujaratiBirthdayTithi: formData.get('gujaratiBirthdayTithi'),
      isDeceased,
      dateOfDeath: isDeceased ? formData.get('dateOfDeath') : '',
      gujaratiDeathMonth: isDeceased ? formData.get('gujaratiDeathMonth') : '',
      gujaratiDeathPaksha: isDeceased ? formData.get('gujaratiDeathPaksha') : '',
      gujaratiDeathTithi: isDeceased ? formData.get('gujaratiDeathTithi') : '',
      anniversaryDate: formData.get('anniversaryDate'),
      gujaratiAnniversaryMonth: formData.get('gujaratiAnniversaryMonth'),
      gujaratiAnniversaryPaksha: formData.get('gujaratiAnniversaryPaksha'),
      gujaratiAnniversaryTithi: formData.get('gujaratiAnniversaryTithi'),
      phone: phoneNumber ? [countryCode, phoneNumber].join(' ') : '',
      email: String(formData.get('email') || '').trim(),
      address: String(formData.get('address') || '').trim(),
    };
    const errors = validateMember(member, countryCode, phoneNumber);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstInvalidField = Object.keys(errors)[0];
      event.currentTarget.elements.namedItem(firstInvalidField)?.focus();
      return;
    }

    setIsSaving(true);
    setApiError('');
    try {
      const response = await fetch(
        editingMember
          ? `${FAMILY_MEMBERS_ENDPOINT}/${editingMember.id}`
          : FAMILY_MEMBERS_ENDPOINT,
        {
          method: editingMember ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member),
        }
      );
      const savedMember = await readApiResponse(response);
      const previousSpouseIds = new Set(editingMember?.spouseIds || []);
      const nextSpouseIds = new Set(savedMember.spouseIds || []);
      setMembers((currentMembers) => {
        const updatedMembers = editingMember
          ? currentMembers.map((currentMember) => {
              if (currentMember.id === savedMember.id) return savedMember;
              if (
                previousSpouseIds.has(currentMember.id) ||
                nextSpouseIds.has(currentMember.id)
              ) {
                const spouseIds = new Set(currentMember.spouseIds || []);
                if (previousSpouseIds.has(currentMember.id)) {
                  spouseIds.delete(savedMember.id);
                }
                if (nextSpouseIds.has(currentMember.id)) {
                  spouseIds.add(savedMember.id);
                }
                return { ...currentMember, spouseIds: [...spouseIds].sort() };
              }
              return currentMember;
            })
          : currentMembers.map((currentMember) =>
              nextSpouseIds.has(currentMember.id)
                ? {
                    ...currentMember,
                    spouseIds: [...new Set([...(currentMember.spouseIds || []), savedMember.id])].sort(),
                  }
                : currentMember
            );
        return editingMember ? updatedMembers : [...updatedMembers, savedMember];
      });
      setIsFormOpen(false);
    } catch (error) {
      console.error('Could not save family member through the API.', error);
      setApiError(
        `Could not ${editingMember ? 'update' : 'save'} family member. ${error.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function moveMember(index, offset) {
    if (search.trim() || isReorderingMembers) return;
    const destination = index + offset;
    if (destination < 0 || destination >= members.length) return;

    const previousMembers = members;
    const reorderedMembers = [...members];
    [reorderedMembers[index], reorderedMembers[destination]] = [
      reorderedMembers[destination],
      reorderedMembers[index],
    ];
    setMembers(reorderedMembers);
    setIsReorderingMembers(true);
    setApiError('');

    try {
      const response = await fetch(`${FAMILY_MEMBERS_ENDPOINT}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: reorderedMembers.map((member) => member.id) }),
      });
      const savedMembers = await readApiResponse(response);
      if (!Array.isArray(savedMembers)) {
        throw new Error('The server returned an unexpected family-members order response.');
      }
      setMembers(savedMembers);
    } catch (error) {
      console.error('Could not reorder family members through the API.', error);
      setMembers(previousMembers);
      setApiError(
        `Could not reorder family members. ${error.message || 'Check that the API and database are available.'}`
      );
    } finally {
      setIsReorderingMembers(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Shah Family home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-name">
            <strong>Shah Family</strong>
            <small>Our family space</small>
          </span>
        </a>

        <div className="sidebar-label">FAMILY</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${activePage === 'members' ? 'nav-item-active' : ''}`}
            type="button"
            aria-current={activePage === 'members' ? 'page' : undefined}
            onClick={() => setActivePage('members')}
          >
            <span className="nav-icon" aria-hidden="true">⌂</span>
            Family members
          </button>
          <button
            className={`nav-item ${activePage === 'graph' ? 'nav-item-active' : ''}`}
            type="button"
            aria-current={activePage === 'graph' ? 'page' : undefined}
            onClick={() => setActivePage('graph')}
          >
            <span className="nav-icon" aria-hidden="true">⌘</span>
            Family graph
          </button>
          <button
            className={`nav-item ${activePage === 'medical' ? 'nav-item-active' : ''}`}
            type="button"
            aria-current={activePage === 'medical' ? 'page' : undefined}
            onClick={() => setActivePage('medical')}
          >
            <span className="nav-icon" aria-hidden="true">✚</span>
            Medical reports
          </button>
          <div className="nav-group">
            <button
              className={`nav-item ${
                activePage === 'gifts' || activePage === 'charity' ? 'nav-item-active' : ''
              }`}
              type="button"
              aria-expanded={isLogsMenuOpen}
              aria-controls="logs-submenu"
              onClick={() => setIsLogsMenuOpen((isOpen) => !isOpen)}
            >
              <span className="nav-icon" aria-hidden="true">▤</span>
              Gifts & Giving
              <span className="nav-chevron" aria-hidden="true">
                {isLogsMenuOpen ? '⌃' : '⌄'}
              </span>
            </button>
            {isLogsMenuOpen && (
              <div className="nav-submenu" id="logs-submenu">
                <button
                  className={`nav-item nav-subitem ${
                    activePage === 'gifts' ? 'nav-item-active' : ''
                  }`}
                  type="button"
                  aria-current={activePage === 'gifts' ? 'page' : undefined}
                  onClick={() => setActivePage('gifts')}
                >
                  Gift log
                </button>
                <button
                  className={`nav-item nav-subitem ${
                    activePage === 'charity' ? 'nav-item-active' : ''
                  }`}
                  type="button"
                  aria-current={activePage === 'charity' ? 'page' : undefined}
                  onClick={() => setActivePage('charity')}
                >
                  Charity work
                </button>
              </div>
            )}
          </div>
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-note-icon" aria-hidden="true">✳</span>
          <strong>Made for your family</strong>
          <p>A special place to keep the people and moments you cherish.</p>
        </div>
        <div className="sidebar-footer">A little closer, wherever we are.</div>
      </aside>

      <main className="main-content" id={activePage}>
        <header className="topbar">
          <span className="breadcrumb">
            Family space <span>/</span>{' '}
            {activePage === 'members'
              ? 'Members'
              : activePage === 'graph'
                ? 'Family graph'
                : activePage === 'gifts'
                  ? 'Gift log'
                  : activePage === 'charity'
                    ? 'Charity work'
                    : 'Medical reports'}
          </span>
          <span className="privacy-label">
            <span className="privacy-dot" aria-hidden="true" />
            Private family space
          </span>
        </header>

        {activePage === 'members' ? (
        <section className="page-content">
          <div className="welcome-banner">
            <div className="welcome-copy">
              <span className="eyebrow">YOUR FAMILY, ALL IN ONE PLACE</span>
              <h1>Family members</h1>
              <p>Keep the important details of your family close at hand.</p>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <span className="art-sun" />
              <span className="art-person art-person-one">●</span>
              <span className="art-person art-person-two">●</span>
              <span className="art-person art-person-three">●</span>
              <span className="art-ground" />
              <span className="art-heart">♥</span>
            </div>
          </div>

          <div className="summary-row">
            <section className="summary-card" aria-label="Family member count">
              <span className="summary-icon" aria-hidden="true">♧</span>
              <div>
                <span className="summary-label">IN YOUR FAMILY</span>
                <strong className="summary-number">{members.length}</strong>
                <span className="summary-caption">
                  {members.length === 1 ? 'family member' : 'family members'}
                </span>
              </div>
            </section>
            <section className="summary-card summary-card-warm" aria-label="Birthday count">
              <span className="summary-icon summary-icon-warm" aria-hidden="true">♡</span>
              <div>
                <span className="summary-label">BIRTHDAYS SAVED</span>
                <strong className="summary-number">
                  {members.filter((member) => member.dateOfBirth).length}
                </strong>
                <span className="summary-caption">special dates to remember</span>
              </div>
            </section>
          </div>

          <section className="members-panel" aria-labelledby="members-heading">
            <div className="panel-heading">
              <div>
                <h2 id="members-heading">Your people</h2>
                <p>All the wonderful people in your family.</p>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={isReorderingMembers}
                onClick={() => openMemberForm()}
              >
                <span aria-hidden="true">＋</span> Add family member
              </button>
            </div>

            <div className="member-toolbar">
              <label className="search-box">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <span className="visually-hidden">Search family members</span>
                <input
                  type="search"
                  placeholder="Search by name or relationship..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <kbd>⌘ K</kbd>
              </label>
              <span className="member-count">
                {filteredMembers.length} {filteredMembers.length === 1 ? 'person' : 'people'}
              </span>
            </div>

            {apiError && (
              <div className="error-message" role="alert">
                <span>{apiError}</span>
                {isLoadError && !isLoading && (
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
              <div className="empty-state" role="status">
                <h3>Loading your family</h3>
                <p>Connecting to your family database…</p>
              </div>
            ) : isLoadError ? (
              <div className="empty-state">
                <h3>Family members are unavailable</h3>
                <p>Fix the connection and try again to load your family information.</p>
              </div>
            ) : filteredMembers.length > 0 ? (
              <div className="members-list">
                {filteredMembers.map((member, index) => (
                  <article className="member-row" key={member.id}>
                    <div className={`avatar avatar-${index % 5}`} aria-hidden="true">
                      {getInitials(member.firstName, member.lastName)}
                    </div>
                    <div className="member-name">
                      <strong>{member.firstName} {member.lastName}</strong>
                      <span>{member.relationship || 'Family member'}</span>
                    </div>
                    <div className="member-detail">
                      {(member.dateOfBirth ||
                        (member.gujaratiBirthdayMonth && member.gujaratiBirthdayTithi)) && (
                        <>
                          <span className="detail-label">BIRTHDAY</span>
                          {member.gujaratiBirthdayMonth && member.gujaratiBirthdayTithi && (
                            <span className="gujarati-birthday">
                              {member.gujaratiBirthdayMonth} · {member.gujaratiBirthdayPaksha}{' '}
                              {member.gujaratiBirthdayTithi}
                            </span>
                          )}
                          {member.dateOfBirth && (
                            <>
                              <span>{formatDate(member.dateOfBirth)}</span>
                              <span className="elapsed-years">
                                {formatElapsedYears(member.dateOfBirth, 'old')}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    <div className="member-detail">
                      {member.isDeceased &&
                        (member.dateOfDeath ||
                          (member.gujaratiDeathMonth && member.gujaratiDeathTithi)) && (
                          <>
                            <span className="detail-label">DEATH DATE</span>
                            {member.gujaratiDeathMonth && member.gujaratiDeathTithi && (
                              <span className="gujarati-birthday">
                                {member.gujaratiDeathMonth} · {member.gujaratiDeathPaksha}{' '}
                                {member.gujaratiDeathTithi}
                              </span>
                            )}
                            {member.dateOfDeath && (
                              <>
                                <span>{formatDate(member.dateOfDeath)}</span>
                                <span className="elapsed-years">
                                  {formatElapsedYears(member.dateOfDeath, 'ago')}
                                </span>
                              </>
                            )}
                          </>
                        )}
                    </div>
                    <div className="member-detail">
                      {(member.anniversaryDate ||
                        (member.gujaratiAnniversaryMonth &&
                          member.gujaratiAnniversaryTithi)) && (
                        <>
                          <span className="detail-label">WEDDING ANNIVERSARY</span>
                          {member.gujaratiAnniversaryMonth &&
                            member.gujaratiAnniversaryTithi && (
                              <span className="gujarati-birthday">
                                {member.gujaratiAnniversaryMonth} ·{' '}
                                {member.gujaratiAnniversaryPaksha}{' '}
                                {member.gujaratiAnniversaryTithi}
                              </span>
                            )}
                          {member.anniversaryDate && (
                            <>
                              <span>{formatDate(member.anniversaryDate)}</span>
                              <span className="elapsed-years">
                                {formatElapsedYears(member.anniversaryDate, 'married')}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    <div className="member-detail member-contact">
                      <span className="detail-label">CONTACT</span>
                      <span>{member.phone || member.email || '—'}</span>
                    </div>
                    <div className="member-actions">
                      <button
                        className="member-move-button"
                        type="button"
                        aria-label={`Move ${member.firstName} ${member.lastName || ''} up`}
                        title={search.trim() ? 'Clear search to reorder the full list' : 'Move up'}
                        disabled={
                          isReorderingMembers || Boolean(search.trim()) || index === 0
                        }
                        onClick={() => moveMember(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="member-move-button"
                        type="button"
                        aria-label={`Move ${member.firstName} ${member.lastName || ''} down`}
                        title={
                          search.trim()
                            ? 'Clear search to reorder the full list'
                            : 'Move down'
                        }
                        disabled={
                          isReorderingMembers ||
                          Boolean(search.trim()) ||
                          index === filteredMembers.length - 1
                        }
                        onClick={() => moveMember(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="member-edit-button"
                        type="button"
                        disabled={isReorderingMembers}
                        aria-label={`Edit ${member.firstName} ${member.lastName || ''}`.trim()}
                        onClick={() => openMemberForm(member)}
                      >
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="empty-circle empty-circle-one" />
                  <span className="empty-circle empty-circle-two" />
                  <span className="empty-circle empty-circle-three" />
                  <span className="empty-base" />
                  <span className="empty-sparkle">✳</span>
                </div>
                <h3>{search ? 'No family members found' : 'Your family story starts here'}</h3>
                <p>
                  {search
                    ? 'Try another name or relationship.'
                    : 'Add someone special to start building your family space.'}
                </p>
                {!search && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openMemberForm()}
                  >
                    <span aria-hidden="true">＋</span> Add your first member
                  </button>
                )}
              </div>
            )}

            <p className="storage-note">
              <span aria-hidden="true">ⓘ</span>
              Family information is saved to your connected database.
            </p>
          </section>
        </section>
        ) : activePage === 'graph' ? (
          <FamilyGraph
            members={members}
            isLoading={isLoading}
            isLoadError={isLoadError}
            onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
            onManageMembers={() => setActivePage('members')}
          />
        ) : activePage === 'gifts' ? (
          <GiftLog />
        ) : activePage === 'charity' ? (
          <CharityLog />
        ) : (
          <MedicalReports />
        )}
      </main>

      {isFormOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsFormOpen(false);
          }}
        >
          <section
            className="member-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-heading"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingMember ? 'KEEP FAMILY DETAILS UP TO DATE' : 'GROW YOUR FAMILY SPACE'}
                </span>
                <h2 id="form-heading">
                  {editingMember ? 'Edit family member' : 'Add a family member'}
                </h2>
                <p>
                  {editingMember
                    ? 'Update this person’s information and save your changes.'
                    : 'Start with the basics. You can add more details later.'}
                </p>
              </div>
              <button
                className="close-button"
                type="button"
                aria-label="Close form"
                onClick={() => setIsFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form noValidate onSubmit={saveMember}>
              <div className="form-grid">
                <label>
                  First name <span className="required-mark">*</span>
                  <input
                    name="firstName"
                    autoFocus
                    required
                    maxLength="100"
                    defaultValue={editingMember?.firstName || ''}
                    aria-invalid={Boolean(validationErrors.firstName)}
                    aria-describedby={validationErrors.firstName ? 'firstName-error' : undefined}
                  />
                  {validationErrors.firstName && (
                    <span className="field-error" id="firstName-error">
                      {validationErrors.firstName}
                    </span>
                  )}
                </label>
                <label>
                  Last name
                  <input
                    name="lastName"
                    maxLength="100"
                    defaultValue={editingMember?.lastName || ''}
                    aria-invalid={Boolean(validationErrors.lastName)}
                    aria-describedby={validationErrors.lastName ? 'lastName-error' : undefined}
                  />
                  {validationErrors.lastName && (
                    <span className="field-error" id="lastName-error">
                      {validationErrors.lastName}
                    </span>
                  )}
                </label>
                <label>
                  Relationship
                  <select
                    name="relationship"
                    defaultValue={editingMember?.relationship || ''}
                    aria-invalid={Boolean(validationErrors.relationship)}
                    aria-describedby={validationErrors.relationship ? 'relationship-error' : undefined}
                  >
                    <option value="">Choose relationship</option>
                    <option>Self</option>
                    <option>Parent</option>
                    <option>Father</option>
                    <option>Mother</option>
                    <option>Spouse</option>
                    <option>Child</option>
                    <option>Son</option>
                    <option>Daughter</option>
                    <option>Sibling</option>
                    <option>Brother</option>
                    <option>Sister</option>
                    <option>Father-in-law</option>
                    <option>Mother-in-law</option>
                    <option>Brother-in-law</option>
                    <option>Sister-in-law</option>
                    <option>Son-in-law</option>
                    <option>Daughter-in-law</option>
                    <option>Grandparent</option>
                    <option>Grandfather</option>
                    <option>Grandmother</option>
                    <option>Grandchild</option>
                    <option>Grandson</option>
                    <option>Granddaughter</option>
                    <option>Aunt / Uncle</option>
                    <option>Aunt</option>
                    <option>Uncle</option>
                    <option>Niece</option>
                    <option>Nephew</option>
                    <option>Cousin</option>
                    <option>Other</option>
                  </select>
                  {validationErrors.relationship && (
                    <span className="field-error" id="relationship-error">
                      {validationErrors.relationship}
                    </span>
                  )}
                </label>
                <label>
                  Gender
                  <select
                    name="gender"
                    defaultValue={editingMember?.gender || ''}
                    aria-invalid={Boolean(validationErrors.gender)}
                    aria-describedby={validationErrors.gender ? 'gender-error' : undefined}
                  >
                    <option value="">Prefer not to say</option>
                    <option>Female</option>
                    <option>Male</option>
                    <option>Non-binary</option>
                    <option>Self-describe</option>
                  </select>
                  {validationErrors.gender && (
                    <span className="field-error" id="gender-error">
                      {validationErrors.gender}
                    </span>
                  )}
                </label>
                {relationshipCandidates.length > 0 && (
                  <>
                    <fieldset className="member-link-picker form-full-width">
                      <legend>Parents</legend>
                      <p>Select the family members who are this person’s parents.</p>
                      <div className="member-link-options">
                        {relationshipCandidates.map((member) => (
                          <label key={member.id}>
                            <input
                              type="checkbox"
                              name="parentIds"
                              value={member.id}
                              defaultChecked={(editingMember?.parentIds || []).includes(
                                member.id
                              )}
                            />
                            {`${member.firstName} ${member.lastName || ''}`.trim()}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="member-link-picker form-full-width">
                      <legend>Spouse(s)</legend>
                      <p>Select this person’s spouse or spouses, if applicable.</p>
                      <div className="member-link-options">
                        {relationshipCandidates.map((member) => (
                          <label key={member.id}>
                            <input
                              type="checkbox"
                              name="spouseIds"
                              value={member.id}
                              defaultChecked={(editingMember?.spouseIds || []).includes(
                                member.id
                              )}
                            />
                            {`${member.firstName} ${member.lastName || ''}`.trim()}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}
                <label>
                  Birthday
                  <input
                    name="dateOfBirth"
                    type="date"
                    max={getLocalDateString()}
                    defaultValue={editingMember?.dateOfBirth || ''}
                    aria-invalid={Boolean(validationErrors.dateOfBirth)}
                    aria-describedby={validationErrors.dateOfBirth ? 'dateOfBirth-error' : undefined}
                  />
                  {validationErrors.dateOfBirth && (
                    <span className="field-error" id="dateOfBirth-error">
                      {validationErrors.dateOfBirth}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati birthday month
                  <select
                    name="gujaratiBirthdayMonth"
                    defaultValue={editingMember?.gujaratiBirthdayMonth || ''}
                    aria-invalid={Boolean(validationErrors.gujaratiBirthdayMonth)}
                    aria-describedby={
                      validationErrors.gujaratiBirthdayMonth
                        ? 'gujaratiBirthdayMonth-error'
                        : undefined
                    }
                  >
                    <option value="">Choose month</option>
                    {GUJARATI_BIRTHDAY_MONTHS.map((month) => (
                      <option key={month}>{month}</option>
                    ))}
                  </select>
                  {validationErrors.gujaratiBirthdayMonth && (
                    <span className="field-error" id="gujaratiBirthdayMonth-error">
                      {validationErrors.gujaratiBirthdayMonth}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati birthday paksha
                  <select
                    name="gujaratiBirthdayPaksha"
                    value={selectedPaksha}
                    onChange={(event) => {
                      const paksha = event.target.value;
                      setSelectedPaksha(paksha);
                      setSelectedTithi((tithi) =>
                        (tithi === 'Poonam' && paksha !== 'Sud') ||
                        (tithi === 'Amas' && paksha !== 'Vad')
                          ? ''
                          : tithi
                      );
                    }}
                    aria-invalid={Boolean(validationErrors.gujaratiBirthdayPaksha)}
                    aria-describedby={
                      validationErrors.gujaratiBirthdayPaksha
                        ? 'gujaratiBirthdayPaksha-error'
                        : undefined
                    }
                  >
                    <option value="">Choose paksha</option>
                    <option value="Sud">Sud</option>
                    <option value="Vad">Vad</option>
                  </select>
                  {validationErrors.gujaratiBirthdayPaksha && (
                    <span className="field-error" id="gujaratiBirthdayPaksha-error">
                      {validationErrors.gujaratiBirthdayPaksha}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati birthday tithi
                  <select
                    name="gujaratiBirthdayTithi"
                    value={selectedTithi}
                    onChange={(event) => setSelectedTithi(event.target.value)}
                    aria-invalid={Boolean(validationErrors.gujaratiBirthdayTithi)}
                    aria-describedby={
                      validationErrors.gujaratiBirthdayTithi
                        ? 'gujaratiBirthdayTithi-error'
                        : undefined
                    }
                  >
                    <option value="">Choose tithi</option>
                    {availableTithis.map((tithi) => (
                      <option key={tithi}>{tithi}</option>
                    ))}
                  </select>
                  {validationErrors.gujaratiBirthdayTithi && (
                    <span className="field-error" id="gujaratiBirthdayTithi-error">
                      {validationErrors.gujaratiBirthdayTithi}
                    </span>
                  )}
                </label>
                <label>
                  Wedding Anniversary
                  <input
                    name="anniversaryDate"
                    type="date"
                    defaultValue={editingMember?.anniversaryDate || ''}
                    aria-invalid={Boolean(validationErrors.anniversaryDate)}
                    aria-describedby={validationErrors.anniversaryDate ? 'anniversaryDate-error' : undefined}
                  />
                  {validationErrors.anniversaryDate && (
                    <span className="field-error" id="anniversaryDate-error">
                      {validationErrors.anniversaryDate}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati wedding anniversary month
                  <select
                    name="gujaratiAnniversaryMonth"
                    defaultValue={editingMember?.gujaratiAnniversaryMonth || ''}
                    aria-invalid={Boolean(validationErrors.gujaratiAnniversaryMonth)}
                    aria-describedby={
                      validationErrors.gujaratiAnniversaryMonth
                        ? 'gujaratiAnniversaryMonth-error'
                        : undefined
                    }
                  >
                    <option value="">Choose month</option>
                    {GUJARATI_BIRTHDAY_MONTHS.map((month) => (
                      <option key={month}>{month}</option>
                    ))}
                  </select>
                  {validationErrors.gujaratiAnniversaryMonth && (
                    <span
                      className="field-error"
                      id="gujaratiAnniversaryMonth-error"
                    >
                      {validationErrors.gujaratiAnniversaryMonth}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati wedding anniversary paksha
                  <select
                    name="gujaratiAnniversaryPaksha"
                    value={selectedAnniversaryPaksha}
                    onChange={(event) => {
                      const paksha = event.target.value;
                      setSelectedAnniversaryPaksha(paksha);
                      setSelectedAnniversaryTithi((tithi) =>
                        (tithi === 'Poonam' && paksha !== 'Sud') ||
                        (tithi === 'Amas' && paksha !== 'Vad')
                          ? ''
                          : tithi
                      );
                    }}
                    aria-invalid={Boolean(validationErrors.gujaratiAnniversaryPaksha)}
                    aria-describedby={
                      validationErrors.gujaratiAnniversaryPaksha
                        ? 'gujaratiAnniversaryPaksha-error'
                        : undefined
                    }
                  >
                    <option value="">Choose paksha</option>
                    <option value="Sud">Sud</option>
                    <option value="Vad">Vad</option>
                  </select>
                  {validationErrors.gujaratiAnniversaryPaksha && (
                    <span
                      className="field-error"
                      id="gujaratiAnniversaryPaksha-error"
                    >
                      {validationErrors.gujaratiAnniversaryPaksha}
                    </span>
                  )}
                </label>
                <label>
                  Gujarati wedding anniversary tithi
                  <select
                    name="gujaratiAnniversaryTithi"
                    value={selectedAnniversaryTithi}
                    onChange={(event) =>
                      setSelectedAnniversaryTithi(event.target.value)
                    }
                    aria-invalid={Boolean(validationErrors.gujaratiAnniversaryTithi)}
                    aria-describedby={
                      validationErrors.gujaratiAnniversaryTithi
                        ? 'gujaratiAnniversaryTithi-error'
                        : undefined
                    }
                  >
                    <option value="">Choose tithi</option>
                    {availableAnniversaryTithis.map((tithi) => (
                      <option key={tithi}>{tithi}</option>
                    ))}
                  </select>
                  {validationErrors.gujaratiAnniversaryTithi && (
                    <span
                      className="field-error"
                      id="gujaratiAnniversaryTithi-error"
                    >
                      {validationErrors.gujaratiAnniversaryTithi}
                    </span>
                  )}
                </label>
                <label className="deceased-toggle form-full-width">
                  <input
                    name="isDeceased"
                    type="checkbox"
                    checked={isDeceased}
                    onChange={(event) => setIsDeceased(event.target.checked)}
                  />
                  This person has passed away
                </label>
                <fieldset
                  className="death-details form-full-width"
                  hidden={!isDeceased}
                >
                    <legend>Death details</legend>
                    <div className="death-fields">
                      <label>
                        Date of death
                        <input
                          name="dateOfDeath"
                          type="date"
                          max={getLocalDateString()}
                          defaultValue={editingMember?.dateOfDeath || ''}
                          aria-invalid={Boolean(validationErrors.dateOfDeath)}
                          aria-describedby={
                            validationErrors.dateOfDeath ? 'dateOfDeath-error' : undefined
                          }
                        />
                        {validationErrors.dateOfDeath && (
                          <span className="field-error" id="dateOfDeath-error">
                            {validationErrors.dateOfDeath}
                          </span>
                        )}
                      </label>
                      <label>
                        Gujarati death month
                        <select
                          name="gujaratiDeathMonth"
                          defaultValue={editingMember?.gujaratiDeathMonth || ''}
                          aria-invalid={Boolean(validationErrors.gujaratiDeathMonth)}
                          aria-describedby={
                            validationErrors.gujaratiDeathMonth
                              ? 'gujaratiDeathMonth-error'
                              : undefined
                          }
                        >
                          <option value="">Choose month</option>
                          {GUJARATI_BIRTHDAY_MONTHS.map((month) => (
                            <option key={month}>{month}</option>
                          ))}
                        </select>
                        {validationErrors.gujaratiDeathMonth && (
                          <span className="field-error" id="gujaratiDeathMonth-error">
                            {validationErrors.gujaratiDeathMonth}
                          </span>
                        )}
                      </label>
                      <label>
                        Gujarati death paksha
                        <select
                          name="gujaratiDeathPaksha"
                          value={selectedDeathPaksha}
                          onChange={(event) => {
                            const paksha = event.target.value;
                            setSelectedDeathPaksha(paksha);
                            setSelectedDeathTithi((tithi) =>
                              (tithi === 'Poonam' && paksha !== 'Sud') ||
                              (tithi === 'Amas' && paksha !== 'Vad')
                                ? ''
                                : tithi
                            );
                          }}
                          aria-invalid={Boolean(validationErrors.gujaratiDeathPaksha)}
                          aria-describedby={
                            validationErrors.gujaratiDeathPaksha
                              ? 'gujaratiDeathPaksha-error'
                              : undefined
                          }
                        >
                          <option value="">Choose paksha</option>
                          <option value="Sud">Sud</option>
                          <option value="Vad">Vad</option>
                        </select>
                        {validationErrors.gujaratiDeathPaksha && (
                          <span className="field-error" id="gujaratiDeathPaksha-error">
                            {validationErrors.gujaratiDeathPaksha}
                          </span>
                        )}
                      </label>
                      <label>
                        Gujarati death tithi
                        <select
                          name="gujaratiDeathTithi"
                          value={selectedDeathTithi}
                          onChange={(event) => setSelectedDeathTithi(event.target.value)}
                          aria-invalid={Boolean(validationErrors.gujaratiDeathTithi)}
                          aria-describedby={
                            validationErrors.gujaratiDeathTithi
                              ? 'gujaratiDeathTithi-error'
                              : undefined
                          }
                        >
                          <option value="">Choose tithi</option>
                          {(selectedDeathPaksha
                            ? [
                                ...GUJARATI_TITHI_NAMES,
                                selectedDeathPaksha === 'Sud' ? 'Poonam' : 'Amas',
                              ]
                            : []
                          ).map((tithi) => (
                            <option key={tithi}>{tithi}</option>
                          ))}
                        </select>
                        {validationErrors.gujaratiDeathTithi && (
                          <span className="field-error" id="gujaratiDeathTithi-error">
                            {validationErrors.gujaratiDeathTithi}
                          </span>
                        )}
                      </label>
                    </div>
                </fieldset>
                <label>
                  Country
                  <select
                    name="country"
                    value={selectedCountry}
                    onChange={(event) => setSelectedCountry(event.target.value)}
                    aria-invalid={Boolean(validationErrors.country)}
                    aria-describedby={validationErrors.country ? 'country-error' : undefined}
                  >
                    <option value="">Choose country</option>
                    {COUNTRIES.map((country) => (
                      <option key={country.value} value={country.value}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                  {validationErrors.country && (
                    <span className="field-error" id="country-error">
                      {validationErrors.country}
                    </span>
                  )}
                </label>
                <div className="phone-field">
                  <span className="phone-field-title">Phone</span>
                  <div className="phone-inputs">
                    <label>
                      Country code
                      <input
                        type="text"
                        aria-label="Country code"
                        readOnly
                        value={
                          COUNTRIES.find(({ value }) => value === selectedCountry)
                            ?.dialingCode || ''
                        }
                        placeholder="Code"
                      />
                    </label>
                    <label>
                      Phone number
                      <input
                        name="phoneNumber"
                        type="tel"
                        autoComplete="tel-national"
                        maxLength="30"
                        defaultValue={editingPhone.phoneNumber}
                        aria-invalid={Boolean(validationErrors.phone)}
                        aria-describedby={validationErrors.phone ? 'phone-error' : undefined}
                      />
                    </label>
                  </div>
                  {validationErrors.phone && (
                    <span className="field-error" id="phone-error">
                      {validationErrors.phone}
                    </span>
                  )}
                </div>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength="255"
                    defaultValue={editingMember?.email || ''}
                    aria-invalid={Boolean(validationErrors.email)}
                    aria-describedby={validationErrors.email ? 'email-error' : undefined}
                  />
                  {validationErrors.email && (
                    <span className="field-error" id="email-error">
                      {validationErrors.email}
                    </span>
                  )}
                </label>
                <label className="form-full-width">
                  Address
                  <input
                    name="address"
                    autoComplete="street-address"
                    maxLength="255"
                    defaultValue={editingMember?.address || ''}
                    aria-invalid={Boolean(validationErrors.address)}
                    aria-describedby={validationErrors.address ? 'address-error' : undefined}
                  />
                  {validationErrors.address && (
                    <span className="field-error" id="address-error">
                      {validationErrors.address}
                    </span>
                  )}
                </label>
              </div>
              <div className="form-actions">
                <button
                  className="cancel-button"
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  {isSaving
                    ? 'Saving…'
                    : editingMember ? 'Save changes' : 'Save family member'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
