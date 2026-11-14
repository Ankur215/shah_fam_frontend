export const API_URL = process.env.REACT_APP_API_URL || '';

export function apiFetch(url, options = {}) {
  const request = API_URL
    ? fetch(url, { ...options, credentials: 'include' })
    : Object.keys(options).length
      ? fetch(url, options)
      : fetch(url);

  return request.then((response) => {
    if (
      response.status === 401 &&
      !url.includes('/api/auth/') &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('shah-family-session-expired'));
    }
    return response;
  });
}

export async function readApiResponse(response) {
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
        : `The server returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (data === null) {
    throw new Error('The API returned an empty or invalid JSON response.');
  }
  return data;
}
