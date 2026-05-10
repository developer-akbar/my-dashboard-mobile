export function filterServices(services, { query, status, sort }) {
  let result = [...services];

  if (query) {
    const q = query.toLowerCase();
    result = result.filter(
      (s) =>
        s.serviceNumber.includes(q) ||
        (s.label || '').toLowerCase().includes(q) ||
        (s.customerName || '').toLowerCase().includes(q)
    );
  }

  if (status) {
    result = result.filter((s) => s.lastStatus === status);
  }

  switch (sort) {
    case 'amount':
      result.sort((a, b) => (b.lastAmountDue || 0) - (a.lastAmountDue || 0));
      break;
    case 'dueDate':
      result.sort((a, b) => {
        const da = a.lastDueDate ? new Date(a.lastDueDate) : new Date('9999');
        const db2 = b.lastDueDate ? new Date(b.lastDueDate) : new Date('9999');
        return da - db2;
      });
      break;
    case 'name':
      result.sort((a, b) =>
        (a.label || a.serviceNumber).localeCompare(b.label || b.serviceNumber)
      );
      break;
    default:
      break;
  }

  return result;
}
