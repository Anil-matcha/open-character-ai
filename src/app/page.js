"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import {
  Search,
  Settings,
  LogIn,
  LogOut,
  X,
  Plus,
  MessageSquare,
  Loader2,
  Menu,
  Upload,
  Download,
  BookOpen,
  Sparkles,
} from "lucide-react";

export default function HomeDashboard() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Core data states
  const [characters, setCharacters] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [overrideCredits, setOverrideCredits] = useState(null);
  const userCredits = overrideCredits !== null ? overrideCredits : (session?.user?.credits ?? 50);
  const [showSidebar, setShowSidebar] = useState(false);

  // Import Character Card states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef(null);

  // Create Character Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChar, setNewChar] = useState({
    name: "",
    avatar: "🤖",
    profile_url: "",
    description: "",
    personality: "",
    systemPrompt: "",
    greeting: "",
    scenario: "",
    exampleDialogue: "",
    alternateGreetings: "",
    is_public: true,
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const charRes = await fetch("/api/characters");
        const charData = await charRes.json();
        if (isMounted && charData.characters) {
          setCharacters(charData.characters);
        }

        if (authStatus === "authenticated") {
          const chatRes = await fetch("/api/chats");
          const chatData = await chatRes.json();
          if (isMounted && chatData.chats) {
            setChats(chatData.chats);
          }
        }
      } catch (err) {
        console.error("Failed to load initial workspace data", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [authStatus]);

  const handleStartChat = async (characterId, characterName) => {
    if (authStatus !== "authenticated") {
      signIn("google");
      return;
    }
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });
      const data = await res.json();
      if (data.chat) {
        const slug = characterName.toLowerCase().replace(/ /g, "-");
        router.push(`/${slug}/${data.chat.id}`);
      }
    } catch (err) {
      console.error("Failed to instantiate chat thread", err);
    }
  };

  const handleCreateCharacter = async (e) => {
    e.preventDefault();
    if (authStatus !== "authenticated") {
      signIn("google");
      return;
    }
    try {
      setIsCreating(true);
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newChar,
          alternateGreetings: newChar.alternateGreetings
            ? newChar.alternateGreetings.split("\n").filter(Boolean)
            : [],
        }),
      });
      const data = await res.json();
      if (data.character) {
        setCharacters((prev) => [...prev, data.character]);
        setShowCreateModal(false);
        setNewChar({
          name: "",
          avatar: "🤖",
          profile_url: "",
          description: "",
          personality: "",
          systemPrompt: "",
          greeting: "",
          scenario: "",
          exampleDialogue: "",
          alternateGreetings: "",
          is_public: true,
        });
        await handleStartChat(data.character.id, data.character.name);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  // SillyTavern Character Card Import Handler
  const handleImportCard = async (cardPayload) => {
    if (authStatus !== "authenticated") {
      signIn("google");
      return;
    }
    try {
      setIsImporting(true);
      const res = await fetch("/api/characters/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof cardPayload === "string" ? cardPayload : JSON.stringify(cardPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Card import failed");
      }

      const data = await res.json();
      if (data.character) {
        setCharacters((prev) => [data.character, ...prev]);
        setShowImportModal(false);
        setImportJsonText("");
        await handleStartChat(data.character.id, data.character.name);
      }
    } catch (error) {
      alert(error.message || "Failed to import character card");
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = JSON.parse(content);
        handleImportCard(parsed);
      } catch (err) {
        alert("Invalid JSON character card file.");
      }
    };
    reader.readAsText(file);
  };

  const handleExportCharacter = async (e, charId, charName) => {
    e.stopPropagation();
    try {
      window.open(`/api/characters/${charId}/export`, "_blank");
    } catch (err) {
      console.error("Export error", err);
    }
  };

  const executeUpgrade = () => {
    setShowUpgradeModal(false);
    router.push("/pricing");
  };

  // Derive unique recent characters from chat history
  const recentCharactersMap = new Map();
  chats.forEach((c) => {
    if (c.character && !recentCharactersMap.has(c.character.id)) {
      recentCharactersMap.set(c.character.id, c.character);
    }
  });
  const recentCharacters = Array.from(recentCharactersMap.values());

  // Filter characters based on search
  const filteredCharacters = characters.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.personality.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-dvh bg-bg-page select-none text-primary-text overflow-hidden font-sans">
      {/* MOBILE BACKDROP OVERLAY */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 1. LEFT SIDEBAR (CHATS, LOGO, PROFILE) */}
      <aside
        className={`w-72 bg-bg-card border-r border-divider/50 flex flex-col p-4 justify-between shrink-0 fixed md:static inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out ${
          showSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* LOGO & BRAND */}
          <div className="flex items-center justify-between px-1">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl">🎭</span>
              <span className="font-extrabold text-base tracking-tight text-primary-text group-hover:text-primary transition">
                character.ai
              </span>
            </Link>
            <button
              className="md:hidden text-secondary-text hover:text-primary-text p-1"
              onClick={() => setShowSidebar(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ACTION BUTTONS: CREATE & IMPORT */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => {
                setShowSidebar(false);
                setShowCreateModal(true);
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-lg font-bold text-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
            <button
              onClick={() => {
                setShowSidebar(false);
                setShowImportModal(true);
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/25 rounded-lg font-bold text-xs transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Card</span>
            </button>
          </div>

          {/* RECENT CONVERSATIONS LIST */}
          <div className="flex-1 overflow-y-auto mt-2 space-y-1 pr-1 custom-scrollbar">
            <span className="text-[10px] font-bold text-secondary-text uppercase tracking-wider px-2">
              Recent Chats
            </span>
            {recentCharacters.length === 0 && !loading && (
              <p className="text-xs text-secondary-text px-2 py-4 italic">
                No conversations yet. Select a character below!
              </p>
            )}
            {recentCharacters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setShowSidebar(false);
                  handleStartChat(ch.id, ch.name);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-bg-card-hover transition text-left cursor-pointer group"
              >
                <div className="h-8.5 w-8.5 rounded-full bg-bg-card border border-divider/50 flex items-center justify-center text-lg shrink-0 shadow-sm overflow-hidden relative">
                  {ch.profileUrl ||
                  (ch.avatar.length > 2 && ch.avatar.startsWith("http")) ? (
                    <img
                      src={ch.profileUrl || ch.avatar}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    ch.avatar
                  )}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-semibold text-[13px] truncate text-primary-text tracking-wide group-hover:text-white transition">
                    {ch.name}
                  </h4>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* BOTTOM UPGRADE CAPSULE */}
        <div className="mt-4 pt-4 border-t border-divider/50">
          <button
            onClick={() => router.push("/pricing")}
            className="w-full mb-4 py-2.5 px-4 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-bold text-xs tracking-wider transition cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Upgrade to c.ai+</span>
          </button>

          {/* DYNAMIC USER SECTION */}
          {authStatus === "authenticated" && session?.user ? (
            <div className="flex items-center justify-between p-2 rounded bg-transparent select-none">
              <div className="flex items-center gap-3 overflow-hidden">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-9 h-9 rounded-full border border-divider/50 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {session.user.name?.[0] || "U"}
                  </div>
                )}
                <div className="overflow-hidden">
                  <h4 className="font-bold text-xs truncate leading-tight text-primary-text">
                    {session.user.name || "User"}
                  </h4>
                  <p className="text-[10px] text-secondary-text truncate mt-0.5">
                    Credits: {userCredits}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                type="button"
                title="Logout"
                className="p-1 hover:bg-bg-card-hover rounded text-secondary-text hover:text-primary-text transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-white rounded font-bold text-xs tracking-wider transition cursor-pointer shadow-md"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </aside>

      {/* 2. MAIN DASHBOARD CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-bg-page">
        {/* TOP BAR SEARCH HEADER */}
        <header className="flex flex-col sm:flex-row items-center justify-between p-4 sm:px-10 border-b border-divider/50 bg-bg-card/50 backdrop-blur-sm gap-4 shrink-0">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              className="md:hidden p-2 bg-bg-card-hover hover:bg-bg-elevated rounded-lg text-secondary-text hover:text-primary-text border border-divider/50 transition shrink-0"
              onClick={() => setShowSidebar(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <span className="text-secondary-text text-[10px] sm:text-xs font-semibold hidden sm:block">
                Welcome to Roleplay Studio,
              </span>
              <h2 className="text-base sm:text-xl font-bold text-primary-text tracking-tight sm:mt-0.5 truncate max-w-[140px] sm:max-w-xs">
                {session?.user?.name || "Guest"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-secondary-text">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search characters, tags, descriptions..."
                className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-divider/50 rounded-full text-xs focus:outline-none focus:bg-bg-card-hover focus:border-primary/50 text-primary-text placeholder-secondary-text transition duration-150"
              />
            </div>
          </div>
        </header>

        {/* CHARACTER GRID */}
        <div className="flex flex-col gap-2 w-full h-full overflow-y-auto px-4 sm:px-10 pb-20 custom-scrollbar">
          <div className="flex items-center justify-between mt-6 mb-4">
            <div>
              <h3 className="text-base font-bold text-primary-text flex items-center gap-2">
                <span>Explore Characters</span>
              </h3>
              <p className="text-xs text-secondary-text mt-0.5">
                Portable character cards compatible with SillyTavern V2/V3 specifications.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 transition flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 px-3.5 py-2 rounded-full border border-blue-500/25 cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Card</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs font-bold text-primary hover:text-primary-hover transition flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-full border border-primary/25 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Character</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCharacters.map((char) => (
              <div
                key={char.id}
                onClick={() => handleStartChat(char.id, char.name)}
                className="bg-bg-card border border-divider/50 rounded-xl p-3 flex gap-3 hover:border-primary/50 hover:bg-bg-card-hover transition duration-200 cursor-pointer shadow-lg group relative"
              >
                {/* Character visual image */}
                <div className="h-full w-20 aspect-[3/4] rounded-lg overflow-hidden flex-shrink-0 bg-bg-page border border-divider/50 shadow flex items-center justify-center text-4xl">
                  {char.profileUrl ||
                  (char.avatar.length > 2 && char.avatar.startsWith("http")) ? (
                    <img
                      src={char.profileUrl || char.avatar}
                      alt={char.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    char.avatar
                  )}
                </div>

                {/* Character text details */}
                <div className="flex flex-col justify-between overflow-hidden flex-1 py-1">
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-primary-text group-hover:text-primary transition truncate">
                        {char.name}
                      </h4>
                      <button
                        onClick={(e) => handleExportCharacter(e, char.id, char.name)}
                        title="Export SillyTavern Character Card (JSON)"
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-secondary-text line-clamp-2 mt-1 leading-snug">
                      {char.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-zinc-500 font-medium truncate">
                      {char.scenario ? "Story Scenario active" : "Persona ready"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* 3. IMPORT CHARACTER CARD MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-bg-card border border-divider/50 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-divider/50 flex justify-between items-center bg-bg-page/40">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-base text-primary-text">
                  Import Character Card (V2/V3)
                </h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 hover:bg-bg-card-hover rounded text-secondary-text hover:text-primary-text transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <p className="text-xs text-secondary-text leading-relaxed">
                Import any standard SillyTavern or Character Card V2/V3 JSON. All custom extensions and metadata are preserved losslessly.
              </p>

              {/* File upload drag/click box */}
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />

              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="w-full py-6 border-2 border-dashed border-divider hover:border-blue-500/60 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-blue-500/5 transition cursor-pointer"
              >
                <Upload className="w-7 h-7 text-blue-400" />
                <span className="text-xs font-bold text-primary-text">
                  Click to choose a .json card file
                </span>
                <span className="text-[10px] text-secondary-text">
                  Supports SillyTavern V2 and V3 spec
                </span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-divider/40"></div>
                <span className="flex-shrink mx-4 text-[10px] uppercase font-bold text-secondary-text">
                  Or Paste JSON Text
                </span>
                <div className="flex-grow border-t border-divider/40"></div>
              </div>

              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='Paste character card JSON e.g. {"spec": "chara_card_v2", "data": { ... }}'
                rows={6}
                className="w-full bg-bg-page border border-divider/50 rounded-lg p-3 text-xs font-mono text-primary-text focus:outline-none focus:border-blue-500/50 resize-none placeholder-secondary-text custom-scrollbar"
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-bg-page hover:bg-bg-card-hover rounded text-xs font-semibold text-secondary-text transition border border-divider/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isImporting || !importJsonText.trim()}
                  onClick={() => handleImportCard(importJsonText)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold transition flex items-center gap-2 shadow-md"
                >
                  {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Import & Start Story</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CREATE CHARACTER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-bg-card border border-divider/50 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-divider/50 flex justify-between items-center bg-bg-page/40">
              <h3 className="font-bold text-base text-primary-text">
                Create AI Companion Persona
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-bg-card-hover rounded text-secondary-text hover:text-primary-text transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateCharacter}
              className="p-6 overflow-y-auto space-y-4 custom-scrollbar"
            >
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1.5">
                  <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    required
                    value={newChar.name}
                    onChange={(e) =>
                      setNewChar({ ...newChar, name: e.target.value })
                    }
                    type="text"
                    className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                    placeholder="e.g. Jax"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                    Emoji
                  </label>
                  <input
                    required
                    value={newChar.avatar}
                    onChange={(e) =>
                      setNewChar({ ...newChar, avatar: e.target.value })
                    }
                    type="text"
                    className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                    placeholder="🤖"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Image URL (Optional)
                </label>
                <input
                  value={newChar.profile_url}
                  onChange={(e) =>
                    setNewChar({ ...newChar, profile_url: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="https://example.com/image.png"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Short Description
                </label>
                <input
                  required
                  value={newChar.description}
                  onChange={(e) =>
                    setNewChar({ ...newChar, description: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="A brief tagline shown in character lists."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Personality Traits
                </label>
                <input
                  required
                  value={newChar.personality}
                  onChange={(e) =>
                    setNewChar({ ...newChar, personality: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="e.g. Curious, philosophical, witty, protective."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Roleplay Scenario / Setting (Optional)
                </label>
                <input
                  value={newChar.scenario}
                  onChange={(e) =>
                    setNewChar({ ...newChar, scenario: e.target.value })
                  }
                  type="text"
                  className="w-full bg-bg-page border border-divider/50 rounded p-2.5 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition placeholder-secondary-text"
                  placeholder="e.g. Trapped on a space station, exploring ancient ruins..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Opening Greeting
                </label>
                <textarea
                  required
                  value={newChar.greeting}
                  onChange={(e) =>
                    setNewChar({ ...newChar, greeting: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-20 resize-none placeholder-secondary-text"
                  placeholder="The very first message they send when someone starts a chat."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Alternate Greetings (Optional, one per line)
                </label>
                <textarea
                  value={newChar.alternateGreetings}
                  onChange={(e) =>
                    setNewChar({ ...newChar, alternateGreetings: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-20 resize-none placeholder-secondary-text"
                  placeholder="Alternate start greetings for new stories..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  Example Dialogue (Optional)
                </label>
                <textarea
                  value={newChar.exampleDialogue}
                  onChange={(e) =>
                    setNewChar({ ...newChar, exampleDialogue: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-20 resize-none placeholder-secondary-text"
                  placeholder="<START>&#10;{{user}}: Hello!&#10;{{char}}: *smiles warmly* Good to meet you."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary-text uppercase tracking-wider">
                  System Prompt (AI Directives)
                </label>
                <textarea
                  required
                  value={newChar.systemPrompt}
                  onChange={(e) =>
                    setNewChar({ ...newChar, systemPrompt: e.target.value })
                  }
                  className="w-full bg-bg-page border border-divider/50 rounded p-3 text-sm text-primary-text focus:outline-none focus:border-primary/50 transition h-28 resize-none placeholder-secondary-text"
                  placeholder="You are [Name]. Stay in character. Speak in first person..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-bg-page hover:bg-bg-card-hover rounded text-xs font-semibold text-secondary-text transition border border-divider/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer"
                >
                  {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Forge Character</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PREMIUM PAYMENT / UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn select-none">
          <div className="bg-bg-card border border-divider/55 rounded-xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500" />
            <div className="p-6 pt-8 text-center">
              <div className="h-16 w-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">
                👑
              </div>
              <span className="px-3.5 py-1 text-[10px] uppercase font-black tracking-widest text-amber-500 bg-amber-950/30 rounded-full border border-amber-800/40 shadow-inner">
                c.ai+ Premium Tier
              </span>
              <h3 className="font-black text-2xl mt-4 mb-2 text-primary-text tracking-tight">
                Upgrade to character.ai+
              </h3>
              <p className="text-xs text-secondary-text max-w-sm mx-auto leading-relaxed mb-6 font-semibold">
                Gain instant access to unlimited thinking engine telemetry, zero-wait premium response models (GPT-4o, DeepSeek R1), and flexible credit packs.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 py-3 bg-bg-page hover:bg-bg-card-hover text-secondary-text hover:text-primary-text rounded font-bold text-xs uppercase tracking-wider transition border border-divider/50 cursor-pointer"
                >
                  Go Back
                </button>
                <button
                  onClick={executeUpgrade}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-extrabold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg active:scale-95"
                >
                  View Credit Packs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
