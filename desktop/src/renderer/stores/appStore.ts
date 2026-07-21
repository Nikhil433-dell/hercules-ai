import { create } from 'zustand';
import { AppState, NewsArticle, UserPreferences } from '../types';

export const useAppStore = create<AppState>((set) => ({
  isExpanded: true,
  news: [],
  preferences: { theme: 'dark', notifications: true },
  setExpanded: (isExpanded: boolean) => set({ isExpanded }),
  setNews: (news: NewsArticle[]) => set({ news }),
  setPreferences: (preferences: UserPreferences) => set({ preferences }),
}));
