import React from 'react';

interface NewsCardProps {
  title: string;
  summary: string;
  source: string;
  category: string;
  timestamp: string;
  url: string;
}

export const NewsCard: React.FC<NewsCardProps> = ({ title, summary, source, category, timestamp, url }) => {
  return (
    <div className="news-card">
      <h3>{title}</h3>
      <p>{summary}</p>
      <span>{source}</span>
    </div>
  );
};
