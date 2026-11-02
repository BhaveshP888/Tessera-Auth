import { create } from 'zustand';
import type { Bookmark } from '@tessera/schemas';

export type ModalType =
  | 'add'
  | 'key'
  | 'audit'
  | 'extension'
  | 'vault-pin'
  | 'vault-settings'
  | 'command-palette'
  | 'auth'
  | '2fa-settings';

export interface UIState {
  isSidebarOpen: boolean;
  viewLayout: 'grid' | 'list';
  activeModal: ModalType | null;
  editingBookmark: Bookmark | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setViewLayout: (layout: 'grid' | 'list') => void;
  openModal: (modal: ModalType) => void;
  openAddBookmarkModal: (bookmark?: Bookmark | null) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth > 720 : true,
  viewLayout: 'grid',
  activeModal: null,
  editingBookmark: null,

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setViewLayout: (viewLayout) => set({ viewLayout }),
  openModal: (activeModal) => set({ activeModal, editingBookmark: null }),
  openAddBookmarkModal: (bookmark = null) =>
    set({ activeModal: 'add', editingBookmark: bookmark }),
  closeModal: () => set({ activeModal: null, editingBookmark: null }),
}));
