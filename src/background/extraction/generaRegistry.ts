
export const GENERA_REGISTRY: Record<string, string> = {
  // Search
  'google.com': 'Search',
  'bing.com': 'Search',
  'duckduckgo.com': 'Search',
  'yahoo.com': 'Search',
  'baidu.com': 'Search',
  'yandex.com': 'Search',
  'kagi.com': 'Search',
  'ecosia.org': 'Search',

  // Social
  'facebook.com': 'Social',
  'twitter.com': 'Social',
  'x.com': 'Social',
  'instagram.com': 'Social',
  'linkedin.com': 'Social',
  'reddit.com': 'Social',
  'tiktok.com': 'Social',
  'pinterest.com': 'Social',
  'snapchat.com': 'Social',
  'tumblr.com': 'Social',
  'threads.net': 'Social',
  'bluesky.app': 'Social',
  'mastodon.social': 'Social',

  // Video
  'youtube.com': 'Video',
  'youtu.be': 'Video',
  'vimeo.com': 'Video',
  'twitch.tv': 'Video',
  'netflix.com': 'Video',
  'hulu.com': 'Video',
  'disneyplus.com': 'Video',
  'dailymotion.com': 'Video',
  'primevideo.com': 'Video',
  'hbomax.com': 'Video',
  'max.com': 'Video',
  'peacocktv.com': 'Video',

  // Development
  'github.com': 'Development',
  'gitlab.com': 'Development',
  'stackoverflow.com': 'Development',
  'npmjs.com': 'Development',
  'pypi.org': 'Development',
  'developer.mozilla.org': 'Development',
  'w3schools.com': 'Development',
  'geeksforgeeks.org': 'Development',
  'jira.com': 'Development',
  'atlassian.net': 'Development', // often jira
  'bitbucket.org': 'Development',
  'dev.to': 'Development',
  'hashnode.com': 'Development',
  'medium.com': 'Development', // General but often dev
  'vercel.com': 'Development',
  'netlify.com': 'Development',
  'heroku.com': 'Development',
  'aws.amazon.com': 'Development',
  'console.aws.amazon.com': 'Development',
  'cloud.google.com': 'Development',
  'azure.microsoft.com': 'Development',
  'portal.azure.com': 'Development',
  'docker.com': 'Development',
  'kubernetes.io': 'Development',

  // News
  'cnn.com': 'News',
  'bbc.com': 'News',
  'nytimes.com': 'News',
  'washingtonpost.com': 'News',
  'theguardian.com': 'News',
  'forbes.com': 'News',
  'bloomberg.com': 'News',
  'reuters.com': 'News',
  'wsj.com': 'News',
  'cnbc.com': 'News',
  'huffpost.com': 'News',
  'news.google.com': 'News',
  'foxnews.com': 'News',
  'nbcnews.com': 'News',
  'abcnews.go.com': 'News',
  'usatoday.com': 'News',

  // Shopping
  'amazon.com': 'Shopping',
  'ebay.com': 'Shopping',
  'walmart.com': 'Shopping',
  'etsy.com': 'Shopping',
  'target.com': 'Shopping',
  'bestbuy.com': 'Shopping',
  'aliexpress.com': 'Shopping',
  'shopify.com': 'Shopping',
  'temu.com': 'Shopping',
  'shein.com': 'Shopping',
  'wayfair.com': 'Shopping',
  'costco.com': 'Shopping',

  // Communication
  'mail.google.com': 'Communication',
  'outlook.live.com': 'Communication',
  'slack.com': 'Communication',
  'discord.com': 'Communication',
  'zoom.us': 'Communication',
  'teams.microsoft.com': 'Communication',
  'whatsapp.com': 'Communication',
  'telegram.org': 'Communication',
  'messenger.com': 'Communication',
  'skype.com': 'Communication',

  // Finance
  'paypal.com': 'Finance',
  'chase.com': 'Finance',
  'bankofamerica.com': 'Finance',
  'wellsfargo.com': 'Finance',
  'americanexpress.com': 'Finance',
  'stripe.com': 'Finance',
  'coinbase.com': 'Finance',
  'binance.com': 'Finance',
  'kraken.com': 'Finance',
  'robinhood.com': 'Finance',
  'fidelity.com': 'Finance',
  'vanguard.com': 'Finance',
  'schwab.com': 'Finance',
  'mint.intuit.com': 'Finance',

  // Education
  'wikipedia.org': 'Education',
  'coursera.org': 'Education',
  'udemy.com': 'Education',
  'edx.org': 'Education',
  'khanacademy.org': 'Education',
  'quizlet.com': 'Education',
  'duolingo.com': 'Education',
  'canvas.instructure.com': 'Education',
  'blackboard.com': 'Education',
  'mit.edu': 'Education',
  'harvard.edu': 'Education',
  'stanford.edu': 'Education',
  'academia.edu': 'Education',
  'researchgate.net': 'Education',

  // Design
  'figma.com': 'Design',
  'canva.com': 'Design',
  'behance.net': 'Design',
  'dribbble.com': 'Design',
  'adobe.com': 'Design',
  'unsplash.com': 'Design',
  'pexels.com': 'Design',
  'pixabay.com': 'Design',
  'shutterstock.com': 'Design',

  // Productivity
  'docs.google.com': 'Productivity',
  'sheets.google.com': 'Productivity',
  'slides.google.com': 'Productivity',
  'drive.google.com': 'Productivity',
  'notion.so': 'Productivity',
  'trello.com': 'Productivity',
  'asana.com': 'Productivity',
  'monday.com': 'Productivity',
  'airtable.com': 'Productivity',
  'evernote.com': 'Productivity',
  'dropbox.com': 'Productivity',
  'clickup.com': 'Productivity',
  'linear.app': 'Productivity',
  'miro.com': 'Productivity',
  'lucidchart.com': 'Productivity',

  // AI
  'openai.com': 'AI',
  'chatgpt.com': 'AI',
  'anthropic.com': 'AI',
  'midjourney.com': 'AI',
  'huggingface.co': 'AI',
  'bard.google.com': 'AI',
  'gemini.google.com': 'AI',
  'claude.ai': 'AI',
  'perplexity.ai': 'AI',
  'poe.com': 'AI',

  // Music/Audio
  'spotify.com': 'Music',
  'soundcloud.com': 'Music',
  'music.apple.com': 'Music',
  'pandora.com': 'Music',
  'tidal.com': 'Music',
  'bandcamp.com': 'Music',
  'audible.com': 'Music',

  // Gaming
  'steampowered.com': 'Gaming',
  'roblox.com': 'Gaming',
  'epicgames.com': 'Gaming',
  'xbox.com': 'Gaming',
  'playstation.com': 'Gaming',
  'nintendo.com': 'Gaming',
  'ign.com': 'Gaming',
  'gamespot.com': 'Gaming',
  'kotaku.com': 'Gaming',
  'polygon.com': 'Gaming'
};

export function getGenera(hostname: string, customRegistry?: Record<string, string>): string | null {
  if (!hostname) return null;

  // 0. Check custom registry first
  if (customRegistry) {
      const parts = hostname.split('.');
      // Check full hostname and progressively shorter suffixes
      for (let i = 0; i < parts.length - 1; i++) {
          const domain = parts.slice(i).join('.');
          if (customRegistry[domain]) {
              return customRegistry[domain];
          }
      }
  }

  // 1. Exact match
  if (GENERA_REGISTRY[hostname]) {
    return GENERA_REGISTRY[hostname];
  }

  // 2. Subdomain check (stripping subdomains)
  // e.g. "console.aws.amazon.com" -> "aws.amazon.com" -> "amazon.com"
  const parts = hostname.split('.');

  // Try matching progressively shorter suffixes
  // e.g. a.b.c.com -> b.c.com -> c.com
  for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join('.');
      if (GENERA_REGISTRY[domain]) {
          return GENERA_REGISTRY[domain];
      }
  }

  return null;
}
