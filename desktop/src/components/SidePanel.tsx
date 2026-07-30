import React, { useState, useEffect, useRef } from 'react';
import NewsCard from './NewsCard';
import Settings from './Settings';
import './SidePanel.css';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string;
  publishedAt: string;
  readTime: number;
}

interface SidePanelProps {
  onMinimize: () => void;
}

const CATEGORIES = ['All', 'Tech', 'Finance', 'World', 'Sports'];

const MOCK_NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'AI chips power surge as inference demand doubles in Q3',
    summary:
      'Data centers globally are racing to expand GPU capacity as inference workloads from deployed LLMs have exceeded training compute for the first time. NVIDIA, AMD, and custom silicon from hyperscalers are all benefiting.',
    category: 'Tech',
    source: 'TechCrunch',
    url: '#',
    publishedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    readTime: 3,
  },
  {
    id: '2',
    title: 'Federal Reserve signals one more rate cut before year-end',
    summary:
      'Fed Chair Powell indicated the committee is comfortable with the current trajectory, noting inflation has cooled to 2.3%. Markets priced in a 75% probability of a 25bps cut at the November meeting.',
    category: 'Finance',
    source: 'Reuters',
    url: '#',
    publishedAt: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
    readTime: 2,
  },
  {
    id: '3',
    title: 'Open-source Llama 4 Scout benchmarks leak ahead of launch',
    summary:
      'Leaked internal benchmarks suggest the upcoming Llama 4 Scout model outperforms GPT-4o on reasoning tasks at a fraction of the compute cost, potentially reshaping the local inference landscape.',
    category: 'Tech',
    source: 'The Verge',
    url: '#',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    readTime: 4,
  },
  {
    id: '4',
    title: 'Apple Q3 earnings beat: Services revenue hits record $24.2B',
    summary:
      'Apple reported EPS of $1.53 vs. the $1.42 consensus estimate. iPhone revenue came in slightly below expectations while the Services segment hit a new all-time high, pushing the stock up 4% in after-hours trading.',
    category: 'Finance',
    source: 'Bloomberg',
    url: '#',
    publishedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    readTime: 3,
  },
  {
    id: '5',
    title: 'UN climate summit reaches historic carbon pricing agreement',
    summary:
      '192 nations signed a landmark accord establishing a global carbon price floor of $40/tonne by 2027. Analysts say the deal could unlock $2T in clean-energy investment and reshape fossil fuel valuations.',
    category: 'World',
    source: 'BBC News',
    url: '#',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    readTime: 4,
  },
];

export default function SidePanel({ onMinimize }: SidePanelProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [visible, setVisible] = useState(false);
  const AUTO_HIDE_SECONDS = 120;
  const [timeLeft, setTimeLeft] = useState(AUTO_HIDE_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Simulate API fetch
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleMinimize();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, []);

  const handleMinimize = () => {
    setVisible(false);
    setTimeout(onMinimize, 350);
  };

  const filtered =
    activeCategory === 'All'
      ? news
      : news.filter((n) => n.category === activeCategory);

  const timerPercent = (timeLeft / AUTO_HIDE_SECONDS) * 100;

  return (
    <div className={`panel-root ${visible ? 'panel-visible' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Hercules AI</span>
        </div>
        <div className="panel-header-actions">
          <button
            className="icon-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            className="icon-btn minimize-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            ─
          </button>
        </div>
      </div>

      {/* Auto-hide timer bar */}
      <div className="timer-bar-track">
        <div
          className="timer-bar-fill"
          style={{ width: `${timerPercent}%` }}
        />
      </div>

      {showSettings ? (
        <Settings onClose={() => setShowSettings(false)} />
      ) : (
        <>
          {/* Category pills */}
          <div className="category-scroll">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`cat-pill ${activeCategory === cat ? 'cat-pill--active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* AI summary badge */}
          <div className="ai-badge">
            <span className="ai-dot" />
            <span>AI-summarized · {filtered.length} stories</span>
          </div>

          {/* News feed */}
          <div className="news-feed">
            {loading ? (
              <div className="skeleton-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line skeleton-line--title" />
                    <div className="skeleton-line skeleton-line--body" />
                    <div className="skeleton-line skeleton-line--body short" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">No stories in this category</div>
            ) : (
              filtered.map((item, idx) => (
                <NewsCard key={item.id} item={item} index={idx} />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="panel-footer">
            <span>Refreshed just now</span>
            <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} auto-hide</span>
          </div>
        </>
      )}
    </div>
  );
}
