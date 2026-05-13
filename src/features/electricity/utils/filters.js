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

  function compareBySort(a, b) {
    switch (sort) {
      case 'amount':
        return (b.lastAmountDue || 0) - (a.lastAmountDue || 0);
      case 'dueDate': {
        const da = a.lastDueDate ? new Date(a.lastDueDate) : new Date('9999');
        const db2 = b.lastDueDate ? new Date(b.lastDueDate) : new Date('9999');
        return da - db2;
      }
      case 'name':
        return (a.label || a.serviceNumber).localeCompare(b.label || b.serviceNumber);
      default:
        return 0;
    }
  }

  result.sort((a, b) => {
    if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return compareBySort(a, b);
  });

  return result;
}
