import { BaseTable } from './base-table.component';

describe('BaseTable local and server pagination', () => {
  it('searches all local records, resets the page, and paginates matching rows', () => {
    const table = new BaseTable();
    table.columns = [{ header: 'Patient', key: 'name' }];
    table.data = Array.from({ length: 23 }, (_, i) => ({ name: 'Patient ' + (i + 1) }));
    table.onPageChange(3);
    expect(table.visibleRows).toHaveLength(3);
    table.searchTerm = 'Patient 2';
    table.onSearch();
    expect(table.currentPage).toBe(1);
    expect(table.effectiveTotal).toBe(5);
    expect(table.visibleRows.map(row => row.name)).toEqual(['Patient 2','Patient 20','Patient 21','Patient 22','Patient 23']);
  });
  it('does not slice records a second time when the caller owns pagination', () => {
    const table = new BaseTable();
    const subscription = table.pageChange.subscribe(() => {});
    table.data = [{ name: 'Server page two' }];
    table.totalItems = 11;
    table.currentPage = 2;
    expect(table.visibleRows).toEqual(table.data);
    expect(table.totalPages).toBe(2);
    subscription.unsubscribe();
  });
});
