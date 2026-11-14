import { useApi } from './useApi';

/** Reference data used by many forms. */
export function useLookups() {
  const categories = useApi('/categories');
  const suppliers = useApi('/suppliers');
  const warehouses = useApi('/warehouses');
  return {
    categories: categories.data || [],
    suppliers: suppliers.data || [],
    warehouses: warehouses.data || [],
    loading: categories.loading || suppliers.loading || warehouses.loading,
    reload: () => { categories.reload(); suppliers.reload(); warehouses.reload(); },
  };
}
