import { NewsArticle, UserPreferences } from '../types';

const BASE_URL = 'https://api.placeholder.com';

export const fetchNews = async (): Promise<NewsArticle[]> => {
  return Promise.resolve([]);
};

export const fetchPreferences = async (): Promise<UserPreferences> => {
  return Promise.resolve({ theme: 'dark', notifications: true });
};

export const sendChatMessage = async (message: string): Promise<void> => {
  return Promise.resolve();
};
