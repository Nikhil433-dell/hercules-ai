"""News summarizer service — uses LangChain + OpenAI to create news briefings."""

import logging
import json
import re
from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)


class NewsSummarizer:
    """Summarizes news articles into concise briefings using GPT-4o-mini.
    
    Uses LangChain chains for structured prompt → LLM → parse workflows.
    The LLM client is lazily initialized on first use so the app can start
    even without an OPENAI_API_KEY configured.
    """

    def __init__(self, openai_api_key: str):
        self._api_key = openai_api_key
        self._llm = None
        self.parser = StrOutputParser()

    @property
    def llm(self):
        """Lazily initialize the LLM client on first use."""
        if self._llm is None:
            if not self._api_key:
                raise ValueError(
                    "OPENAI_API_KEY is not set. Please add it to your .env file."
                )
            self._llm = ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0.3,
                api_key=self._api_key,
            )
        return self._llm

    async def summarize_articles(self, articles: List[Dict]) -> Dict[str, Any]:
        """Summarize a batch of articles into a morning briefing.
        
        Returns:
            dict with keys: summary (str), highlights (list[str]), categories (dict)
        """
        if not articles:
            return {"summary": "No articles to summarize.", "highlights": [], "categories": {}}

        try:
            # Format articles into a text block for the prompt
            articles_text = "\n\n".join(
                f"Title: {a.get('title', '')}\n"
                f"Source: {a.get('source', '')}\n"
                f"Description: {a.get('description', '')}\n"
                f"Content: {a.get('content', '')}"
                for a in articles
            )

            # --- Chain 1: Generate narrative summary ---
            summary_prompt = ChatPromptTemplate.from_messages([
                ("system",
                 "You are an expert news briefing assistant. Create a concise morning "
                 "briefing based on the provided articles. Group by topic and highlight "
                 "the most impactful stories. Keep it under 200 words. Be direct and "
                 "informative — no filler."),
                ("user", "{articles_text}"),
            ])
            summary_chain = summary_prompt | self.llm | self.parser
            summary = await summary_chain.ainvoke({"articles_text": articles_text})

            # --- Chain 2: Extract key highlights ---
            highlights_prompt = ChatPromptTemplate.from_messages([
                ("system",
                 "You are an expert news briefing assistant. Extract 3 to 5 key "
                 "highlights from the provided articles. Return ONLY a valid JSON "
                 "list of strings. No markdown formatting, no extra text."),
                ("user", "{articles_text}"),
            ])
            highlights_chain = highlights_prompt | self.llm | self.parser
            highlights_raw = await highlights_chain.ainvoke({"articles_text": articles_text})

            # Parse highlights — handle potential markdown/formatting from LLM
            highlights = self._parse_highlights(highlights_raw)

            # --- Group articles by category (locally, no LLM needed) ---
            categories_map: Dict[str, List[str]] = {}
            for article in articles:
                cat = article.get("category", "general")
                if cat not in categories_map:
                    categories_map[cat] = []
                categories_map[cat].append(article.get("title", ""))

            return {
                "summary": summary,
                "highlights": highlights[:5],
                "categories": categories_map,
            }

        except Exception as e:
            logger.error(f"Error summarizing articles: {e}")
            return {
                "summary": "Failed to generate summary. Please try again.",
                "highlights": [],
                "categories": {},
            }

    async def summarize_single(self, article: Dict) -> str:
        """Summarize a single article into 2-3 sentences."""
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system",
                 "You are a concise news assistant. Summarize the provided article "
                 "in 2-3 sentences. Be factual and direct."),
                ("user",
                 "Title: {title}\nDescription: {description}\nContent: {content}"),
            ])
            chain = prompt | self.llm | self.parser

            return await chain.ainvoke({
                "title": article.get("title", ""),
                "description": article.get("description", ""),
                "content": article.get("content", ""),
            })
        except Exception as e:
            logger.error(f"Error summarizing single article: {e}")
            return "Failed to generate summary."

    def _parse_highlights(self, raw: str) -> List[str]:
        """Parse LLM output into a clean list of highlight strings."""
        try:
            # Strip markdown code fences if present
            cleaned = re.sub(r"```json\n?|```", "", raw).strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
            return [str(parsed)]
        except (json.JSONDecodeError, ValueError):
            # If JSON parsing fails, split by newlines and clean up
            lines = [line.strip().lstrip("•-*0123456789. ") for line in raw.split("\n")]
            return [line for line in lines if line]
