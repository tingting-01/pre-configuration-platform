import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AdvancedSearchConfig } from '../components/AdvancedSearch'

interface DashboardState {
  currentPage: number
  itemsPerPage: number
  searchQuery: string
  advancedSearchConfig: AdvancedSearchConfig | null
  setCurrentPage: (page: number) => void
  setItemsPerPage: (itemsPerPage: number) => void
  setSearchQuery: (query: string) => void
  setAdvancedSearchConfig: (config: AdvancedSearchConfig | null) => void
  resetPagination: () => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      currentPage: 1,
      itemsPerPage: 10,
      searchQuery: '',
      advancedSearchConfig: null,
      setCurrentPage: (page: number) => {
        console.log('📄 Dashboard Store: Setting currentPage to', page)
        set({ currentPage: page })
      },
      setItemsPerPage: (itemsPerPage: number) => {
        console.log('📄 Dashboard Store: Setting itemsPerPage to', itemsPerPage)
        set({ itemsPerPage })
      },
      setSearchQuery: (query: string) => {
        console.log('🔍 Dashboard Store: Setting searchQuery to', query)
        set({ searchQuery: query })
      },
      setAdvancedSearchConfig: (config: AdvancedSearchConfig | null) => {
        console.log('🔎 Dashboard Store: Setting advancedSearchConfig to', config)
        set({ advancedSearchConfig: config })
      },
      resetPagination: () => {
        console.log('📄 Dashboard Store: Resetting pagination to page 1')
        set({ currentPage: 1 })
      },
    }),
    {
      name: 'dashboard-storage',
      // 确保状态正确持久化
      partialize: (state) => ({
        currentPage: state.currentPage,
        itemsPerPage: state.itemsPerPage,
        searchQuery: state.searchQuery,
        advancedSearchConfig: state.advancedSearchConfig,
      }),
    }
  )
)

