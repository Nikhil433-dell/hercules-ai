import React, { useState, useEffect, useRef } from 'react';
import NewsCard, { NewsItem } from './NewsCard';
import Settings, { UserSettings, DEFAULT_SETTINGS } from './Settings';
import './SidePanel.css';

interface SidePanelProps {
  onMinimize: () => void;
}

const ALL_CATEGORIES = ['Tech', 'Finance', 'World', 'Sports'];

const MOCK_NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'AI chips power surge as inference demand doubles in Q3',
    summary:
      'Data centers globally are racing to expand GPU capacity as inference workloads from deployed LLMs have exceeded training compute for the first time. NVIDIA, AMD, and custom silicon from hyperscalers are all benefiting.',
    category: 'Tech',
    source: 'TechCrunch',
    url: 'https://techcrunch.com/2026/07/29/ai-chips-inference-demand-doubles-q3/',
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
    url: 'https://www.reuters.com/markets/us/fed-signals-rate-cut-inflation-cools-2026-07-29/',
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
    url: 'https://www.theverge.com/2026/7/29/llama-4-scout-benchmarks-leak-reasoning-ai/',
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
    url: 'https://www.bloomberg.com/news/articles/2026-07-29/apple-q3-earnings-beat-services-revenue-record/',
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
    url: 'https://www.bbc.com/news/articles/un-climate-summit-carbon-pricing-accord-2026/',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    readTime: 4,
  },
];

function loadSavedSettings(): UserSettings {
  try {
    const raw = localStorage.getItem('hercules_user_settings');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
}

export default function SidePanel({ onMinimize }: SidePanelProps) {
  const [userSettings, setUserSettings] = useState<UserSettings>(loadSavedSettings);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'news' | 'earnings'>('news');
  const [news] = useState<NewsItem[]>(MOCK_NEWS);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [visible, setVisible] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(true);

  const autoHideSeconds = userSettings.autoHideMinutes * 60;
  const [timeLeft, setTimeLeft] = useState(autoHideSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(userSettings.autoHideMinutes * 60);
  }, [userSettings.autoHideMinutes]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

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
    setTimeout(onMinimize, 300);
  };

  const handleSaveSettings = (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    try {
      localStorage.setItem('hercules_user_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  };

  const availableCategories = ['All', ...ALL_CATEGORIES.filter((c) => userSettings.categories.includes(c))];

  const filtered = news
    .filter((n) => userSettings.categories.includes(n.category))
    .filter((n) => activeCategory === 'All' || n.category === activeCategory);

  const timerPercent = (timeLeft / autoHideSeconds) * 100;

  return (
    <div className={`panel-root ${visible ? 'panel-visible' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-logo">
          <div className="logo-badge">H</div>
          <span className="logo-text">Hercules AI</span>
        </div>
        <div className="panel-header-actions">
          <button
            className="icon-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙
          </button>
          <button
            className="icon-btn minimize-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            ✕
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
        <Settings
          onClose={() => setShowSettings(false)}
          currentSettings={userSettings}
          onSaveSettings={handleSaveSettings}
        />
      ) : (
        <>
          {/* Tab bar */}
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === 'news' ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab('news')}
            >
              News
            </button>
            <button
              className={`tab-btn ${activeTab === 'earnings' ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab('earnings')}
            >
              Earnings
            </button>
          </div>

          {activeTab === 'news' ? (
            <>
              {/* Major AI Briefing Executive Container */}
              <div className="executive-briefing-box">
                <div className="briefing-box-header" onClick={() => setBriefingExpanded(!briefingExpanded)}>
                  <div className="briefing-title-group">
                    <span className="briefing-icon">H</span>
                    <span className="briefing-title">AI Briefing Context</span>
                  </div>
                  <button className="briefing-toggle-btn">
                    {briefingExpanded ? 'Hide Context ▲' : 'Show Context ▼'}
                  </button>
                </div>

                {briefingExpanded && (
                  <div className="briefing-box-body">
                    <div className="briefing-section">
                      <div className="briefing-label">Why You're Seeing These</div>
                      <p className="briefing-desc">
                        Synthesized on system wake to prioritize major shifts in AI compute infrastructure, Fed rate policy, and global clean energy markets based on your active preferences.
                      </p>
                    </div>
                    <div className="briefing-section">
                      <div className="briefing-label">Why They're Worth Reading</div>
                      <p className="briefing-desc">
                        AI inference demand surpassing training compute signals key hardware supply chain re-allocations, while Fed signals directly impact tech valuations this quarter.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Category pills */}
              <div className="category-scroll">
                {availableCategories.map((cat) => (
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
                <span>AI Summarized · {filtered.length} stories</span>
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
            </>
          ) : (
            <div className="earnings-placeholder">
              <div className="earnings-placeholder-icon">H</div>
              <div className="earnings-placeholder-title">Earnings Intelligence</div>
              <div className="earnings-placeholder-text">AI-powered earnings predictions coming soon</div>
            </div>
          )}

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
