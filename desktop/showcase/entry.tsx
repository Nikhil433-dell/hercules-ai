import React from 'react';
import { createRoot } from 'react-dom/client';
import SidePanel from '../src/components/SidePanel';
import NewsPopup from '../src/components/NewsPopup';
import ArticleView from '../src/components/ArticleView';
import '../src/index.css';
import '../src/components/SidePanel.css';
import type { NewsItem, NewsState, ElectronAPI } from '../src/shared/news';

const timestamp = new Date().toISOString();
const articles: NewsItem[] = [
  { id: 'preview-msft', title: 'Microsoft shares its latest quarterly update', summary: 'Illustrative sample content. A concise publisher description gives you the context behind a headline. Open the original source when you want to read more. Prices shown in this preview are examples, not market data.', source: 'Sample headline', category: 'business', url: 'https://www.microsoft.com/en-us/Investor/', publishedAt: timestamp, tickers: ['MSFT'], quotes: [{symbol:'MSFT',price:420,currency:'USD',asOf:timestamp,source:'Sample data'}] },
  { id: 'preview-aapl', title: 'Apple introduces its next chapter of products', summary: 'An illustrative story shows how company tickers and quotes sit alongside the news.', source: 'Sample headline', category: 'business', url: 'https://www.apple.com/newsroom/', publishedAt: new Date(Date.now()-300000).toISOString(), tickers: ['AAPL'], quotes: [{symbol:'AAPL',price:225,currency:'USD',asOf:timestamp,source:'Sample data'}] },
  { id: 'preview-nvda', title: 'NVIDIA outlines a new computing milestone', summary: 'Sample content for the interface walkthrough. Follow a headline from the feed to its original source.', source: 'Sample headline', category: 'technology', url: 'https://nvidianews.nvidia.com/', publishedAt: new Date(Date.now()-900000).toISOString(), tickers: ['NVDA'], quotes: [{symbol:'NVDA',price:145,currency:'USD',asOf:timestamp,source:'Sample data'}] },
];
const state: NewsState = {articles,category:'business',loading:false,error:null,lastChecked:timestamp,refreshIntervalSeconds:60,quoteStatus:{state:'ready',message:'Sample interface content'}};
const listeners: Array<(state:NewsState)=>void> = [];
const noop = () => undefined;
const api: ElectronAPI = {
 getNewsState:async()=>state, onNewsState:callback=>{listeners.push(callback);return noop;}, refreshNews:noop, setCategory:category=>{state.category=category;listeners.forEach(callback=>callback({...state}));},
 minimizePanel:noop,expandPanel:noop,quitApp:noop,openExternal:noop,openArticle:noop,getWindowView:async()=>({kind:'panel',article:null}),onWindowView:()=>noop,
};
window.electronAPI=api;
localStorage.setItem('hercules_panel_theme','dark');
document.body.dataset.theme='dark';
document.body.style.background='#292a2c';
const kind=new URLSearchParams(location.search).get('kind');
const rootElement=document.getElementById('root');
if (!rootElement) throw new Error('Missing preview root');
const root=createRoot(rootElement);
root.render(kind==='popup'?<NewsPopup article={articles[0]} expiresAt={Date.now()+10000}/>:kind==='article'?<ArticleView article={articles[0]}/>:<SidePanel onMinimize={noop}/>);
