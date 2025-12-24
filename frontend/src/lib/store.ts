'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Conversation } from '@/types';

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;

  // Conversations
  conversations: Conversation[];
  currentConversationId: string | null;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (id: string | null) => void;
  addConversation: (conversation: Conversation) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, conversations: [], currentConversationId: null }),

      // Conversations
      conversations: [],
      currentConversationId: null,
      setConversations: (conversations) => set({ conversations }),
      setCurrentConversation: (id) => set({ currentConversationId: id }),
      addConversation: (conversation) =>
        set((state) => ({
          conversations: [conversation, ...state.conversations],
        })),

      // UI
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'openanalyst-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);
