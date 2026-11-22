export function formatElapsedYears(date, description, today = new Date()) {
  if (!date) return '';

  const startDate = new Date(`${date}T00:00:00`);
  let years = today.getFullYear() - startDate.getFullYear();
  const anniversaryHasPassed =
    today.getMonth() > startDate.getMonth() ||
    (today.getMonth() === startDate.getMonth() &&
      today.getDate() >= startDate.getDate());

  if (!anniversaryHasPassed) years -= 1;
  return years >= 0 ? `${years} ${years === 1 ? 'year' : 'years'} ${description}` : '';
}
