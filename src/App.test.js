import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App, { UpcomingEvent } from './App';

const savedMember = {
  id: 1,
  firstName: 'Asha',
  lastName: 'Shah',
  relationship: 'Self',
  gender: '',
  dateOfBirth: '',
  isDeceased: false,
  dateOfDeath: '',
  gujaratiBirthdayMonth: '',
  gujaratiBirthdayPaksha: '',
  gujaratiBirthdayTithi: '',
  gujaratiDeathMonth: '',
  gujaratiDeathPaksha: '',
  gujaratiDeathTithi: '',
  anniversaryDate: '',
  gujaratiAnniversaryMonth: '',
  gujaratiAnniversaryPaksha: '',
  gujaratiAnniversaryTithi: '',
  phone: '',
  email: '',
  address: '',
  parentIds: [],
  spouseIds: [],
};

function apiResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

function authenticatedResponse() {
  return apiResponse({ user: { id: 1, email: 'admin@example.com', role: 'super_admin' } });
}

function dateFromToday(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

beforeEach(() => {
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? authenticatedResponse() : apiResponse([])
    )
  );
});

afterEach(() => {
  jest.resetAllMocks();
});

async function renderOnFamilyMembers() {
  const app = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Family', exact: true }));
  return app;
}

test('switches between family members, family graph, and important dates', async () => {
  global.fetch = jest.fn((url) => Promise.resolve(
    url === '/api/auth/me' ? authenticatedResponse() :
      url === '/api/family-members' ? apiResponse([{ ...savedMember, dateOfBirth: '2000-02-29' }]) :
        apiResponse([])
  ));
  await renderOnFamilyMembers();
  fireEvent.click(screen.getByRole('button', { name: 'Family graph' }));
  expect(screen.getByRole('button', { name: 'Family graph' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('region', { name: 'Family graph' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Important dates' }));
  expect(await screen.findByText("Asha Shah's birthday")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add important date/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Family members', exact: true }));
  expect(screen.getByRole('heading', { name: 'Your people' })).toBeInTheDocument();
});

test('shows the family member empty state after loading members from the API', async () => {
  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Your family, all in one place.' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Family', exact: true }));
  expect(
    await screen.findByRole('heading', { name: /your family story starts here/i })
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Select family workspace')).not.toBeInTheDocument();
  expect(screen.getByText('Super admin')).toBeInTheDocument();
  const userAccountsButton = screen.getByRole('button', { name: 'User accounts' });
  const familyMenuButton = screen.getByRole('button', { name: 'Family', exact: true });
  expect(
    userAccountsButton.compareDocumentPosition(familyMenuButton) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  const familyTabs = screen.getByRole('navigation', { name: 'Family sections' });
  expect(
    within(familyTabs).getByRole('button', { name: 'Family members' })
  ).toBeInTheDocument();
  expect(
    within(familyTabs).getByRole('button', { name: 'Family graph' })
  ).toBeInTheDocument();
  expect(within(familyTabs).getByRole('button', { name: 'Important dates' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /add your first member/i })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/family-members');
});

test('shows and updates the family name and theme from settings', async () => {
  const user = {
    id: 1,
    email: 'admin@example.com',
    role: 'super_admin',
    workspaceId: 1,
    currentWorkspaceId: 1,
    familyName: 'Shah Family',
    theme: 'ocean',
  };
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/auth/me') return Promise.resolve(apiResponse({ user }));
    if (url === '/api/super-admin/workspaces/1' && options?.method === 'PUT') {
      return Promise.resolve(apiResponse({
        id: 1,
        familyName: 'Another Family',
        theme: 'lavender',
      }));
    }
    return Promise.resolve(apiResponse([]));
  });

  render(<App />);

  expect(await screen.findByLabelText('Shah Family introduction')).toBeInTheDocument();
  expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'ocean');

  fireEvent.click(screen.getByRole('button', { name: 'User accounts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByLabelText('Family name'), {
    target: { value: 'Another Family' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Lavender' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save family appearance' }));
  expect(await screen.findByLabelText('Another Family introduction')).toBeInTheDocument();
  expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'lavender');
});

test('opens introduction from the logo and explains account module access', async () => {
  const user = {
    id: 2,
    email: 'family@example.com',
    role: 'user',
    familyName: 'Patel Family',
    accessPages: ['family'],
  };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([savedMember])
    )
  );
  render(<App />);

  fireEvent.click(await screen.findByLabelText('Patel Family introduction'));

  expect(
    await screen.findByRole('heading', { name: 'Your family, all in one place.' })
  ).toBeInTheDocument();
  expect(screen.getByText('Family members & tree')).toBeInTheDocument();
  expect(screen.getByText('Family members & tree').parentElement)
    .toHaveTextContent('Available');
  expect(screen.getByText('Medical reports').parentElement)
    .toHaveTextContent('Ask your super admin');
  expect(screen.getByText('Gift').parentElement)
    .toHaveTextContent('Ask your super admin');
  expect(screen.getByText('Charity').parentElement)
    .toHaveTextContent('Ask your super admin');
  expect(screen.getByText('Family members & tree').closest('.introduction-module-column'))
    .toHaveAttribute('aria-label', 'Available sections');
  expect(screen.getByText('Medical reports').closest('.introduction-module-column'))
    .toHaveAttribute('aria-label', 'Sections to request');
  expect(screen.getByText(/Ask your super admin to enable the section you need/i))
    .toBeInTheDocument();
});

test('shows super admins that they manage module access themselves', async () => {
  const user = {
    id: 1,
    email: 'root@example.com',
    role: 'super_admin',
    accessPages: ['family', 'medical', 'gifts', 'charity'],
  };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([])
    )
  );
  render(<App />);

  expect(await screen.findByText('You manage module access for the accounts in your family tree.'))
    .toBeInTheDocument();
  expect(screen.queryByText('Ask for access')).not.toBeInTheDocument();
  expect(screen.queryByText('Ask your super admin')).not.toBeInTheDocument();
});

test('lets admins view family information without edit controls', async () => {
  const adminUser = {
    id: 8,
    email: 'admin@example.com',
    role: 'admin',
    accessPages: ['family'],
  };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me'
        ? apiResponse({ user: adminUser })
        : url === '/api/family-members'
          ? apiResponse([savedMember])
          : apiResponse([])
    )
  );

  await renderOnFamilyMembers();

  expect(await screen.findByText('Asha Shah')).toBeInTheDocument();
  expect(screen.getByText('Only a super administrator can change family information.'))
    .toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add family member/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit Asha Shah' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Asha Shah' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Family graph' }));
  fireEvent.click(screen.getByRole('button', { name: 'View family members' }));
  expect(screen.getByRole('heading', { name: 'Your people' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Important dates' }));
  expect(await screen.findByRole('heading', { name: 'Important dates' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add important date/i })).not.toBeInTheDocument();
});

test('requires a login before opening the family space', async () => {
  const user = { id: 2, email: 'family@example.com', role: 'user' };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me'
        ? apiResponse({ error: 'Authentication is required.' }, 401)
        : url === '/api/auth/login'
          ? apiResponse({ user })
          : apiResponse([])
    )
  );

  render(<App />);
  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'family@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'a-secure-family-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(
    await screen.findByRole('button', { name: 'Family', exact: true })
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'User accounts' })).not.toBeInTheDocument();
});

test('returns to sign in when the backend session expires', async () => {
  const user = { id: 2, email: 'family@example.com', role: 'user' };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me'
        ? apiResponse({ user })
        : apiResponse({ error: 'Authentication is required.' }, 401)
    )
  );

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Your family, all in one place.' })
  ).toBeInTheDocument();
  act(() => {
    window.dispatchEvent(new Event('shah-family-session-expired'));
  });
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
});

test('shows only pages granted to a regular user', async () => {
  const user = {
    id: 2,
    email: 'family@example.com',
    role: 'user',
    accessPages: ['medical'],
  };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([])
    )
  );

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Your family, all in one place.' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /medical reports/i }));
  expect(await screen.findByRole('heading', { name: 'Medical reports' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Family', exact: true })
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Gifts & Giving' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Notes & Reminders' })).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith('/api/family-members');
});

test('opens notes for a super admin and loads its data', async () => {
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me'
        ? authenticatedResponse()
        : url === '/api/notes'
          ? apiResponse([{ id: 1, title: 'Family plans', content: 'Hello', tags: [], is_pinned: false, updated_at: '2026-01-01' }])
          : apiResponse([])
    )
  );
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Notes & Reminders' }));
  expect(await screen.findByRole('heading', { name: 'Family plans' })).toBeInTheDocument();
});

test('shows notes navigation only when granted and opens it for a notes-only user', async () => {
  const user = { id: 2, email: 'family@example.com', role: 'user', accessPages: ['notes'] };
  global.fetch = jest.fn((url) =>
    Promise.resolve(url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([]))
  );
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Open your family space' }));
  expect(await screen.findByRole('heading', { name: 'Notes & Reminders' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Notes & Reminders' })).toBeInTheDocument();
  expect(await screen.findByText('No notes yet. Create one to get started!')).toBeInTheDocument();
});

test('reports a failed note save instead of closing the form', async () => {
  global.fetch = jest.fn((url, options) =>
    Promise.resolve(
      url === '/api/auth/me' ? authenticatedResponse()
        : url === '/api/notes' && options?.method === 'POST'
          ? apiResponse({ error: 'Could not save note.' }, 503)
          : apiResponse([])
    )
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Notes & Reminders' }));
  await screen.findByText('No notes yet. Create one to get started!');
  fireEvent.click(screen.getByRole('button', { name: '+ New Note' }));
  fireEvent.change(screen.getByPlaceholderText('Note title'), { target: { value: 'Plans' } });
  expect(await screen.findByText('Failed to save note: Could not save note.', {}, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Note title')).toHaveValue('Plans');
  expect(global.fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }));
});

test('keeps unsaved note edits when navigating away fails', async () => {
  const note = { id: 1, title: 'Plans', content: 'Before', tags: [], is_pinned: false, updated_at: '2026-01-01' };
  global.fetch = jest.fn((url, options) => Promise.resolve(
    url === '/api/auth/me' ? authenticatedResponse()
      : url === '/api/notes/1' && options?.method === 'PUT'
        ? apiResponse({ error: 'Could not save note.' }, 503)
        : url === '/api/notes' ? apiResponse([note]) : apiResponse([])
  ));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Notes & Reminders' }));
  await screen.findByRole('heading', { name: 'Plans' });
  fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }));
  const content = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.click(content);
  fireEvent.click(screen.getByLabelText('Text formatting'));
  fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
  fireEvent.click(screen.getByRole('button', { name: 'Family', exact: true }));
  expect(await screen.findByText('Failed to save note: Could not save note.')).toBeInTheDocument();
  expect(within(content).getByRole('heading', { name: 'Before' })).toBeInTheDocument();
});

test('shows only the gifts and charity modules granted to a regular user', async () => {
  const user = {
    id: 2,
    email: 'family@example.com',
    role: 'user',
    accessPages: ['gifts'],
  };
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([])
    )
  );

  render(<App />);

  const menuButton = await screen.findByRole('button', { name: /gifts & giving/i });
  fireEvent.click(menuButton);
  expect(await screen.findByRole('button', { name: 'Gift' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Charity' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /record charity/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Family', exact: true })).not.toBeInTheDocument();
  expect(await screen.findByRole('region', { name: 'Gift' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith('/api/charity-records');
});

test('opens charity directly when it is the only giving section granted', async () => {
  const user = { id: 2, email: 'family@example.com', role: 'user', accessPages: ['charity'] };
  global.fetch = jest.fn((url) => Promise.resolve(
    url === '/api/auth/me' ? apiResponse({ user }) : apiResponse([])
  ));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Gifts & Giving' }));
  expect(await screen.findByRole('region', { name: 'Charity' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Charity' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Gift' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /record a gift/i })).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith('/api/gifts');
});

test('shows the next upcoming birthday or wedding anniversary', async () => {
  const tomorrow = dateFromToday(1);
  const members = [
      {
        ...savedMember,
        firstName: 'Rohan',
        dateOfBirth: tomorrow,
        anniversaryDate: tomorrow,
      },
      {
        ...savedMember,
        id: 2,
        firstName: 'Asha',
        dateOfBirth: tomorrow,
      },
    ];
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === '/api/auth/me' ? authenticatedResponse() : apiResponse(members)
    )
  );

  await renderOnFamilyMembers();

  await screen.findByText(
    'Birthday: Asha Shah & Rohan Shah · Wedding anniversary: Rohan Shah'
  );
  const upcomingCelebration = screen.getByRole('region', {
    name: 'Upcoming event',
  });
  const formattedDate = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${tomorrow}T00:00:00Z`));
  expect(upcomingCelebration).toHaveTextContent(formattedDate);
  expect(upcomingCelebration).toHaveTextContent(/\d+d \d+h \d+m \d{2}s/);
  expect(upcomingCelebration).toHaveTextContent(
    'Birthday: Asha Shah & Rohan Shah · Wedding anniversary: Rohan Shah'
  );
});

test('updates the upcoming event countdown every second', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));

  try {
    render(
      <UpcomingEvent
        members={[{ ...savedMember, dateOfBirth: '2026-01-02' }]}
      />
    );

    const upcomingEvent = screen.getByRole('region', { name: 'Upcoming event' });
    expect(upcomingEvent).toHaveTextContent('1d 0h 0m 00s');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(upcomingEvent).toHaveTextContent('0d 23h 59m 59s');
  } finally {
    jest.useRealTimers();
  }
});

test('moves a family member and saves the reordered sequence', async () => {
  const firstMember = { ...savedMember, id: 1, firstName: 'Asha' };
  const secondMember = { ...savedMember, id: 2, firstName: 'Rohan' };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([firstMember, secondMember]))
    .mockResolvedValueOnce(apiResponse([secondMember, firstMember]));

  const { container } = await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: 'Move Rohan Shah up' }));

  await waitFor(() =>
    expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [2, 1] }),
    })
  );
  await waitFor(() => {
    const names = [...container.querySelectorAll('.member-name strong')].map(
      (memberName) => memberName.textContent
    );
    expect(names).toEqual(['Rohan Shah', 'Asha Shah']);
  });
});

test('opens gifts from the main navigation', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /gifts & giving/i }));

  expect(
    await screen.findByRole('heading', { name: 'Gifts by person' })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Gift' })).toHaveAttribute('aria-pressed', 'true');
  expect(global.fetch).toHaveBeenCalledWith('/api/gifts');
});

test('opens the charity section from the main navigation', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /gifts & giving/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Charity' }));

  expect(
    await screen.findByRole('heading', { name: 'All charity records' })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Charity' })).toHaveAttribute('aria-pressed', 'true');
  expect(global.fetch).toHaveBeenCalledWith('/api/charity-records');
  fireEvent.click(screen.getByRole('button', { name: 'Gift' }));
  expect(await screen.findByRole('heading', { name: 'Gifts by person' })).toBeInTheDocument();
});

test('record buttons stay in the giving header and open the correct section', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Gifts & Giving' }));
  await screen.findByText('No gifts logged yet');
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/charity-records'));
  const header = screen.getByRole('heading', { name: 'Gifts & Giving' }).closest('header');
  const giftButton = within(header).getByRole('button', { name: /record a gift/i });
  const charityButton = within(header).getByRole('button', { name: /record charity/i });

  charityButton.focus();
  fireEvent.click(charityButton);
  expect(screen.getByRole('button', { name: 'Charity', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog', { name: 'Record charity' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(charityButton).toHaveFocus();

  giftButton.focus();
  fireEvent.click(giftButton);
  expect(screen.getByRole('button', { name: 'Gift' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog', { name: 'Record a gift' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(giftButton).toHaveFocus();
});

test('opens medical reports and displays only the redacted summary', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /medical reports/i }));

  expect(
    await screen.findByRole('heading', { name: 'Medical reports' })
  ).toBeInTheDocument();
  expect(screen.getByText('Normal spirometry. No significant bronchodilator response.'))
    .toBeInTheDocument();
  expect(screen.getByText(/numerical measurements were omitted/i)).toBeInTheDocument();
  expect(screen.queryByText(/patient code|date of birth/i)).not.toBeInTheDocument();
});

test('shows connected family members by generation in the family graph', async () => {
  const spouse = {
    ...savedMember,
    id: 2,
    firstName: 'Rohan',
    relationship: 'Spouse',
    spouseIds: [1],
  };
  const child = {
    ...savedMember,
    id: 3,
    firstName: 'Mira',
    relationship: 'Daughter',
    parentIds: [1, 2],
  };
  const sibling = {
    ...savedMember,
    id: 4,
    firstName: 'Akhil',
    relationship: 'Brother',
    parentIds: [1, 2],
  };
  global.fetch.mockResolvedValueOnce(authenticatedResponse());
  global.fetch.mockResolvedValueOnce(
    apiResponse([{ ...savedMember, spouseIds: [2] }, spouse, child, sibling])
  );

  const { container } = await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: /family graph/i }));

  expect(
    await screen.findByRole('group', { name: 'Family members arranged by generation' })
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Generation 1' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Generation 2' })).toBeInTheDocument();
  expect(screen.getByText('Asha Shah')).toBeInTheDocument();
  expect(screen.getByText('Rohan Shah')).toBeInTheDocument();
  expect(screen.getByText('Mira Shah')).toBeInTheDocument();
  expect(screen.getByText('Akhil Shah')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Parent, child, and spouse connections' }))
    .toBeInTheDocument();
  expect(container.querySelectorAll('.family-graph-parent-edge')).toHaveLength(1);
  expect(container.querySelectorAll('.family-graph-spouse-edge')).toHaveLength(1);
});

test('orders family graph branches and members as Binal, Ankur, Palak, Akhil', async () => {
  const members = [
    { ...savedMember, id: 4, firstName: 'Mother', parentIds: [] },
    {
      ...savedMember,
      id: 6,
      firstName: 'Father-in-law',
      parentIds: [],
      spouseIds: [7],
    },
    {
      ...savedMember,
      id: 7,
      firstName: 'Mother-in-law',
      parentIds: [],
      spouseIds: [6],
    },
    {
      ...savedMember,
      id: 8,
      firstName: 'Binal',
      relationship: 'Sister-in-law',
      parentIds: [6, 7],
    },
    {
      ...savedMember,
      id: 1,
      firstName: 'Ankur',
      relationship: 'Spouse',
      parentIds: [6, 7],
      spouseIds: [3],
    },
    {
      ...savedMember,
      id: 3,
      firstName: 'Palak',
      parentIds: [4],
      spouseIds: [1],
    },
    {
      ...savedMember,
      id: 2,
      firstName: 'Akhil',
      relationship: 'Brother',
      parentIds: [4],
    },
  ];
  global.fetch.mockResolvedValueOnce(authenticatedResponse());
  global.fetch.mockResolvedValueOnce(apiResponse(members));

  const { container } = await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: /family graph/i }));

  const childGeneration = container.querySelectorAll('.family-graph-generation')[1];
  const names = within(childGeneration)
    .getAllByRole('article')
    .map((card) => card.querySelector('strong').textContent);
  expect(names).toEqual(['Binal Shah', 'Ankur Shah', 'Palak Shah', 'Akhil Shah']);
  const parentEdges = [...container.querySelectorAll('.family-graph-parent-edge')];
  const spouseEdges = [...container.querySelectorAll('.family-graph-spouse-edge')];
  const graphContent = container.querySelector('.family-graph-content');
  const edgesSvg = container.querySelector('.family-graph-edges');
  expect(parentEdges).toHaveLength(2);
  expect(spouseEdges).toHaveLength(2);
  expect(spouseEdges.map((edge) => edge.getAttribute('d'))).toEqual(
    expect.arrayContaining(['M 118 86 H 134', 'M 244 258 H 260'])
  );
  expect(parentEdges[0].getAttribute('d')).toContain('M 126 132 V ');
  expect(parentEdges[0].getAttribute('d')).toContain('H 63 H 189');
  expect(parentEdges[1].getAttribute('d')).toContain('M 378 132 V ');
  expect(parentEdges[1].getAttribute('d')).toContain('H 315 H 441');
  expect(edgesSvg).toHaveAttribute('width', graphContent.style.width.replace('px', ''));
  expect(edgesSvg).toHaveAttribute('height', graphContent.style.height.replace('px', ''));
});

test('keeps spouse pairs adjacent and aligns parents above their children', async () => {
  const members = [
    { ...savedMember, id: 4, firstName: 'Panna', parentIds: [], spouseIds: [5] },
    { ...savedMember, id: 5, firstName: 'Parmanand', parentIds: [], spouseIds: [4] },
    {
      ...savedMember,
      id: 6,
      firstName: 'Jagruti',
      parentIds: [],
      spouseIds: [7],
    },
    {
      ...savedMember,
      id: 7,
      firstName: 'Satish',
      parentIds: [],
      spouseIds: [6],
    },
    {
      ...savedMember,
      id: 8,
      firstName: 'Binal',
      relationship: 'Sister-in-law',
      parentIds: [6, 7],
      spouseIds: [10],
    },
    {
      ...savedMember,
      id: 9,
      firstName: 'Niki',
      relationship: 'Sister-in-law',
      parentIds: [6, 7],
      spouseIds: [11],
    },
    {
      ...savedMember,
      id: 1,
      firstName: 'Ankur',
      relationship: 'Spouse',
      parentIds: [6, 7],
      spouseIds: [3],
    },
    {
      ...savedMember,
      id: 3,
      firstName: 'Palak',
      parentIds: [4, 5],
      spouseIds: [1],
    },
    {
      ...savedMember,
      id: 2,
      firstName: 'Akhil',
      relationship: 'Brother',
      parentIds: [4, 5],
    },
    {
      ...savedMember,
      id: 10,
      firstName: 'Arpan',
      relationship: 'Brother-in-law',
      parentIds: [],
      spouseIds: [8],
    },
    {
      ...savedMember,
      id: 11,
      firstName: 'Saurabh',
      relationship: 'Brother-in-law',
      parentIds: [],
      spouseIds: [9],
    },
  ];
  global.fetch.mockResolvedValueOnce(authenticatedResponse());
  global.fetch.mockResolvedValueOnce(apiResponse(members));

  const { container } = await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: /family graph/i }));

  const generationTwo = container.querySelectorAll('.family-graph-generation')[1];
  const names = within(generationTwo)
    .getAllByRole('article')
    .map((card) => card.querySelector('strong').textContent);
  expect(names).toEqual([
    'Binal Shah',
    'Arpan Shah',
    'Niki Shah',
    'Saurabh Shah',
    'Ankur Shah',
    'Palak Shah',
    'Akhil Shah',
  ]);
  const spousePaths = [...container.querySelectorAll('.family-graph-spouse-edge')].map(
    (edge) => edge.getAttribute('d')
  );
  expect(spousePaths).toEqual(
    expect.arrayContaining([
      'M 118 258 H 134',
      'M 370 258 H 386',
      'M 622 258 H 638',
    ])
  );
  const parentEdges = [...container.querySelectorAll('.family-graph-parent-edge')];
  expect(parentEdges[1].getAttribute('d')).toContain('M 756 132 V ');
  expect(parentEdges[1].getAttribute('d')).toContain('H 693 H 819');
});

test('saves selected parents and spouses as member connections', async () => {
  const spouse = {
    ...savedMember,
    id: 2,
    firstName: 'Rohan',
    lastName: 'Patel',
    relationship: 'Spouse',
  };
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([savedMember, spouse]))
    .mockResolvedValueOnce(apiResponse({
      ...savedMember,
      id: 3,
      firstName: 'Mira',
      relationship: 'Daughter',
      parentIds: [savedMember.id],
      spouseIds: [spouse.id],
    }));

  await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: /add family member/i }));
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Mira' },
  });
  fireEvent.change(screen.getByLabelText(/relationship/i), {
    target: { value: 'Daughter' },
  });
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Parents' })).getByLabelText('Asha Shah')
  );
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Spouse(s)' })).getByLabelText('Rohan Patel')
  );
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: expect.stringContaining('"parentIds":[1],"spouseIds":[2]'),
  });
});

test('offers specific sibling, in-law, and extended-family relationships', async () => {
  await renderOnFamilyMembers();
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );

  for (const relationship of [
    'Brother',
    'Sister',
    'Brother-in-law',
    'Sister-in-law',
    'Father-in-law',
    'Mother-in-law',
    'Son-in-law',
    'Daughter-in-law',
    'Niece',
    'Nephew',
  ]) {
    expect(screen.getByRole('option', { name: relationship })).toBeInTheDocument();
  }
});

test('posts a family member to the API and displays the saved record', async () => {
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce(
      apiResponse({
        ...savedMember,
        phone: '+1 555-0100',
        dateOfBirth: '1980-04-23',
        gujaratiBirthdayMonth: 'Kartak',
        gujaratiBirthdayPaksha: 'Sud',
        gujaratiBirthdayTithi: 'Poonam',
        isDeceased: true,
        dateOfDeath: '2000-02-20',
        gujaratiDeathMonth: 'Vaishakh',
        gujaratiDeathPaksha: 'Vad',
        gujaratiDeathTithi: 'Amas',
        anniversaryDate: '2005-05-15',
        gujaratiAnniversaryMonth: 'Vaishakh',
        gujaratiAnniversaryPaksha: 'Sud',
        gujaratiAnniversaryTithi: 'Poonam',
      })
    );

  await renderOnFamilyMembers();

  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: 'Shah' },
  });
  fireEvent.change(screen.getByLabelText(/relationship/i), {
    target: { value: 'Self' },
  });
  fireEvent.change(screen.getByLabelText('Birthday', { exact: true }), {
    target: { value: '1980-04-23' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati birthday month'), {
    target: { value: 'Kartak' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati birthday paksha'), {
    target: { value: 'Sud' },
  });
  expect(screen.getByRole('option', { name: 'Poonam' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Amas' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Gujarati birthday tithi'), {
    target: { value: 'Poonam' },
  });
  fireEvent.change(screen.getByLabelText('Wedding Anniversary'), {
    target: { value: '2005-05-15' },
  });
  fireEvent.change(
    screen.getByLabelText('Gujarati wedding anniversary month'),
    { target: { value: 'Vaishakh' } }
  );
  fireEvent.change(
    screen.getByLabelText('Gujarati wedding anniversary paksha'),
    { target: { value: 'Sud' } }
  );
  fireEvent.change(
    screen.getByLabelText('Gujarati wedding anniversary tithi'),
    { target: { value: 'Poonam' } }
  );
  expect(screen.getByLabelText('Date of death')).not.toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', {
    name: 'This person has passed away',
  }));
  expect(screen.getByLabelText('Date of death')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Date of death'), {
    target: { value: '2000-02-20' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati death month'), {
    target: { value: 'Vaishakh' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati death paksha'), {
    target: { value: 'Vad' },
  });
  fireEvent.change(screen.getByLabelText('Gujarati death tithi'), {
    target: { value: 'Amas' },
  });
  expect(screen.getByLabelText('Country')).toHaveValue('IN');
  expect(screen.getByLabelText('Country code')).toHaveValue('+91');
  fireEvent.change(screen.getByLabelText('Country'), {
    target: { value: 'US' },
  });
  expect(screen.getByLabelText('Country code')).toHaveValue('+1');
  fireEvent.change(screen.getByLabelText(/phone number/i), {
    target: { value: '555-0100' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Asha',
      lastName: 'Shah',
      relationship: 'Self',
      parentIds: [],
      spouseIds: [],
      gender: '',
      dateOfBirth: '1980-04-23',
      gujaratiBirthdayMonth: 'Kartak',
      gujaratiBirthdayPaksha: 'Sud',
      gujaratiBirthdayTithi: 'Poonam',
      isDeceased: true,
      dateOfDeath: '2000-02-20',
      gujaratiDeathMonth: 'Vaishakh',
      gujaratiDeathPaksha: 'Vad',
      gujaratiDeathTithi: 'Amas',
      anniversaryDate: '2005-05-15',
      gujaratiAnniversaryMonth: 'Vaishakh',
      gujaratiAnniversaryPaksha: 'Sud',
      gujaratiAnniversaryTithi: 'Poonam',
      phone: '+1 555-0100',
      email: '',
      address: '',
    }),
  });
  expect(await screen.findByText('Asha Shah')).toBeInTheDocument();
  expect(screen.getByText('Kartak · Sud Poonam')).toBeInTheDocument();
  expect(screen.getByText('Vaishakh · Vad Amas')).toBeInTheDocument();
  expect(screen.getByText('Vaishakh · Sud Poonam')).toBeInTheDocument();
  const dateBlocks = screen
    .getByText('Asha Shah')
    .closest('.member-row')
    .querySelectorAll('.member-detail');
  expect(dateBlocks[0]).toHaveTextContent('BIRTHDAY');
  expect(dateBlocks[0]).toHaveTextContent(/\d+ years? old/);
  expect(dateBlocks[1]).toHaveTextContent('DEATH DATE');
  expect(dateBlocks[1]).toHaveTextContent(/\d+ years? ago/);
  expect(dateBlocks[2]).toHaveTextContent('WEDDING ANNIVERSARY');
  expect(dateBlocks[2]).toHaveTextContent(/\d+ years? married/);
  expect(dateBlocks[0].textContent.indexOf('Kartak')).toBeLessThan(
    dateBlocks[0].textContent.indexOf('Apr 23, 1980')
  );
  expect(dateBlocks[0].textContent.indexOf('Apr 23, 1980')).toBeLessThan(
    dateBlocks[0].textContent.indexOf('years old')
  );
  expect(dateBlocks[1].textContent.indexOf('Vaishakh')).toBeLessThan(
    dateBlocks[1].textContent.indexOf('Feb 20, 2000')
  );
  expect(dateBlocks[1].textContent.indexOf('Feb 20, 2000')).toBeLessThan(
    dateBlocks[1].textContent.indexOf('years ago')
  );
  expect(dateBlocks[2].textContent.indexOf('Vaishakh')).toBeLessThan(
    dateBlocks[2].textContent.indexOf('May 15, 2005')
  );
  expect(dateBlocks[2].textContent.indexOf('May 15, 2005')).toBeLessThan(
    dateBlocks[2].textContent.indexOf('years married')
  );
});

test('edits an existing family member through the API', async () => {
  const memberWithCountryCode = {
    ...savedMember,
    phone: '+44 20 1234 5678',
    gujaratiBirthdayMonth: 'Vaishakh',
    gujaratiBirthdayPaksha: 'Vad',
    gujaratiBirthdayTithi: 'Amas',
  };
  const updatedMember = { ...memberWithCountryCode, lastName: 'Patel' };
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([memberWithCountryCode]))
    .mockResolvedValueOnce(apiResponse(updatedMember));

  await renderOnFamilyMembers();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha Shah' }));
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Asha');
  expect(screen.getByLabelText(/last name/i)).toHaveValue('Shah');
  expect(screen.getByLabelText('Country')).toHaveValue('GB');
  expect(screen.getByLabelText('Country code')).toHaveValue('+44');
  expect(screen.getByLabelText(/phone number/i)).toHaveValue('20 1234 5678');
  expect(screen.getByLabelText('Gujarati birthday month')).toHaveValue('Vaishakh');
  expect(screen.getByLabelText('Gujarati birthday paksha')).toHaveValue('Vad');
  expect(screen.getByLabelText('Gujarati birthday tithi')).toHaveValue('Amas');
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: 'Patel' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Asha',
      lastName: 'Patel',
      relationship: 'Self',
      parentIds: [],
      spouseIds: [],
      gender: '',
      dateOfBirth: '',
      gujaratiBirthdayMonth: 'Vaishakh',
      gujaratiBirthdayPaksha: 'Vad',
      gujaratiBirthdayTithi: 'Amas',
      isDeceased: false,
      dateOfDeath: '',
      gujaratiDeathMonth: '',
      gujaratiDeathPaksha: '',
      gujaratiDeathTithi: '',
      anniversaryDate: '',
      gujaratiAnniversaryMonth: '',
      gujaratiAnniversaryPaksha: '',
      gujaratiAnniversaryTithi: '',
      phone: '+44 20 1234 5678',
      email: '',
      address: '',
    }),
  });
  expect(await screen.findByText('Asha Patel')).toBeInTheDocument();
  expect(screen.queryByText('Asha Shah')).not.toBeInTheDocument();
  const dateBlocks = screen
    .getByText('Asha Patel')
    .closest('.member-row')
    .querySelectorAll('.member-detail');
  expect(dateBlocks[0]).toHaveTextContent('Vaishakh · Vad Amas');
  expect(dateBlocks[1]).toBeEmptyDOMElement();
  expect(dateBlocks[2]).toBeEmptyDOMElement();
});

test('archives a family member through the API after confirmation', async () => {
  const member = { ...savedMember };
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([member]))
    .mockResolvedValueOnce(apiResponse({ id: member.id }));
  jest.spyOn(window, 'confirm').mockReturnValue(true);

  await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Asha Shah' }));

  expect(
    await screen.findByRole('heading', { name: /your family story starts here/i })
  ).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Asha Shah was archived.');
  expect(window.confirm).toHaveBeenCalledWith(
    'Archive Asha Shah and remove them from the family list?'
  );
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members/1', {
    method: 'DELETE',
  });
});

test('opens an edit form when the API returns a null phone number', async () => {
  global.fetch.mockResolvedValueOnce(authenticatedResponse());
  global.fetch.mockResolvedValueOnce(
    apiResponse([{ ...savedMember, phone: null }])
  );

  await renderOnFamilyMembers();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha Shah' }));

  expect(screen.getByLabelText(/phone number/i)).toHaveValue('');
});

test('keeps the form open and displays an API error when saving fails', async () => {
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([savedMember]))
    .mockResolvedValueOnce(
      apiResponse({ error: 'Could not save family member to the database.' }, 503)
    );

  await renderOnFamilyMembers();
  fireEvent.click(
    await screen.findByRole('button', { name: /add family member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /could not save family member to the database/i
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Asha');
  expect(screen.getByRole('button', { name: 'Edit Asha Shah' })).toBeInTheDocument();
});

test('shows the HTTP status when the API returns an empty error response', async () => {
  global.fetch
    .mockResolvedValueOnce(authenticatedResponse())
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '',
    });

  await renderOnFamilyMembers();
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /server returned http 500 with an empty response/i
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('validates required name, email, phone, and future birthday before saving', async () => {
  await renderOnFamilyMembers();
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: '   ' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'not-an-email' },
  });
  fireEvent.change(screen.getByLabelText(/phone/i), {
    target: { value: '123-45' },
  });
  fireEvent.change(screen.getByLabelText('Birthday', { exact: true }), {
    target: { value: '2999-01-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(await screen.findByText('First name is required.')).toBeInTheDocument();
  expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
  expect(screen.getByText(/phone number with 7–15 digits/i)).toBeInTheDocument();
  expect(screen.getByText(/birthday cannot be in the future/i)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('requires a country when a phone number is entered', async () => {
  await renderOnFamilyMembers();
  fireEvent.click(
    await screen.findByRole('button', { name: /add your first member/i })
  );
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: 'Asha' },
  });
  fireEvent.change(screen.getByLabelText('Country'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText(/phone number/i), {
    target: { value: '555-0100' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save family member/i }));

  expect(
    await screen.findByText(/choose a country to add its calling code/i)
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
