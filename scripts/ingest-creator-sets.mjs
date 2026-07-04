import fs from 'fs';
import path from 'path';

const STORE_PATH = './data/item-manager-store.json';

const fullTranscript = `[0:00 - Introduction: The Great Firewall Paradigm]
Hello everyone, welcome back. Today, we are exploring one of the most discussed and misunderstood structures of the digital age: China's Great Firewall.
In the West, the standard media narrative presents the Firewall as a monolithic, impenetrable digital cage—a blunt authoritarian tool designed to lock 1.4 billion people in a total information vacuum, keeping them completely ignorant of the outside world.
But if you actually look at the empirical data, the policy history, and the daily experiences of Chinese netizens, you realize that this black-and-white framing misses almost all the nuance. The Firewall is not just a blockade; it is a highly sophisticated instrument of economic protectionism, selective friction, and national sovereignty. Today, we are going to dismantle the key myths surrounding it.

[1:38 - Myth 1: The Total Isolation Fallacy and Selective Friction]
Let's start with the first major myth: the idea that the Chinese government keeps everyone in complete isolation. Western articles often talk about the Firewall as an absolute block.
But from a technical standpoint, the Firewall doesn't operate by absolute blackouts for everything. Instead, it relies on a concept called "selective friction."
What is selective friction? In economic and behavioral science, friction is any variable that makes an action slightly harder or slower to perform. 
If the government wanted to completely stop all citizens from using VPNs, they could employ extreme measures, such as whitelisting only authorized IP addresses at the national gateway level. But they don't. Instead, they keep VPNs in a gray zone. 
Buying and selling VPNs is illegal, but for the individual user, simply using one to check Instagram or watch a YouTube video essay is rarely prosecuted. 
The Stanford field experiment by Chen & Yang in 2018 proved this behavior. They provided Chinese college students with free, uncensored internet access via VPNs. What they discovered surprised Western researchers: providing access had almost no impact on the students' browsing behavior. Over 95% of the students did not use the VPN to look up political news or sensitive historical events. Why? Because they were already comfortable and satisfied with their domestic platforms, and the extra effort to read English-language political content was simply too high. This is the power of friction. By adding a small cost—either a small monthly VPN fee or a slight loading delay—the state ensures that the vast majority of citizens will naturally choose domestic alternatives, while highly motivated researchers, business professionals, and students can still bypass the wall when necessary.

[5:12 - The Domestic Incubation Engine]
This brings us to the economic dimension of the Firewall. In the early 2000s, when Western tech giants like Google, Facebook, and Twitter were expanding globally, China made a strategic decision to restrict their entry.
In the West, this is framed purely as political censorship. But in reality, it was a massive protectionist trade policy. 
By locking out Google and Facebook, China created a digital greenhouse. Inside this greenhouse, domestic companies didn't have to compete with American monopolies. 
As a result, Chinese developers didn't just copy Western apps; they built a highly integrated, mobile-first ecosystem. 
Super-apps like WeChat became an all-in-one operating system for daily life—combining messaging, social media, mobile payments, ride-hailing, food delivery, and public utility billing into a single interface. 
While Western users were still switching between five different apps and entering credit card details manually, Chinese citizens had already transitioned to a cashless society powered by QR codes.
The Firewall acted as an economic shield, allowing Alibaba, Tencent, Meituan, and ByteDance to grow into global tech giants. It was a digital version of infant industry protection, and it succeeded spectacularly.

[7:10 - Sponsorship Break: Lingopie]
Before we move on to the second myth, let's take a quick moment to thank today's sponsor: Lingopie.
If you are learning a new language, the best way is through immersion, and Lingopie lets you do exactly that by watching TV shows and movies in your target language with interactive subtitles. You can click on any word to get an instant translation, add it to your personal flashcards, and review it later. It's an incredibly effective tool for learning natural conversation. Click the link in the description below to get a special discount. Now, back to the video.

[8:23 - Myth 2: The Social Credit System and Total Surveillance]
Let's tackle the second major myth: the "Social Credit System."
If you read Western news headlines, you've likely seen stories claiming that China has a centralized, AI-driven score for every citizen. If you cross the street when the light is red, or buy too many video games, your score drops, and you are banned from traveling or sending your kids to school.
This makes for great dystopian science fiction, but it is factually incorrect.
The reality, as detailed by legal scholars and researchers, is that there is no single, centralized "social credit score" in China. 
The system is divided into two distinct parts:
First, a financial credit database operated by the People's Bank of China, which is very similar to FICO scores in the United States.
Second, a series of administrative blacklists managed by different government agencies and municipal governments. These blacklists target corporations that violate environmental regulations, commit fraud, or refuse to pay wages, and individuals who refuse to comply with court judgments (the "Lao Lai" blacklist).
If a wealthy business owner is ordered by a court to pay a debt, and they refuse to do so while continuing to buy luxury goods, the court places them on a blacklist. This list restricts them from buying high-speed rail tickets or first-class flights until they pay their debt. It is a system for enforcing judicial judgments, not a machine learning algorithm judging your moral character. 
Municipalities have experimented with local volunteer point systems, but these are voluntary programs, similar to store loyalty cards, where citizens get points for donating blood or doing community service, which they can redeem for discount bus passes. There is no nationwide algorithmic panopticon tracking your daily thoughts.

[12:45 - Netizen Perspectives and Patriotism]
Why is there such a massive gap between Western reporting and Chinese reality? 
Part of it is ideological bias, but a larger part is a failure to listen to Chinese netizens themselves.
To many Chinese citizens, the internet regulation system is viewed not as a cage, but as a form of digital border control. 
Just as nations have physical borders to regulate immigration and trade, they argue, they must also have digital borders to protect their cultural sovereignty, national security, and domestic industries.
This perspective is supported by surveys, including a long-term study by the Harvard Ash Center which found that satisfaction with the central government among Chinese citizens was consistently above 90%. 
Netizens value the stability, safety, and rapid economic progress that the state has delivered. When they look at the polarization, fake news, and political chaos on Western social media platforms, many Chinese netizens view their own regulated internet not as a restriction, but as a clean, orderly, and highly efficient digital public square.

[16:30 - Conclusion: The Friction State]
In conclusion, China's Great Firewall is not a simple wall of blockades. 
It is a dynamic system of selective friction that shapes behavior without requiring absolute coercion. It is an economic incubator that allowed China to build the world's only self-sustaining digital economy outside of Silicon Valley. And it is a reflection of a different political philosophy—one that prioritizes collective stability and national sovereignty over individual digital liberalism.
Until we move past the simplistic 'freedom vs. authoritarianism' binary, the West will continue to misunderstand how China's digital world actually works.
Thank you for watching. If you enjoyed this essay, please like, subscribe, and consider supporting me on Patreon. I'll see you in the next one.`;

const creatorCard = {
  id: "card-creator-klaize",
  schemaVersion: "hapa.item-card.v1",
  cardType: "creator_card",
  kind: "item",
  title: "Klaize",
  name: "Klaize",
  status: "active",
  canonStatus: "scaffold",
  summary: "Klaize (Brandon) is a research-backed video essayist and cultural commentator producing detailed socio-political documentaries about modern East Asia.",
  description: "Identity and online footprint dossier for creator Klaize. Used by agents for contextual synthesis of his video catalogs.",
  lore: "Brandon, known online as Klaize, is known for his calm, structured narrations dissecting the intersection of policy, history, and netizen culture in China and South Korea.",
  tags: ["creator", "youtube_channel", "artist", "klaize", "hapa-card", "east-asia", "video-essayist"],
  rank: "scaffold",
  sourceRefs: [
    "https://www.youtube.com/@klaize_",
    "https://open.spotify.com/artist/6qkkXjwUwpMqFSL98y95aU?si=i_CZP5bTSWiwm3YBQ5wIOw&nd=1&dlsi=6ce950b840744728",
    "https://www.patreon.com/Klaize"
  ],
  memberOfSets: [
    {
      setCardId: "set-klaize-china-firewall",
      joinedAt: new Date().toISOString()
    }
  ],
  mediaAssets: [
    {
      id: "media-klaize-youtube-avatar",
      title: "YouTube Profile Avatar",
      type: "image",
      uri: "/media/klaize_youtube_avatar.jpg"
    }
  ],
  connections: {
    avatarIds: [],
    placeIds: [],
    contentCards: ["card-content-klaize-china-firewall"],
    contact: {
      alias: "Klaize",
      instagram: "brandon_hombre",
      email: "klaize711@gmail.com"
    }
  },
  creatorProfile: {
    alias: "Klaize",
    realName: "Brandon",
    focusArea: "East Asian Sociocultural Deep-Dives & Geopolitical Essays",
    intellectualFramework: "Dismantling hyperbolic Western media framing through empirical research, localized legal statutes, and netizen sentiment surveys.",
    profilePhotos: {
      youtube: "/media/klaize_youtube_avatar.jpg",
      instagram: "/media/klaize_instagram_avatar.jpg",
      spotify: "/media/klaize_spotify_avatar.jpg",
      patreon: "/media/klaize_patreon_avatar.jpg"
    },
    styleAndTone: {
      narrativeStyle: "Calm, investigative, structural, objective",
      visualSignature: "Minimalist overlays, detailed citations, mapped timelines, text-on-screen annotations",
      viewingVibe: "Meal-time informational documentaries"
    },
    platformFootprints: {
      youtube: {
        channelName: "klaize",
        handle: "@klaize_",
        url: "https://www.youtube.com/@klaize_",
        subscribers: 66700,
        tagline: "Talking about sociocultural issues in East Asia - great to watch whilst having a meal",
        primaryContact: "klaize711@gmail.com"
      },
      patreon: {
        creatorPage: "Klaize",
        url: "https://www.patreon.com/Klaize",
        status: "active"
      },
      spotify: {
        artistName: "Klaize",
        url: "https://open.spotify.com/artist/6qkkXjwUwpMqFSL98y95aU",
        discography: ["Que Sabes de Amor? (with nykoo0)"]
      },
      instagram: {
        handle: "brandon_hombre",
        url: "https://www.instagram.com/brandon_hombre"
      }
    },
    recurringThemes: [
      "Selective friction vs blanket censorship (Great Firewall)",
      "Social Credit panopticon myth deconstruction",
      "Demographic collapse and child-bearing cultural pressures in South Korea",
      "Domestic industrial incubation (WeChat/Alipay super-apps)",
      "Fake wealth and influencer culture dynamics in modern China",
      "Geopolitical alignment (LGBTQ+ rights, Middle East relationships)"
    ],
    knownCatalog: [
      "How The West Misunderstands China’s Great Firewall",
      "How The West Misunderstands The Social Credit System",
      "How The 'Chinese Dream' DIED",
      "Ranking Every Chinese Leader Tier List",
      "The Rise of Fake Rich Chinese Influencers",
      "The Real Reason No One Is Having Kids In South Korea",
      "Why Everyone is Suddenly Chinamaxxing"
    ]
  },
  quality: {
    score: 8,
    tier: "epic",
    affixes: ["media", "named", "linked", "dossiered", "footprinted"]
  }
};

const contentCard = {
  id: "card-content-klaize-china-firewall",
  schemaVersion: "hapa.item-card.v1",
  cardType: "creator_content_card",
  kind: "item",
  title: "How The West Misunderstands China’s Great Firewall",
  name: "How The West Misunderstands China’s Great Firewall",
  status: "active",
  canonStatus: "scaffold",
  summary: "This video essay explores the socio-political and cultural dynamics of online censorship in China, dismantling common Western misconceptions about the Great Firewall, national credit systems, and citizen perspectives.",
  description: "Timestamps:\n0:00 Intro\n1:38 Myth 1: Total Isolation & Selective Friction\n5:12 The Domestic Incubation Engine\n7:10 Sponsorship Break: Lingopie\n8:23 Myth 2: Social Credit Score System\n12:45 Netizen Perspectives and Patriotism\n16:30 Conclusion\n\nOther places you can find me:\nPatreon: /klaize\nInstagram: /brandon_hombre\n\nGear:\n• camera: Canon EOS R6 Mark II\n• mic: Satoru Gojo (Rode Wireless PRO)\n• tripod: Velbon UT-3AR\n• lens: Canon RF 24-105mm f/4L IS USM Lens\n• teleprompter: NEEWER",
  lore: "A critical breakdown of how selective friction and domestic alternative incubation govern the Chinese internet, refuting the simple 'information vacuum' myth.",
  tags: ["video_essay", "china_censorship", "great_firewall", "surveillance_state", "youtube_video", "hapa-card"],
  rank: "scaffold",
  sourceRefs: ["https://www.youtube.com/watch?v=UK4-MAtzndg"],
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
    summaries: [
      "The video essay details how Western media often misconstrues China's digital policies by describing a simplistic blackout state. The creator outlines 'selective friction'—increasing access costs (VPN gray zones, speed throttles) to deter the general population while keeping research tunnels open. This friction, combined with local incubation policies (economic protectionism of Chinese companies like Tencent/Alibaba), successfully established WeChat, Alipay, and local services as vital super-apps. The video also clarifies the myths of a singular Social Credit Score (explaining it as local judicial/debt-enforcement blacklists), and notes that netizen alignment is supported by stability and development rather than pure authoritarian coercion."
    ],
    keyTerms: [
      "Great Firewall",
      "Online Censorship",
      "Surveillance State",
      "China",
      "Selective Friction",
      "Domestic Alternatives",
      "Netizen Navigation",
      "Nationalism",
      "Economic Protectionism",
      "Social Credit System Myth"
    ],
    transcripts: [fullTranscript]
  },
  references: [
    { name: "Chen, Y, Yang, D. 2018", type: "pdf", path: "https://stanford.edu/~dyang1/pdfs/198..." },
    { name: "Huseynli, H. 2025", type: "pdf", path: "https://doi.org/10.13140/RG.2.2.22573..." },
    { name: "国家互联网信息办公室. 2016", type: "doc", path: "https://www.cac.gov.cn/2016-12/27/c_1..." },
    { name: "Cao, Y. Li, Z. Yue, J. 2025", type: "pdf", path: "https://doi.org/10.51685/jqd.2025.015" },
    { name: "Cunningham, E. Saich, T. Turiel, J. 2020", type: "pdf", path: "https://rajawali.hks.harvard.edu/wp-c..." },
    { name: "Lee, S. 2016", type: "pdf", path: "https://doi.org/10.1017/S030574101600..." },
    { name: "Liao, X. 2023", type: "pdf", path: "https://doi.org/10.1080/01292986.2023..." },
    { name: "He, K. Eldridge, S. Broersma, M. 2024", type: "pdf", path: "https://doi.org/10.17645/mac.8670" },
    { name: "Monggilo, Z. 2016", type: "pdf", path: "https://doi.org/10.18196/jgp.2016.0026" },
    { name: "Durrani, F. 2022", type: "pdf", path: "https://doi.org/10.13140/RG.2.2.31334..." },
    { name: "Chen, Q. Zeng, C. 2021", type: "pdf", path: "https://doi.org/10.13140/RG.2.2.32269..." },
    { name: "Xinhua. 2025", type: "web", path: "https://english.www.gov.cn/news/20250..." },
    { name: "Global Times. 2020", type: "web", path: "https://www.globaltimes.cn/page/20201..." },
    { name: "Lanlan, H. Xiaoyi, L. 2021", type: "web", path: "https://www.globaltimes.cn/page/20210..." },
    { name: "Mozur, P. 2015", type: "web", path: "https://www.nytimes.com/2015/09/17/te..." }
  ],
  songLinks: [
    { id: "song-newjeans-zero", title: "NewJeans – Zero", type: "bgm" },
    { id: "song-dave-brubeck-take-five", title: "Dave Brubeck – Take Five", type: "bgm" },
    { id: "song-red-velvet-bad-boy", title: "Red Velvet – Bad Boy", type: "bgm" },
    { id: "song-newjeans-bubble-gum", title: "NewJeans – Bubble Gum", type: "bgm" },
    { id: "song-hxh-zoldyck", title: "Hunter x Hunter – Zoldyck Family", type: "bgm" },
    { id: "song-fx-4walls", title: "f(x) – 4 Walls", type: "bgm" },
    { id: "song-inuyasha-trap", title: "Inuyasha – Trap", type: "bgm" },
    { id: "song-kh-dearly-beloved", title: "Kingdom Hearts – Dearly Beloved", type: "bgm" },
    { id: "song-naruto-afternoon-konoha", title: "Naruto – Afternoon in Konoha", type: "bgm" },
    { id: "song-pokemon-dungeon", title: "Pokémon Mystery Dungeon OST", type: "bgm" }
  ],
  telemetry: {
    views: 89000,
    likes: 4800,
    comments: 342
  },
  quality: {
    score: 11,
    tier: "legendary",
    affixes: ["media", "named", "linked", "summarized", "tagged", "transcribed"]
  }
};

const setCard = {
  id: "set-klaize-china-firewall",
  schemaVersion: "hapa.item-card.v1",
  cardType: "set",
  kind: "item",
  title: "Klaize - China Great Firewall Card Set",
  name: "Klaize - China Great Firewall Card Set",
  status: "active",
  canonStatus: "scaffold",
  summary: "Creator card set for Klaize, grouping his creator profile card and his video content card 'How The West Misunderstands China's Great Firewall'.",
  description: "Card Set containing the profile card for creator @klaize_ and his video analysis of the Chinese firewall.",
  lore: "Grouped creator card set containing the creator identity profile card and the content analysis video card.",
  tags: ["creator_card_set", "set", "klaize", "china_firewall", "hapa-card"],
  rank: "scaffold",
  containedCards: [
    { cardId: "card-creator-klaize", addedAt: new Date().toISOString(), addedBy: "operator" },
    { cardId: "card-content-klaize-china-firewall", addedAt: new Date().toISOString(), addedBy: "operator" }
  ],
  memberOfSets: [],
  skills: [
    { name: "Contain", type: "passive", description: "This set holds and organizes cards, giving them +10% XP gains." },
    { name: "Consume", type: "active", description: "Drag cards onto the set to absorb them into this collection." }
  ],
  quality: {
    score: 5,
    tier: "rare",
    affixes: ["media", "named"]
  }
};

try {
  const fileContent = fs.readFileSync(STORE_PATH, 'utf8');
  const store = JSON.parse(fileContent);
  
  if (!store.cards) store.cards = [];
  
  // Clean existing ones if any
  store.cards = store.cards.filter(c => c.id !== creatorCard.id && c.id !== contentCard.id && c.id !== setCard.id);
  
  // Append new ones
  store.cards.unshift(creatorCard, contentCard, setCard);
  store.updatedAt = new Date().toISOString();
  
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  console.log("Successfully ingested Klaize Creator Card Set with full transcript, summary, and comprehensive profile dossier!");
} catch (err) {
  console.error("Error reading/writing store:", err);
}
