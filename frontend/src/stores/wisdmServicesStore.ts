import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WisdmServicesState {
  currentPage: number
  itemsPerPage: number
  setCurrentPage: (page: number) => void
  setItemsPerPage: (itemsPerPage: number) => void
  resetPagination: () => void
}

export const useWisdmServicesStore = create<WisdmServicesState>()(
  persist(
    (set) => ({
      currentPage: 1,
      itemsPerPage: 10,
      setCurrentPage: (currentPage) => set({ currentPage }),
      setItemsPerPage: (itemsPerPage) => set({ itemsPerPage }),
      resetPagination: () => set({ currentPage: 1 }),
    }),
    {
      name: 'wisdm-services-list-storage',
      partialize: ({ currentPage, itemsPerPage }) => ({ currentPage, itemsPerPage }),
    },
  ),
)
