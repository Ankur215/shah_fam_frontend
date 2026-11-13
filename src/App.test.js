import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

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

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(apiResponse([]));
});

afterEach(() => {
  jest.resetAllMocks();
});

test('shows the family member empty state after loading members from the API', async () => {
  render(<App />);

  expect(
    await screen.findByRole('heading', { name: /your family story starts here/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /add your first member/i })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/family-members');
});

test('moves a family member and saves the reordered sequence', async () => {
  const firstMember = { ...savedMember, id: 1, firstName: 'Asha' };
  const secondMember = { ...savedMember, id: 2, firstName: 'Rohan' };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(apiResponse([firstMember, secondMember]))
    .mockResolvedValueOnce(apiResponse([secondMember, firstMember]));

  const { container } = render(<App />);
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

test('opens the gift log from the main navigation', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /gifts & giving/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Gift log' }));

  expect(
    await screen.findByRole('heading', { name: 'Gifts by person' })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/gifts');
});

test('opens the charity work section from the main navigation', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /gifts & giving/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Charity work' }));

  expect(
    await screen.findByRole('heading', { name: 'Charity work' })
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/charity-records');
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
  global.fetch.mockResolvedValueOnce(
    apiResponse([{ ...savedMember, spouseIds: [2] }, spouse, child, sibling])
  );

  const { container } = render(<App />);
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
  global.fetch.mockResolvedValueOnce(apiResponse(members));

  const { container } = render(<App />);
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
  global.fetch.mockResolvedValueOnce(apiResponse(members));

  const { container } = render(<App />);
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
    .mockResolvedValueOnce(apiResponse([savedMember, spouse]))
    .mockResolvedValueOnce(apiResponse({
      ...savedMember,
      id: 3,
      firstName: 'Mira',
      relationship: 'Daughter',
      parentIds: [savedMember.id],
      spouseIds: [spouse.id],
    }));

  render(<App />);
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

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenLastCalledWith('/api/family-members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: expect.stringContaining('"parentIds":[1],"spouseIds":[2]'),
  });
});

test('offers specific sibling, in-law, and extended-family relationships', async () => {
  render(<App />);
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

  render(<App />);

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

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
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
    .mockResolvedValueOnce(apiResponse([memberWithCountryCode]))
    .mockResolvedValueOnce(apiResponse(updatedMember));

  render(<App />);

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

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
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

test('opens an edit form when the API returns a null phone number', async () => {
  global.fetch.mockResolvedValueOnce(
    apiResponse([{ ...savedMember, phone: null }])
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Asha Shah' }));

  expect(screen.getByLabelText(/phone number/i)).toHaveValue('');
});

test('keeps the form open and displays an API error when saving fails', async () => {
  global.fetch
    .mockResolvedValueOnce(apiResponse([savedMember]))
    .mockResolvedValueOnce(
      apiResponse({ error: 'Could not save family member to the database.' }, 503)
    );

  render(<App />);
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
    .mockResolvedValueOnce(apiResponse([]))
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '',
    });

  render(<App />);
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
  render(<App />);
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
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('requires a country when a phone number is entered', async () => {
  render(<App />);
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
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
