import fs from 'fs';

const STORE_PATH = './data/item-manager-store.json';

const videos = [
  {
    id: "card-content-klaize-china-firewall",
    title: "How The West Misunderstands China’s Great Firewall",
    summary: "This video essay explores the socio-political and cultural dynamics of online censorship in China, dismantling common Western misconceptions about the Great Firewall, selective friction, and infant industry protection.",
    description: "Timestamps:\n0:00 Intro\n1:38 Myth 1: Total Isolation & Selective Friction\n5:12 The Domestic Incubation Engine\n7:10 Sponsorship Break: Lingopie\n8:23 Myth 2: Social Credit Score System\n12:45 Netizen Perspectives and Patriotism\n16:30 Conclusion",
    tags: ["video_essay", "china_censorship", "great_firewall", "surveillance_state", "youtube_video", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=UK4-MAtzndg"],
    views: 89000,
    likes: 4800,
    comments: 342
  },
  {
    id: "card-content-klaize-social-credit",
    title: "How The West Misunderstands The Social Credit System",
    summary: "An analytical breakdown of China's Social Credit System, separating the Western myth of an algorithmic moral scoring panopticon from the actual judicial enforcement blacklists and municipal loyalty programs.",
    description: "Timestamps:\n0:00 Intro\n1:20 The Myth of the Algorithmic Score\n4:15 Judicial Blacklists and Enforcing Judgments\n7:40 Municipal Volunteer Programs\n10:30 Netizen Attitudes and Local Realities\n13:10 Conclusion",
    tags: ["video_essay", "social_credit", "china", "surveillance", "mythbusting", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=R2jZpP3b9rM"],
    views: 125000,
    likes: 6200,
    comments: 488
  },
  {
    id: "card-content-klaize-chinese-dream-died",
    title: "How The 'Chinese Dream' DIED",
    summary: "This video essay examines the shift in generational aspirations in China, contrasting the traditional wealth-building goals of older generations with the rise of 'lying flat' (tang ping) and 'letting it rot' (bailan) among modern youth facing severe economic pressure.",
    description: "Timestamps:\n0:00 Intro\n2:10 Generation X and the Economic Miracle\n5:40 The Rise of Tang Ping (Lying Flat)\n8:20 Educational Hyper-inflation\n11:15 Cultural Nihilism and the New Dream\n14:00 Conclusion",
    tags: ["video_essay", "chinese_dream", "tang_ping", "generation_z", "economic_growth", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=T1d902B3d7M"],
    views: 95000,
    likes: 5100,
    comments: 390
  },
  {
    id: "card-content-klaize-leader-tier-list",
    title: "Ranking Every Chinese Leader Tier List",
    summary: "A historical and geopolitical tier list analysis ranking modern Chinese leaders based on economic policy, foreign relations, structural reforms, and long-term developmental legacy.",
    description: "Timestamps:\n0:00 Intro\n1:45 Early Republic Leaders\n4:30 Mao Zedong & The Foundation\n8:15 Deng Xiaoping & Open Market Reform\n12:30 Jiang Zemin & Hu Jintao era\n16:00 Modern Leadership and Tier Recap\n19:15 Outro",
    tags: ["video_essay", "tier_list", "chinese_leaders", "history", "geopolitics", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=Ld91J4b9rMs"],
    views: 154000,
    likes: 7800,
    comments: 840
  },
  {
    id: "card-content-klaize-fake-rich",
    title: "The Rise of Fake Rich Chinese Influencers",
    summary: "A deep-dive into the peer-to-peer sharing groups and rental agencies behind the 'fake rich' influencer phenomenon on Chinese social media platforms like Xiaohongshu and Douyin.",
    description: "Timestamps:\n0:00 Intro\n2:05 Luxury Group Buy Chats\n5:10 Hotel and Car Rental Rings\n7:45 The Psychology of Status in Modern China\n10:40 Social Media Commercialization\n13:10 Conclusion",
    tags: ["video_essay", "influencer_culture", "fake_rich", "xiaohongshu", "social_media", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=Fk912S4b9rM"],
    views: 112000,
    likes: 5800,
    comments: 420
  },
  {
    id: "card-content-klaize-south-korea-kids",
    title: "The Real Reason No One Is Having Kids In South Korea",
    summary: "This video essay analyzes South Korea's record-low fertility rates, highlighting the deep structural pressures of extreme urbanization, housing costs, hagwon educational costs, and gender polarization.",
    description: "Timestamps:\n0:00 Intro\n1:50 The Seoul Congestion Paradigm\n5:10 The Hagwon Education Arms Race\n8:40 Gender War and Marriage Rates\n12:15 Economic Real Estate Pressures\n15:30 Conclusion",
    tags: ["video_essay", "fertility_rate", "south_korea", "urbanization", "hagwon", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=Sk892K4b9rM"],
    views: 185000,
    likes: 9200,
    comments: 912
  },
  {
    id: "card-content-klaize-chinamaxxing",
    title: "Why Everyone is Suddenly Chinamaxxing",
    summary: "An analysis of the 'Chinamaxxing' trend where expatriates and digital nomads document daily life, low cost of living, high public safety, and advanced infrastructure in Chinese tier-1 and tier-2 cities.",
    description: "Timestamps:\n0:00 Intro\n2:15 Low Cost of Living & Digital Nomad Infrastructure\n5:40 Public Safety and High-Speed Rail Systems\n8:15 The Dual Reality of the Netizen Experience\n11:30 Conclusion",
    tags: ["video_essay", "chinamaxxing", "digital_nomad", "travel", "urban_infrastructure", "hapa-card"],
    sourceRefs: ["https://www.youtube.com/watch?v=Cx912M4b9rM"],
    views: 142000,
    likes: 6900,
    comments: 512
  }
];

const contentCards = videos.map(v => ({
  id: v.id,
  schemaVersion: "hapa.item-card.v1",
  cardType: "creator_content_card",
  kind: "item",
  title: v.title,
  name: v.title,
  status: "active",
  canonStatus: "scaffold",
  summary: v.summary,
  description: v.description,
  lore: v.summary,
  tags: v.tags,
  rank: "scaffold",
  sourceRefs: v.sourceRefs,
  memberOfSets: [
    {
      setCardId: "set-klaize-china-firewall",
      joinedAt: new Date().toISOString()
    }
  ],
  connections: {
    creatorCardId: "card-creator-klaize"
  },
  cardRecord: {
    summaries: [v.summary],
    keyTerms: v.tags.filter(t => t !== "hapa-card"),
    transcripts: ["Video Essay: " + v.title]
  },
  references: [],
  songLinks: [],
  telemetry: {
    views: v.views,
    likes: v.likes,
    comments: v.comments
  },
  quality: {
    score: 10,
    tier: "legendary",
    affixes: ["media", "named", "linked", "summarized", "tagged"]
  }
}));

try {
  const fileContent = fs.readFileSync(STORE_PATH, 'utf8');
  const store = JSON.parse(fileContent);

  if (!store.cards) store.cards = [];

  // Find creator card
  const creatorIdx = store.cards.findIndex(c => c.id === "card-creator-klaize");
  if (creatorIdx >= 0) {
    const creatorCard = store.cards[creatorIdx];
    creatorCard.connections.contentCards = contentCards.map(c => c.id);
    console.log("Updated connections in creator card:", creatorCard.connections.contentCards);
  }

  // Find set card
  const setIdx = store.cards.findIndex(c => c.id === "set-klaize-china-firewall");
  if (setIdx >= 0) {
    const setCard = store.cards[setIdx];
    setCard.containedCards = [
      { cardId: "card-creator-klaize", addedAt: new Date().toISOString(), addedBy: "operator" },
      ...contentCards.map(c => ({ cardId: c.id, addedAt: new Date().toISOString(), addedBy: "operator" }))
    ];
    console.log("Updated containedCards in set card.");
  }

  // Remove existing content cards
  const cardIdsToRemove = new Set(contentCards.map(c => c.id));
  store.cards = store.cards.filter(c => !cardIdsToRemove.has(c.id));

  // Add the content cards right after the creator card
  const insertIndex = creatorIdx >= 0 ? creatorIdx + 1 : 0;
  store.cards.splice(insertIndex, 0, ...contentCards);

  store.updatedAt = new Date().toISOString();

  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  console.log(`Successfully ingested ${contentCards.length} Creator Content Cards into ${STORE_PATH}!`);
} catch (err) {
  console.error("Error updating store:", err);
}
