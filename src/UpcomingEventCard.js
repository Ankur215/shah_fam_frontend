import { useEffect, useState } from 'react';

export function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);
  return now;
}

function formatCountdown(date, now) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1, day).getTime();
  const secondsRemaining = Math.max(0, Math.floor((target - now) / 1000));
  if (secondsRemaining === 0) return 'Today';

  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  return `${days}d ${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function UpcomingEventCard({ date, description, now, emptyMessage }) {
  return (
    <section className="summary-card summary-card-warm" aria-label="Upcoming event">
      <span className="summary-icon summary-icon-warm" aria-hidden="true">♡</span>
      <div>
        <span className="summary-label">UPCOMING EVENT</span>
        {date ? (
          <>
            <div className="summary-celebration-date">
              <strong className="summary-number summary-date">
                {new Intl.DateTimeFormat('en', {
                  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                }).format(new Date(`${date}T00:00:00Z`))}
              </strong>
              <span className="upcoming-countdown" aria-live="off">
                {formatCountdown(date, now)}
              </span>
            </div>
            <span className="summary-caption summary-event-caption">{description}</span>
          </>
        ) : <span className="summary-caption">{emptyMessage}</span>}
      </div>
    </section>
  );
}
