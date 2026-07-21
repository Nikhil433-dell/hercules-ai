class NewsSummarizer:
    """Service to summarize news articles."""
    
    def summarize_articles(self, articles: list):
        """Summarize multiple articles."""
        raise NotImplementedError
        
    def summarize_single(self, article: dict):
        """Summarize a single article."""
        raise NotImplementedError
        
    def get_chain(self):
        """Get the summarization chain."""
        raise NotImplementedError
