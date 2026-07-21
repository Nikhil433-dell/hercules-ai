class NewsFetcher:
    """Service to fetch news from various sources."""
    
    def fetch_headlines(self):
        """Fetch top headlines."""
        raise NotImplementedError
        
    def fetch_by_category(self, category: str):
        """Fetch news by specific category."""
        raise NotImplementedError
        
    def fetch_from_rss(self, feed_url: str):
        """Fetch news from RSS feed."""
        raise NotImplementedError
