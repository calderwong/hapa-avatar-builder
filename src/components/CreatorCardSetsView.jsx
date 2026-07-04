import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Film, 
  BookOpen, 
  Music, 
  Layers3, 
  ChevronRight, 
  Plus, 
  ExternalLink, 
  Activity, 
  Heart, 
  MessageSquare, 
  Eye, 
  Check, 
  Flame, 
  Smartphone,
  Sparkles,
  Link2,
  Trash2,
  FileText
} from 'lucide-react';

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

export default function CreatorCardSetsView({
  itemStore,
  avatars,
  selectedAvatarId,
  onCreateItem,
  onUpdateItem
}) {
  const [selectedSetId, setSelectedSetId] = useState("set-klaize-china-firewall");
  const [activeSubTab, setActiveSubTab] = useState("content"); // "profile", "content", or "sponsors"
  const [simulationLog, setSimulationLog] = useState(["Ecosystem listener active.", "Ready for creator set simulation."]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [xpAnimation, setXpAnimation] = useState(false);
  const [selectedContentCardId, setSelectedContentCardId] = useState(null);
  const [selectedSponsorCardId, setSelectedSponsorCardId] = useState(null);

  // Form states
  const [newCreatorName, setNewCreatorName] = useState("");
  const [newCreatorYoutube, setNewCreatorYoutube] = useState("");
  const [newCreatorSpotify, setNewCreatorSpotify] = useState("");
  const [newCreatorPatreon, setNewCreatorPatreon] = useState("");
  const [newCreatorInstagram, setNewCreatorInstagram] = useState("");
  const [newContentTitle, setNewContentTitle] = useState("");
  const [newContentUrl, setNewContentUrl] = useState("");
  const [newContentDesc, setNewContentDesc] = useState("");
  const [newContentRefs, setNewContentRefs] = useState("");
  const [newContentBgm, setNewContentBgm] = useState("");

  // Filter sets from items
  const sets = useMemo(() => {
    return (itemStore?.cards || []).filter(card => card.cardType === 'set');
  }, [itemStore?.cards]);

  const selectedSet = useMemo(() => {
    return sets.find(s => s.id === selectedSetId) || sets[0] || null;
  }, [sets, selectedSetId]);

  // Resolve member cards
  const memberCards = useMemo(() => {
    if (!selectedSet || !selectedSet.containedCards) return [];
    return selectedSet.containedCards.map(ref => {
      return (itemStore?.cards || []).find(c => c.id === ref.cardId);
    }).filter(Boolean);
  }, [selectedSet, itemStore?.cards]);

  const creatorCard = useMemo(() => {
    return memberCards.find(c => c.cardType === 'creator_card');
  }, [memberCards]);

  const creatorHeroImage = useMemo(() => {
    return creatorCard?.creatorProfile?.profilePhotos?.youtube || creatorCard?.mediaAssets?.[0]?.uri || "";
  }, [creatorCard]);

  const contentCards = useMemo(() => {
    return memberCards.filter(c => c.cardType === 'creator_content_card');
  }, [memberCards]);

  const selectedContentCard = useMemo(() => {
    if (selectedContentCardId) {
      return contentCards.find(c => c.id === selectedContentCardId) || contentCards[0] || null;
    }
    return contentCards[0] || null;
  }, [contentCards, selectedContentCardId]);

  const embedUrl = useMemo(() => {
    if (!selectedContentCard) return null;
    const ref = selectedContentCard.sourceRefs?.[0];
    const url = typeof ref === 'string' ? ref : (ref?.label || ref?.uri || "");
    return getYoutubeEmbedUrl(url);
  }, [selectedContentCard]);

  const sponsorCards = useMemo(() => {
    return memberCards.filter(c => c.cardType === 'creator_sponsor_card');
  }, [memberCards]);

  const selectedSponsorCard = useMemo(() => {
    if (selectedSponsorCardId) {
      return sponsorCards.find(c => c.id === selectedSponsorCardId) || sponsorCards[0] || null;
    }
    return sponsorCards[0] || null;
  }, [sponsorCards, selectedSponsorCardId]);

  // Simulate video engagement and raise XP
  const handleSimulateEngagement = () => {
    if (!selectedContentCard || !selectedSet) return;
    
    // Simulate increase in views, likes, comments
    const deltaViews = Math.floor(Math.random() * 5000) + 1000;
    const deltaLikes = Math.floor(Math.random() * 300) + 50;
    const deltaComments = Math.floor(Math.random() * 30) + 5;
    
    const updatedTelemetry = {
      views: (selectedContentCard.telemetry?.views || 0) + deltaViews,
      likes: (selectedContentCard.telemetry?.likes || 0) + deltaLikes,
      comments: (selectedContentCard.telemetry?.comments || 0) + deltaComments
    };

    // Calculate quality increase
    const nextXp = (selectedContentCard.experience || 0) + 25;
    const nextLevel = nextXp >= 100 ? (selectedContentCard.level || 1) + 1 : (selectedContentCard.level || 1);
    const finalXp = nextXp % 100;

    const nextSetXp = (selectedSet.experience || 0) + 15;
    const nextSetLevel = nextSetXp >= 100 ? (selectedSet.level || 1) + 1 : (selectedSet.level || 1);
    const finalSetXp = nextSetXp % 100;

    const updatedContentCard = {
      ...selectedContentCard,
      telemetry: updatedTelemetry,
      experience: finalXp,
      level: nextLevel,
      updatedAt: new Date().toISOString()
    };

    const updatedSet = {
      ...selectedSet,
      experience: finalSetXp,
      level: nextSetLevel,
      updatedAt: new Date().toISOString()
    };

    // Save changes via API triggers
    onUpdateItem(updatedContentCard);
    onUpdateItem(updatedSet);

    // Animation trigger
    setXpAnimation(true);
    setTimeout(() => setXpAnimation(false), 2000);

    setSimulationLog(prev => [
      `Engagement run triggered! +${deltaViews} Views, +${deltaLikes} Likes, +${deltaComments} Comments.`,
      `Card ${selectedContentCard.title} gained 25 XP (Level ${nextLevel}, ${finalXp}/100 XP).`,
      `Set Card ${selectedSet.title} gained 15 XP.`,
      ...prev
    ].slice(0, 10));
  };

  // Form submit handler
  const handleForgeSet = (e) => {
    e.preventDefault();
    if (!newCreatorName || !newContentTitle) {
      alert("Creator Name and Content Title are required.");
      return;
    }

    const timestamp = Date.now();
    const setId = `set-creator-${timestamp}`;
    const creatorId = `card-creator-${timestamp}`;
    const contentId = `card-content-${timestamp}`;

    // Parse BGM list
    const bgmArray = newContentBgm.split('\n').filter(line => line.trim()).map((line, idx) => ({
      id: `song-${timestamp}-${idx}`,
      title: line.trim(),
      type: "bgm"
    }));

    // Parse References
    const refArray = newContentRefs.split('\n').filter(line => line.trim()).map((line) => {
      const parts = line.split('|');
      return {
        name: parts[0]?.trim() || "Web Reference",
        type: parts[1]?.trim() || "web",
        path: parts[2]?.trim() || ""
      };
    });

    const newCreator = {
      id: creatorId,
      schemaVersion: "hapa.item-card.v1",
      cardType: "creator_card",
      kind: "item",
      title: newCreatorName,
      name: newCreatorName,
      status: "active",
      canonStatus: "scaffold",
      summary: `${newCreatorName} is a content creator, managing an online platform footprint.`,
      description: `Creator profile card for ${newCreatorName}.`,
      tags: ["creator", "artist", "hapa-card"],
      sourceRefs: [newCreatorYoutube, newCreatorSpotify, newCreatorPatreon].filter(Boolean),
      memberOfSets: [{ setCardId: setId, joinedAt: new Date().toISOString() }],
      connections: {
        avatarIds: [],
        placeIds: [],
        contentCards: [contentId],
        contact: {
          alias: newCreatorName,
          instagram: newCreatorInstagram || ""
        }
      },
      quality: {
        score: 3,
        tier: "uncommon",
        affixes: ["media", "named"]
      }
    };

    const newContent = {
      id: contentId,
      schemaVersion: "hapa.item-card.v1",
      cardType: "creator_content_card",
      kind: "item",
      title: newContentTitle,
      name: newContentTitle,
      status: "active",
      canonStatus: "scaffold",
      summary: `Content card tracking: ${newContentTitle}`,
      description: newContentDesc || "No description provided.",
      tags: ["content", "youtube_video", "hapa-card"],
      sourceRefs: [newContentUrl].filter(Boolean),
      memberOfSets: [{ setCardId: setId, joinedAt: new Date().toISOString() }],
      connections: {
        creatorCardId: creatorId
      },
      references: refArray,
      songLinks: bgmArray,
      telemetry: {
        views: 0,
        likes: 0,
        comments: 0
      },
      quality: {
        score: 6,
        tier: "epic",
        affixes: ["media", "named", "linked"]
      }
    };

    const newSet = {
      id: setId,
      schemaVersion: "hapa.item-card.v1",
      cardType: "set",
      kind: "item",
      title: `${newCreatorName} Set`,
      name: `${newCreatorName} Set`,
      status: "active",
      canonStatus: "scaffold",
      summary: `Creator card set linking profile and content for ${newCreatorName}`,
      description: `Tracks content catalog and profile details for ${newCreatorName}`,
      tags: ["creator_card_set", "set", "hapa-card"],
      containedCards: [
        { cardId: creatorId, addedAt: new Date().toISOString(), addedBy: "operator" },
        { cardId: contentId, addedAt: new Date().toISOString(), addedBy: "operator" }
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

    // Invoke creates
    onCreateItem(newCreator);
    onCreateItem(newContent);
    onCreateItem(newSet);

    setSelectedSetId(setId);
    setShowCreateForm(false);
    setSimulationLog(prev => [
      `Successfully forged Creator Card Set: "${newCreatorName} Set"`,
      ...prev
    ]);

    // Reset form fields
    setNewCreatorName("");
    setNewCreatorYoutube("");
    setNewCreatorSpotify("");
    setNewCreatorPatreon("");
    setNewCreatorInstagram("");
    setNewContentTitle("");
    setNewContentUrl("");
    setNewContentDesc("");
    setNewContentRefs("");
    setNewContentBgm("");
  };

  return (
    <div className="hapa-creator-sets-view">
      {/* Upper Status Sweep Header */}
      <div className="telemetry-bar header-bar">
        <div className="status-label">
          <Activity className="blink-dot" size={14} />
          <span>CREATOR CARD SETS ENGINE V1.0</span>
        </div>
        <div className="divider-line"></div>
        <div className="metrics">
          <span>SETS: <strong className="glow-magenta">{sets.length}</strong></span>
          <span>CARDS INGESTED: <strong>{(itemStore?.cards || []).filter(c => ['creator_card', 'creator_content_card'].includes(c.cardType)).length}</strong></span>
          <span>API PORT: <strong className="glow-cyan">8787</strong></span>
        </div>
      </div>

      <div className="workspace-layout">
        
        {/* Left Side: sets catalog list */}
        <aside className="roster-panel list-column">
          <div className="panel-header">
            <Layers3 size={16} />
            <h2>Card Set Registry</h2>
            <button className="hapa-btn icon-btn" onClick={() => setShowCreateForm(!showCreateForm)} title="Forge new set">
              <Plus size={16} />
            </button>
          </div>

          <div className="catalog-list scroll-container">
            {sets.map(set => (
              <div 
                key={set.id} 
                className={`catalog-item ${selectedSetId === set.id ? 'active' : ''} set-tier-${set.quality?.tier || 'common'}`}
                onClick={() => {
                  setSelectedSetId(set.id);
                  setActiveSubTab("content");
                }}
              >
                <div className="item-meta">
                  <span className="set-name">{set.title}</span>
                  <span className="set-count">
                    {set.containedCards?.length || 0} Cards · Level {set.level || 1}
                  </span>
                </div>
                <ChevronRight size={14} className="chevron" />
              </div>
            ))}
          </div>

          {/* Activity Console Log */}
          <div className="log-panel">
            <div className="log-header">
              <Activity size={14} />
              <h3>System Event Log</h3>
            </div>
            <div className="log-content scroll-container">
              {simulationLog.map((log, idx) => (
                <div key={idx} className="log-line">{log}</div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Panel: card set preview */}
        <main className="avatar-showcase-view main-content-area">
          {showCreateForm ? (
            <form className="forge-form panel-content" onSubmit={handleForgeSet}>
              <div className="panel-header border-bottom">
                <Flame className="glow-orange" size={18} />
                <h2>Altar of Creator Synthesis</h2>
              </div>
              
              <div className="form-grid scroll-container">
                <div className="form-section">
                  <h3>Pillar 1: Creator Identity (Red)</h3>
                  <div className="field-group">
                    <label>Creator Name *</label>
                    <input type="text" value={newCreatorName} onChange={e => setNewCreatorName(e.target.value)} placeholder="e.g. Klaize" required />
                  </div>
                  <div className="field-group">
                    <label>YouTube Channel URL</label>
                    <input type="url" value={newCreatorYoutube} onChange={e => setNewCreatorYoutube(e.target.value)} placeholder="https://youtube.com/@..." />
                  </div>
                  <div className="field-group">
                    <label>Spotify Link</label>
                    <input type="url" value={newCreatorSpotify} onChange={e => setNewCreatorSpotify(e.target.value)} placeholder="https://open.spotify.com/..." />
                  </div>
                  <div className="field-group">
                    <label>Patreon Link</label>
                    <input type="url" value={newCreatorPatreon} onChange={e => setNewCreatorPatreon(e.target.value)} placeholder="https://patreon.com/..." />
                  </div>
                  <div className="field-group">
                    <label>Instagram Handle</label>
                    <input type="text" value={newCreatorInstagram} onChange={e => setNewCreatorInstagram(e.target.value)} placeholder="brandon_hombre" />
                  </div>
                </div>

                <div className="form-section">
                  <h3>Pillar 2: Creator Content (Blue)</h3>
                  <div className="field-group">
                    <label>Content Title *</label>
                    <input type="text" value={newContentTitle} onChange={e => setNewContentTitle(e.target.value)} placeholder="e.g. How The West Misunderstands..." required />
                  </div>
                  <div className="field-group">
                    <label>Video Content URL</label>
                    <input type="url" value={newContentUrl} onChange={e => setNewContentUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  </div>
                  <div className="field-group">
                    <label>Description Text</label>
                    <textarea rows="4" value={newContentDesc} onChange={e => setNewContentDesc(e.target.value)} placeholder="Timestamps, summary, gear details..." />
                  </div>
                  <div className="field-group">
                    <label>References List (Name | Type | Link)</label>
                    <textarea rows="4" value={newContentRefs} onChange={e => setNewContentRefs(e.target.value)} placeholder="Chen 2018 | pdf | https://...&#10;Xinhua | web | https://..." />
                  </div>
                  <div className="field-group">
                    <label>BGM Tracks (One per line)</label>
                    <textarea rows="4" value={newContentBgm} onChange={e => setNewContentBgm(e.target.value)} placeholder="NewJeans - Zero&#10;Dave Brubeck - Take Five" />
                  </div>
                </div>
              </div>

              <div className="form-actions border-top">
                <button type="button" className="hapa-btn" onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button type="submit" className="hapa-btn" data-intent="primary">
                  <Flame size={16} /> Forge Set Card
                </button>
              </div>
            </form>
          ) : selectedSet ? (
            <div className="panel-content">
              
              {/* Set summary card header details */}
              <div className="set-header-showcase">
                <div className="set-title-row">
                  <div className="badge-row">
                    <span className={`quality-badge tier-${selectedSet.quality?.tier || 'common'}`}>
                      {selectedSet.quality?.tier?.toUpperCase() || 'COMMON'}
                    </span>
                    <span className="type-badge">SET CARD</span>
                  </div>
                  <h1>{selectedSet.title}</h1>
                  <p className="summary-text">{selectedSet.summary || selectedSet.description}</p>
                </div>
                
                {/* Actions column */}
                <div className="set-action-center">
                  <div className="xp-container">
                    <div className="xp-label">
                      <span>LEVEL {selectedSet.level || 1}</span>
                      <span>{selectedSet.experience || 0} / 100 XP</span>
                    </div>
                    <div className="xp-bar">
                      <div className="xp-fill" style={{ width: `${selectedSet.experience || 0}%` }}></div>
                    </div>
                  </div>
                  <button className={`hapa-btn run-btn ${xpAnimation ? 'animating' : ''}`} data-intent="primary" onClick={handleSimulateEngagement}>
                    <Sparkles size={16} /> Ingest Video Telemetry (XP +15)
                  </button>
                </div>
              </div>

              {/* Tabs for Card Profiles */}
              <div className="sub-tab-bar">
                <button className={activeSubTab === "profile" ? "active" : ""} onClick={() => setActiveSubTab("profile")}>
                  <Users size={16} /> Creator Profile Card
                </button>
                <button className={activeSubTab === "content" ? "active" : ""} onClick={() => setActiveSubTab("content")}>
                  <Film size={16} /> Content Video Cards
                </button>
                {sponsorCards.length > 0 && (
                  <button className={activeSubTab === "sponsors" ? "active" : ""} onClick={() => setActiveSubTab("sponsors")}>
                    <Sparkles size={16} /> Creator Sponsors ({sponsorCards.length})
                  </button>
                )}
              </div>

              <div className="sub-tab-content scroll-container">
                {activeSubTab === "profile" && creatorCard && (
                  <div className="creator-profile-layout">
                    {/* Visual Card Face */}
                    <div className={`holo-card set-tier-${creatorCard.quality?.tier || 'common'}`}>
                      <div className="card-face">
                        <div className="card-header">
                          <span className="tier-label">{creatorCard.quality?.tier?.toUpperCase()}</span>
                          <span className="role-label">CREATOR IDENTITY</span>
                        </div>
                        <div className="avatar-frame">
                          {creatorHeroImage ? (
                            <img src={creatorHeroImage} alt={creatorCard.name} className="hero-avatar-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div className="default-avatar-placeholder">
                              <Users size={48} className="icon glow" />
                            </div>
                          )}
                        </div>
                        <div className="card-identity">
                          <h3>{creatorCard.name}</h3>
                          <p>{creatorCard.summary}</p>
                        </div>
                        <div className="affix-badges">
                          {creatorCard.quality?.affixes?.map((aff, idx) => (
                            <span key={idx} className="badge">{aff}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Meta Details Panel */}
                    <div className="profile-details">
                      <div className="section-group">
                        <div className="section-title"><Link2 size={14} /> Footprint Footnotes</div>
                        <div className="footprint-grid">
                          {creatorCard.sourceRefs?.map((ref, idx) => {
                            const url = typeof ref === 'string' ? ref : (ref.label || ref.uri || "");
                            let label = "Web Link";
                            let icon = <ExternalLink size={14} />;
                            if (url.includes("youtube.com")) label = "YouTube Channel";
                            if (url.includes("spotify.com")) label = "Spotify Artist";
                            if (url.includes("patreon.com")) label = "Patreon Support";
                            return (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="footprint-link">
                                <span>{label}</span>
                                {icon}
                              </a>
                            );
                          })}
                        </div>
                      </div>

                      <div className="section-group">
                        <div className="section-title"><Smartphone size={14} /> Public Contacts</div>
                        <div className="contact-details-box">
                          {creatorCard.connections?.contact?.instagram && (
                            <div className="contact-row">
                              <span className="label">Instagram</span>
                              <span className="value">@{creatorCard.connections.contact.instagram}</span>
                            </div>
                          )}
                          <div className="contact-row">
                            <span className="label">Alias</span>
                            <span className="value">{creatorCard.connections?.contact?.alias || creatorCard.name}</span>
                          </div>
                        </div>
                      </div>

                      {creatorCard.creatorProfile?.realName && (
                        <>
                          <div className="section-group">
                            <div className="section-title"><Sparkles size={14} /> Platform Profile Photos</div>
                            <div className="platform-photos-row" style={{ display: 'flex', gap: '16px', padding: '12px 16px', background: 'rgba(10, 20, 38, 0.4)', borderRadius: '4px', border: '1px solid rgba(0, 243, 255, 0.1)' }}>
                              {creatorCard.creatorProfile.profilePhotos?.youtube && (
                                <div className="platform-photo-item" style={{ textAlign: 'center' }}>
                                  <img src={creatorCard.creatorProfile.profilePhotos.youtube} alt="YouTube Avatar" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #ff0000', objectFit: 'cover' }} />
                                  <div style={{ fontSize: '10px', color: '#ff0000', marginTop: '4px', fontFamily: 'monospace' }}>YouTube</div>
                                </div>
                              )}
                              {creatorCard.creatorProfile.profilePhotos?.instagram && (
                                <div className="platform-photo-item" style={{ textAlign: 'center' }}>
                                  <img src={creatorCard.creatorProfile.profilePhotos.instagram} alt="Instagram Avatar" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #e1306c', objectFit: 'cover' }} />
                                  <div style={{ fontSize: '10px', color: '#e1306c', marginTop: '4px', fontFamily: 'monospace' }}>Instagram</div>
                                </div>
                              )}
                              {creatorCard.creatorProfile.profilePhotos?.spotify && (
                                <div className="platform-photo-item" style={{ textAlign: 'center' }}>
                                  <img src={creatorCard.creatorProfile.profilePhotos.spotify} alt="Spotify Avatar" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #1db954', objectFit: 'cover' }} />
                                  <div style={{ fontSize: '10px', color: '#1db954', marginTop: '4px', fontFamily: 'monospace' }}>Spotify</div>
                                </div>
                              )}
                              {creatorCard.creatorProfile.profilePhotos?.patreon && (
                                <div className="platform-photo-item" style={{ textAlign: 'center' }}>
                                  <img src={creatorCard.creatorProfile.profilePhotos.patreon} alt="Patreon Avatar" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #f96854', objectFit: 'cover' }} />
                                  <div style={{ fontSize: '10px', color: '#f96854', marginTop: '4px', fontFamily: 'monospace' }}>Patreon</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="section-group">
                            <div className="section-title"><Sparkles size={14} /> Profile Dossier</div>
                            <div className="contact-details-box">
                              <div className="contact-row">
                                <span className="label">Real Name / Legal Name</span>
                                <span className="value">{creatorCard.creatorProfile.realName}</span>
                              </div>
                              <div className="contact-row">
                                <span className="label">Focus Area</span>
                                <span className="value">{creatorCard.creatorProfile.focusArea}</span>
                              </div>
                              {creatorCard.connections?.contact?.email && (
                                <div className="contact-row">
                                  <span className="label">Business Contact</span>
                                  <span className="value">{creatorCard.connections.contact.email}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="section-group">
                            <div className="section-title"><BookOpen size={14} /> Intellectual Framework</div>
                            <div className="details-text-block">
                              {creatorCard.creatorProfile.intellectualFramework}
                            </div>
                          </div>

                          <div className="section-group">
                            <div className="section-title"><Activity size={14} /> Style & Tone Signature</div>
                            <div className="contact-details-box">
                              <div className="contact-row">
                                <span className="label">Narrative Stance</span>
                                <span className="value">{creatorCard.creatorProfile.styleAndTone?.narrativeStyle}</span>
                              </div>
                              <div className="contact-row">
                                <span className="label">Visual Aesthetic</span>
                                <span className="value">{creatorCard.creatorProfile.styleAndTone?.visualSignature}</span>
                              </div>
                              <div className="contact-row">
                                <span className="label">Viewing Context</span>
                                <span className="value">{creatorCard.creatorProfile.styleAndTone?.viewingVibe}</span>
                              </div>
                            </div>
                          </div>

                          <div className="section-group">
                            <div className="section-title"><Flame size={14} /> Recurring Themes & Specialties</div>
                            <div className="bgm-grid">
                              {creatorCard.creatorProfile.recurringThemes?.map((theme, idx) => (
                                <div key={idx} className="bgm-track">
                                  <Flame size={12} className="music-icon" />
                                  <span>{theme}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="section-group">
                            <div className="section-title"><Film size={14} /> Known Video Essay Catalog</div>
                            <div className="reference-list">
                              {creatorCard.creatorProfile.knownCatalog?.map((video, idx) => (
                                <div key={idx} className="ref-item">
                                  <span className="ref-type-badge">DOCUMENTARY</span>
                                  <div className="ref-info">
                                    <span className="ref-name">{video}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <div className="section-group">
                        <div className="section-title"><BookOpen size={14} /> Backstory & Lore</div>
                        <div className="details-text-block">
                          {creatorCard.lore || creatorCard.description}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSubTab === "content" && selectedContentCard && (
                  <div className="creator-content-layout-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                    {contentCards.length > 1 && (
                      <div className="content-cards-selector" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid rgba(0, 243, 255, 0.12)', paddingBottom: '12px' }}>
                        {contentCards.map((card) => (
                          <button
                            key={card.id}
                            onClick={() => setSelectedContentCardId(card.id)}
                            style={{
                              padding: '6px 12px',
                              background: selectedContentCard.id === card.id ? 'rgba(0, 243, 255, 0.2)' : 'rgba(10, 20, 38, 0.6)',
                              border: `1px solid ${selectedContentCard.id === card.id ? '#00f3ff' : 'rgba(0, 243, 255, 0.2)'}`,
                              color: selectedContentCard.id === card.id ? '#00f3ff' : 'rgba(236, 251, 255, 0.7)',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {card.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="creator-content-layout">
                    {/* Visual Card Face */}
                    <div className={`holo-card set-tier-${selectedContentCard.quality?.tier || 'common'}`}>
                      <div className="card-face">
                        <div className="card-header">
                          <span className="tier-label">{selectedContentCard.quality?.tier?.toUpperCase()}</span>
                          <span className="role-label">VIDEO CONTENT</span>
                        </div>
                        <div className="avatar-frame">
                          {embedUrl ? (
                            <iframe 
                              src={embedUrl}
                              title="YouTube video player"
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              style={{ width: '100%', height: '100%', border: 'none' }}
                            ></iframe>
                          ) : (
                            <div className="default-avatar-placeholder video-placeholder">
                              <Film size={48} className="icon glow" />
                            </div>
                          )}
                        </div>
                        <div className="card-identity">
                          <h3>{selectedContentCard.title}</h3>
                          <p className="telemetry-summary">
                            <Eye size={12} /> {selectedContentCard.telemetry?.views?.toLocaleString() || 0} · 
                            <Heart size={12} /> {selectedContentCard.telemetry?.likes?.toLocaleString() || 0} · 
                            <MessageSquare size={12} /> {selectedContentCard.telemetry?.comments?.toLocaleString() || 0}
                          </p>
                        </div>
                        <div className="affix-badges">
                          {selectedContentCard.quality?.affixes?.map((aff, idx) => (
                            <span key={idx} className="badge">{aff}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Details Panel */}
                    <div className="content-details">
                      <div className="section-group">
                        <div className="section-title"><FileText size={14} /> LLM Video Summary</div>
                        <div className="details-text-block summary-block" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p className="short-summary" style={{ fontWeight: '600', color: '#00f3ff', margin: 0 }}>
                            {selectedContentCard.summary}
                          </p>
                          {selectedContentCard.cardRecord?.summaries?.[1] && (
                            <div className="indepth-summary" style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.9 }}>
                              {selectedContentCard.cardRecord.summaries[1].split('\n\n').map((para, idx) => (
                                <p key={idx} style={{ margin: 0, lineHeight: 1.6 }}>{para}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="section-group">
                        <div className="section-title"><BookOpen size={14} /> Academic & Web References</div>
                        <div className="reference-list">
                          {(selectedContentCard.references || selectedContentCard.mediaAssets || [])?.map((ref, idx) => (
                            <div key={idx} className="ref-item">
                              <span className="ref-type-badge">{ref.type?.toUpperCase()}</span>
                              <div className="ref-info">
                                <span className="ref-name">{ref.name}</span>
                                {ref.path && (
                                  <a href={ref.path} target="_blank" rel="noopener noreferrer" className="ref-link">
                                    Source Path <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="section-group">
                        <div className="section-title"><Music size={14} /> Background Music (BGM) Tracklist</div>
                        <div className="bgm-grid">
                          {selectedContentCard.songLinks?.map((song, idx) => (
                            <div key={idx} className="bgm-track">
                              <Music size={12} className="music-icon" />
                              <span>{song.songTitle || song.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="section-group">
                        <div className="section-title"><Smartphone size={14} /> Video Details & Gear</div>
                        <div className="details-text-block desc-block">
                          <pre>{selectedContentCard.description}</pre>
                        </div>
                      </div>

                      <div className="section-group">
                        <div className="section-title"><FileText size={14} /> AI Video Transcript Snippet</div>
                        <div className="details-text-block transcript-block">
                          {selectedContentCard.cardRecord?.transcripts?.[0] || "No transcript indexed."}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                )}

                {activeSubTab === "sponsors" && selectedSponsorCard && (
                  <div className="creator-content-layout-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                    {sponsorCards.length > 1 && (
                      <div className="content-cards-selector" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid rgba(0, 243, 255, 0.12)', paddingBottom: '12px' }}>
                        {sponsorCards.map((card) => (
                          <button
                            key={card.id}
                            onClick={() => setSelectedSponsorCardId(card.id)}
                            style={{
                              padding: '6px 12px',
                              background: selectedSponsorCard.id === card.id ? 'rgba(0, 243, 255, 0.2)' : 'rgba(10, 20, 38, 0.6)',
                              border: `1px solid ${selectedSponsorCard.id === card.id ? '#00f3ff' : 'rgba(0, 243, 255, 0.2)'}`,
                              color: selectedSponsorCard.id === card.id ? '#00f3ff' : 'rgba(236, 251, 255, 0.7)',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {card.title}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    <div className="creator-content-layout">
                      {/* Visual Card Face */}
                      <div className={`holo-card set-tier-${selectedSponsorCard.quality?.tier || 'epic'}`}>
                        <div className="card-face">
                          <div className="card-header">
                            <span className="tier-label" style={{ color: '#a855f7' }}>{selectedSponsorCard.quality?.tier?.toUpperCase() || 'EPIC'}</span>
                            <span className="role-label">CREATOR SPONSOR</span>
                          </div>
                          
                          <div className="avatar-frame" style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, rgba(10, 20, 38, 0.8) 100%)',
                            overflow: 'hidden',
                            position: 'relative',
                            border: '1px solid rgba(168, 85, 247, 0.3)'
                          }}>
                            {selectedSponsorCard.sponsorProfile?.logo ? (
                              <img 
                                src={selectedSponsorCard.sponsorProfile.logo} 
                                alt={`${selectedSponsorCard.title} Logo`}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  filter: 'brightness(0.95) contrast(1.15)',
                                  transition: 'transform 0.5s ease'
                                }}
                                className="sponsor-logo-img"
                              />
                            ) : (
                              <div style={{ textAlign: 'center' }}>
                                <Sparkles size={40} className="glow-purple" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.6))', margin: '0 auto 8px' }} />
                                <div style={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '2px', color: '#ecefb5', textTransform: 'uppercase', fontSize: '14px' }}>
                                  {selectedSponsorCard.title}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="card-identity">
                            <h3>{selectedSponsorCard.title}</h3>
                            <p style={{ fontSize: '11px', lineHeight: '1.4', opacity: 0.8 }}>
                              {selectedSponsorCard.summary}
                            </p>
                          </div>
                          
                          <div className="affix-badges">
                            {selectedSponsorCard.quality?.affixes?.map((aff, idx) => (
                              <span key={idx} className="badge" style={{ borderColor: '#a855f7', color: '#c084fc' }}>{aff}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Sponsor Profile & Terms Details Panel */}
                      <div className="content-details">
                        {/* 1. Sponsorship Deal & Terms */}
                        <div className="section-group">
                          <div className="section-title"><Sparkles size={14} style={{ color: '#a855f7' }} /> Sponsorship Terms & Discount Deal</div>
                          <div className="details-text-block" style={{ 
                            background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.15) 0%, rgba(10, 20, 38, 0.6) 100%)',
                            borderLeft: '4px solid #a855f7',
                            padding: '16px',
                            borderRadius: '0 8px 8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: '12px', fontFamily: 'monospace' }}>
                              <span style={{ color: 'rgba(236, 251, 255, 0.5)' }}>PROMO CODE:</span>
                              <strong style={{ color: '#00f3ff', textShadow: '0 0 4px rgba(0,243,255,0.4)' }}>
                                {selectedSponsorCard.sponsorProfile?.sponsorshipTerms?.promoCode || 'N/A'}
                              </strong>
                              
                              <span style={{ color: 'rgba(236, 251, 255, 0.5)' }}>BENEFIT/DEAL:</span>
                              <strong style={{ color: '#ecefb5' }}>
                                {selectedSponsorCard.sponsorProfile?.sponsorshipTerms?.discount || 'N/A'}
                              </strong>
                              
                              <span style={{ color: 'rgba(236, 251, 255, 0.5)' }}>INTEGRATION:</span>
                              <span style={{ opacity: 0.9 }}>
                                {selectedSponsorCard.sponsorProfile?.sponsorshipTerms?.primaryIntegration || 'N/A'}
                              </span>
                            </div>
                            
                            {selectedSponsorCard.sponsorProfile?.sponsorshipTerms?.link && (
                              <a 
                                href={selectedSponsorCard.sponsorProfile.sponsorshipTerms.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="hapa-btn" 
                                style={{ 
                                  alignSelf: 'flex-start', 
                                  marginTop: '8px', 
                                  borderColor: '#a855f7', 
                                  color: '#c084fc', 
                                  background: 'rgba(168, 85, 247, 0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>Claim Sponsor Deal</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* 2. About the Sponsor */}
                        <div className="section-group">
                          <div className="section-title"><BookOpen size={14} /> Sponsor Overview</div>
                          <div className="details-text-block summary-block" style={{ lineHeight: 1.6 }}>
                            {selectedSponsorCard.sponsorProfile?.about}
                          </div>
                        </div>

                        {/* 3. Company Profile Metrics */}
                        <div className="section-group">
                          <div className="section-title"><Users size={14} /> Corporate Dossier</div>
                          <div className="contact-details-box">
                            <div className="contact-row">
                              <span className="label">Headquarters</span>
                              <span className="value">{selectedSponsorCard.sponsorProfile?.headquarters}</span>
                            </div>
                            <div className="contact-row">
                              <span className="label">Founded</span>
                              <span className="value">{selectedSponsorCard.sponsorProfile?.founded}</span>
                            </div>
                            <div className="contact-row">
                              <span className="label">Business Type</span>
                              <span className="value">{selectedSponsorCard.sponsorProfile?.businessType}</span>
                            </div>
                            <div className="contact-row">
                              <span className="label">Official Website</span>
                              <span className="value">
                                <a 
                                  href={selectedSponsorCard.sponsorProfile?.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ color: '#00f3ff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  {selectedSponsorCard.sponsorProfile?.website?.replace('https://', '')}
                                  <ExternalLink size={10} />
                                </a>
                              </span>
                            </div>
                            {selectedSponsorCard.sponsorProfile?.targetDemographics && (
                              <div className="contact-row">
                                <span className="label">Target Audience</span>
                                <span className="value">{selectedSponsorCard.sponsorProfile.targetDemographics}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 4. Product Features */}
                        {selectedSponsorCard.sponsorProfile?.features && (
                          <div className="section-group">
                            <div className="section-title"><Sparkles size={14} /> Key Offerings & Features</div>
                            <div className="reference-list">
                              {selectedSponsorCard.sponsorProfile.features.map((feature, idx) => (
                                <div key={idx} className="ref-item">
                                  <span className="ref-type-badge" style={{ borderColor: '#a855f7', color: '#c084fc' }}>FEATURE</span>
                                  <div className="ref-info">
                                    <span className="ref-name" style={{ fontSize: '12px' }}>{feature}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 5. Associated Videos (Tied back to Video essays catalog) */}
                        {selectedSponsorCard.sponsorProfile?.associatedVideos && (
                          <div className="section-group">
                            <div className="section-title"><Film size={14} /> Associated Content Pieces ({selectedSponsorCard.sponsorProfile.associatedVideos.length})</div>
                            <div className="bgm-grid">
                              {selectedSponsorCard.sponsorProfile.associatedVideos.map((videoTitle, idx) => {
                                // Match video card
                                const foundCard = contentCards.find(c => c.title.toLowerCase() === videoTitle.toLowerCase() || c.title.toLowerCase().includes(videoTitle.toLowerCase()));
                                return (
                                  <div 
                                    key={idx} 
                                    className="bgm-track"
                                    onClick={() => {
                                      if (foundCard) {
                                        setSelectedContentCardId(foundCard.id);
                                        setActiveSubTab("content");
                                      }
                                    }}
                                    style={{ 
                                      cursor: foundCard ? 'pointer' : 'default',
                                      transition: 'all 0.2s ease',
                                      border: foundCard ? '1px solid rgba(0, 243, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.05)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                    onMouseEnter={e => {
                                      if (foundCard) {
                                        e.currentTarget.style.borderColor = '#00f3ff';
                                        e.currentTarget.style.boxShadow = '0 0 8px rgba(0,243,255,0.2)';
                                      }
                                    }}
                                    onMouseLeave={e => {
                                      if (foundCard) {
                                        e.currentTarget.style.borderColor = 'rgba(0, 243, 255, 0.15)';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }
                                    }}
                                  >
                                    <Film size={12} className="music-icon" style={{ color: foundCard ? '#00f3ff' : 'rgba(255,255,255,0.4)' }} />
                                    <span style={{ color: foundCard ? '#ecefb5' : 'inherit' }}>{videoTitle}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="empty-state">
              <Layers3 size={48} className="glow" />
              <span>Select or Create a Creator Card Set to review footprints and catalogs</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
