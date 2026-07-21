export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  timestamp: string;
  url: string;
}

export interface NewsSummary {
  date: string;
  articles: NewsArticle[];
}

export interface UserPreferences {
  theme: string;
  notifications: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface AppState {
  isExpanded: boolean;
  news: NewsArticle[];
  preferences: UserPreferences;
  setExpanded: (isExpanded: boolean) => void;
  setNews: (news: NewsArticle[]) => void;
  setPreferences: (prefs: UserPreferences) => void;
}

export interface ElectronAPI {
  minimizeToIcon: () => Promise<void>;
  expandPanel: () => Promise<void>;
  quitApp: () => Promise<void>;
  getNews: () => Promise<NewsArticle[]>;
  onNewsUpdate: (callback: (news: NewsArticle[]) => void) => void;
  onSystemWake: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
