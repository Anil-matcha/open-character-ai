"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  Sliders,
  Image as ImageIcon,
  Cpu,
  LogOut,
  Loader2,
  ArrowLeft,
  Plus,
  History,
  LogIn,
  Flame,
  X,
  Menu,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Trash2,
  RotateCcw,
  FastForward,
  Eye,
  BookOpen,
  Download,
  Check,
} from "lucide-react";

// Markdown renderer for roleplay dialogue and thoughts
function renderMarkdown(text) {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);
  return blocks.map((block, blockIdx) => {
    const trimmed = block.trim();
    if (trimmed === "---") {
      return <hr key={blockIdx} className="my-4 border-t border-zinc-800" />;
    }
    if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
      const codeLines = trimmed.slice(3, -3).trim().split("\n");
      const firstLine = codeLines[0];
      const isLang =
        firstLine && !firstLine.includes(" ") && firstLine.length < 15;
      const code = (isLang ? codeLines.slice(1) : codeLines).join("\n");
      return (
        <pre
          key={blockIdx}
          className="my-3 p-4 bg-zinc-950 rounded border border-zinc-850 overflow-x-auto font-mono text-xs text-blue-300"
        >
          <code>{code}</code>
        </pre>
      );
    }
    if (
      trimmed
        .split("\n")
        .every(
          (line) =>
            line.trim().startsWith("* ") || line.trim().startsWith("- "),
        )
    ) {
      return (
        <ul
          key={blockIdx}
          className="list-disc pl-5 my-3 space-y-1.5 text-zinc-300"
        >
          {trimmed.split("\n").map((line, lineIdx) => {
            const content = line.replace(/^[\*\-]\s+/, "");
            return <li key={lineIdx}>{parseInlineMarkdown(content)}</li>;
          })}
        </ul>
      );
    }
    if (trimmed.split("\n").every((line) => /^\d+\.\s+/.test(line.trim()))) {
      return (
        <ol
          key={blockIdx}
          className="list-decimal pl-5 my-3 space-y-1.5 text-zinc-350"
        >
          {trimmed.split("\n").map((line, lineIdx) => {
            const content = line.replace(/^\d+\.\s+/, "");
            return <li key={lineIdx}>{parseInlineMarkdown(content)}</li>;
          })}
        </ol>
      );
    }
    if (trimmed.startsWith("### ")) {
      return (
        <h4
          key={blockIdx}
          className="text-sm font-black uppercase tracking-wider text-blue-400 mt-4 mb-2"
        >
          {parseInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3
          key={blockIdx}
          className="text-base font-black text-zinc-100 mt-4 mb-2"
        >
          {parseInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2
          key={blockIdx}
          className="text-lg font-black text-zinc-100 mt-4 mb-2"
        >
          {parseInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
    }
    if (trimmed.startsWith("> ")) {
      return (
        <blockquote
          key={blockIdx}
          className="border-l-2 border-blue-500 pl-4 py-1 my-3 text-zinc-400 italic text-sm"
        >
          {parseInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
    }
    return (
      <p key={blockIdx} className="leading-relaxed">
        {parseInlineMarkdown(trimmed)}
      </p>
    );
  });
}

function parseInlineMarkdown(text) {
  if (!text) return "";
  const parts = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const matches = [
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index } : null,
      italicMatch ? { type: "italic", match: italicMatch, index: italicMatch.index } : null,
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index } : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0];
    if (first.index > 0) {
      parts.push(remaining.substring(0, first.index));
    }

    if (first.type === "bold") {
      parts.push(
        <strong key={keyIdx++} className="font-bold text-zinc-100">
          {first.match[1]}
        </strong>,
      );
    } else if (first.type === "italic") {
      // Roleplay asterisk thoughts / stage directions styling
      parts.push(
        <em key={keyIdx++} className="italic text-zinc-400 font-serif">
          {first.match[1]}
        </em>,
      );
    } else if (first.type === "code") {
      parts.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-xs text-blue-300"
        >
          {first.match[1]}
        </code>,
      );
    }

    remaining = remaining.substring(first.index + first.match[0].length);
  }

  return parts;
}

export default function ChatSpace({ params }) {
  const resolvedParams = use(params);
  const chatId = resolvedParams.id;
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Core state
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarChats, setSidebarChats] = useState([]);

  // Advanced parameters state
  const [showConfig, setShowConfig] = useState(false);
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [reasoning, setReasoning] = useState(false);

  // Vision attachments state
  const [attachedImage, setAttachedImage] = useState(null);
  const [attachedImages, setAttachedImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Roleplay Story Controls State
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [swipeLoading, setSwipeLoading] = useState({}); // { [messageId]: 'prev' | 'next' | 'generate' }
  const [actionLoading, setActionLoading] = useState(null); // 'regenerate' | 'continue'

  // Context Inspector State
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [promptPreviewData, setPromptPreviewData] = useState(null);
  const [loadingPromptPreview, setLoadingPromptPreview] = useState(false);

  // Story Memory State
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [storyMemory, setStoryMemory] = useState({ summary: "", pinnedFacts: [] });
  const [newFactInput, setNewFactInput] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  // Upgrade modal state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [overrideCredits, setOverrideCredits] = useState(null);
  const userCredits = overrideCredits !== null ? overrideCredits : (session?.user?.credits ?? 50);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchSidebarChats = async () => {
    try {
      const res = await fetch("/api/chats");
      const data = await res.json();
      if (data.chats) {
        setSidebarChats(data.chats);
      }
    } catch (err) {
      console.error("Failed to load active chats", err);
    }
  };

  const handleStartNewChat = async () => {
    if (!activeChat?.characterId) return;
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: activeChat.characterId,
          forceNew: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.chat) {
          fetchSidebarChats();
          router.push(`/${resolvedParams.character_name}/${data.chat.id}`);
        }
      }
    } catch (err) {
      console.error("Failed starting new chat", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (authStatus === "authenticated") {
      fetch("/api/chats")
        .then((r) => r.json())
        .then((data) => {
          if (isMounted && data.chats) {
            setSidebarChats(data.chats);
          }
        })
        .catch(console.error);

      fetch(`/api/chats/${chatId}/messages`)
        .then((r) => r.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.messages) setMessages(data.messages);
          if (data.chat) {
            setActiveChat(data.chat);
            if (data.chat.settings) {
              if (data.chat.settings.model) setModel(data.chat.settings.model);
              if (data.chat.settings.temperature !== undefined) setTemperature(data.chat.settings.temperature);
              if (data.chat.settings.maxTokens !== undefined) setMaxTokens(data.chat.settings.maxTokens);
              if (data.chat.settings.reasoning !== undefined) setReasoning(data.chat.settings.reasoning);
            }
          }
        })
        .catch(console.error);
    }
    return () => {
      isMounted = false;
    };
  }, [authStatus, chatId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  // Normal Send Flow
  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if ((!inputMessage.trim() && attachedImages.length === 0) || isTyping) return;

    const userText = inputMessage;
    const userImg = attachedImages[0] || null;

    setInputMessage("");
    setAttachedImage(null);
    setAttachedImages([]);
    setIsTyping(true);

    const textarea = document.querySelector("textarea[placeholder*='Ask']");
    if (textarea) textarea.style.height = "24px";

    const tempUserMsg = {
      id: "temp_user_" + Math.random().toString(36).substring(2, 9),
      role: "user",
      content: userText,
      imageUrl: userImg,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          content: userText,
          imageUrl: userImg,
          model,
          temperature,
          maxTokens,
          reasoning,
        }),
      });

      if (res.status === 402) {
        const errData = await res.json();
        alert(errData.error || "Insufficient credits! Please top up.");
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Generation pipeline failed");
      }

      const data = await res.json();
      if (data.assistantMessage) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          data.userMessage,
          data.assistantMessage,
        ]);
        if (data.remainingCredits !== undefined) {
          setOverrideCredits(data.remainingCredits);
        }
      }
    } catch (err) {
      console.error("Post generation error", err);
      alert(err.message || "An unexpected error occurred. Credits refunded if deducted.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setIsTyping(false);
    }
  };

  // Swiping: Switch to a different alternative response
  const handleSelectSwipe = async (messageId, targetIndex, direction = "next") => {
    if (swipeLoading[messageId]) return;

    // Set directional loading indicator on the arrow button
    setSwipeLoading((prev) => ({ ...prev, [messageId]: direction }));

    // Optimistically update the message content & selected flag immediately
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.swipes) return m;
        const targetSwipe = m.swipes.find((s) => s.index === targetIndex);
        if (!targetSwipe) return m;
        return {
          ...m,
          content: targetSwipe.content,
          swipes: m.swipes.map((s) => ({
            ...s,
            selected: s.index === targetIndex,
          })),
        };
      })
    );

    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedSwipeIndex: targetIndex }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? data.message : m)),
          );
        }
      }
    } catch (err) {
      console.error("Failed selecting swipe", err);
    } finally {
      setSwipeLoading((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  };

  // Swiping: Generate a new alternative reply for an assistant turn
  const handleGenerateSwipe = async (targetMessageId) => {
    if (isTyping || swipeLoading[targetMessageId]) return;
    setIsTyping(true);
    setSwipeLoading((prev) => ({ ...prev, [targetMessageId]: "generate" }));
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swipe",
          targetMessageId,
          model,
          temperature,
          maxTokens,
          reasoning,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate swipe alternative");
      }

      const data = await res.json();
      if (data.assistantMessage) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetMessageId ? data.assistantMessage : m)),
        );
        if (data.remainingCredits !== undefined) {
          setOverrideCredits(data.remainingCredits);
        }
      }
    } catch (err) {
      alert(err.message || "Failed generating swipe");
    } finally {
      setIsTyping(false);
      setSwipeLoading((prev) => {
        const next = { ...prev };
        delete next[targetMessageId];
        return next;
      });
    }
  };

  // Regenerate: Retries the last assistant response
  const handleRegenerate = async () => {
    if (isTyping) return;
    setIsTyping(true);
    setActionLoading("regenerate");
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate",
          model,
          temperature,
          maxTokens,
          reasoning,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Regeneration failed");
      }

      const data = await res.json();
      if (data.assistantMessage) {
        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.role === "assistant");
          if (lastIdx === -1) return [...prev, data.assistantMessage];
          const actualIdx = prev.length - 1 - lastIdx;
          const copy = [...prev];
          copy[actualIdx] = data.assistantMessage;
          return copy;
        });
        if (data.remainingCredits !== undefined) {
          setOverrideCredits(data.remainingCredits);
        }
      }
    } catch (err) {
      alert(err.message || "Failed to regenerate");
    } finally {
      setIsTyping(false);
      setActionLoading(null);
    }
  };

  // Continue: Instructs the AI to continue its prose
  const handleContinue = async () => {
    if (isTyping) return;
    setIsTyping(true);
    setActionLoading("continue");
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "continue",
          model,
          temperature,
          maxTokens,
          reasoning,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Continuation failed");
      }

      const data = await res.json();
      if (data.assistantMessage) {
        setMessages((prev) => [...prev, data.assistantMessage]);
        if (data.remainingCredits !== undefined) {
          setOverrideCredits(data.remainingCredits);
        }
      }
    } catch (err) {
      alert(err.message || "Failed to continue story");
    } finally {
      setIsTyping(false);
      setActionLoading(null);
    }
  };

  // Save Inline Message Edit
  const handleSaveEdit = async (messageId, newContent) => {
    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? data.message : m)),
          );
          setEditingMessageId(null);
        }
      }
    } catch (err) {
      alert("Failed saving edited turn");
    }
  };

  // Delete message turn
  const handleDeleteMessage = async (messageId) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (err) {
      alert("Failed to delete message");
    }
  };

  // Prompt Context Inspector
  const handleInspectPrompt = async () => {
    setLoadingPromptPreview(true);
    setShowPromptInspector(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/prompt-preview`);
      const data = await res.json();
      setPromptPreviewData(data);
    } catch (err) {
      console.error("Failed loading prompt preview", err);
    } finally {
      setLoadingPromptPreview(false);
    }
  };

  // Story Memory Management
  const fetchStoryMemory = async () => {
    try {
      const res = await fetch(`/api/chats/${chatId}/memory`);
      const data = await res.json();
      setStoryMemory({
        summary: data.summary || "",
        pinnedFacts: data.pinnedFacts || [],
      });
    } catch (err) {
      console.error("Failed loading memory", err);
    }
  };

  const handleAddFact = async () => {
    if (!newFactInput.trim()) return;
    setSavingMemory(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newFact: newFactInput.trim(),
          summary: storyMemory.summary,
        }),
      });
      const data = await res.json();
      setStoryMemory({
        summary: data.summary,
        pinnedFacts: data.pinnedFacts || [],
      });
      setNewFactInput("");
    } catch (err) {
      alert("Failed adding fact");
    } finally {
      setSavingMemory(false);
    }
  };

  const handleRemoveFact = async (index) => {
    setSavingMemory(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removeFactIndex: index,
          summary: storyMemory.summary,
        }),
      });
      const data = await res.json();
      setStoryMemory({
        summary: data.summary,
        pinnedFacts: data.pinnedFacts || [],
      });
    } catch (err) {
      alert("Failed removing fact");
    } finally {
      setSavingMemory(false);
    }
  };

  const handleSaveSummary = async () => {
    setSavingMemory(true);
    try {
      await fetch(`/api/chats/${chatId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: storyMemory.summary }),
      });
      alert("Story summary saved!");
    } catch (err) {
      alert("Failed saving summary");
    } finally {
      setSavingMemory(false);
    }
  };

  // Export Chat
  const handleExportChat = (format = "markdown") => {
    window.open(`/api/chats/${chatId}/export?format=${format}`, "_blank");
  };

  // Real upgrade redirect
  const executeUpgrade = () => {
    setShowUpgradeModal(false);
    router.push("/pricing");
  };

  // Media upload proxy
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Proxy upload failed");

      const data = await res.json();
      if (data.url) {
        setAttachedImage(data.url);
        setAttachedImages((prev) => [...prev, data.url]);
        if (showGallery) fetchGalleryImages();
      }
    } catch (err) {
      alert("Vision upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleGallery = async () => {
    const nextState = !showGallery;
    setShowGallery(nextState);
    if (nextState) fetchGalleryImages();
  };

  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      if (data.images) setGalleryImages(data.images);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGallery(false);
    }
  };

  const selectGalleryImage = (url) => {
    setAttachedImage(url);
    setAttachedImages((prev) => [...prev, url]);
    setShowGallery(false);
  };

  const handleTextareaChange = (e) => {
    setInputMessage(e.target.value);
    e.target.style.height = "24px";
    e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 24), 180)}px`;
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950 text-gray-100 font-sans antialiased">
      {/* MOBILE OVERLAY */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 1. SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-all duration-300 md:relative md:translate-x-0 bg-zinc-900 border-r border-zinc-800 p-5 flex flex-col shrink-0 select-none ${
          showSidebar ? "translate-x-0 shadow-2xl md:ml-0 md:shadow-none" : "-translate-x-full md:-ml-64"
        }`}
      >
        <div className="flex items-center gap-2 justify-between mb-6">
          <Link href="/" className="flex items-center gap-3 hover:opacity-95 transition-opacity">
            <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/10">
              🤖
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wider text-white">character.ai</h1>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                Roleplay Studio
              </p>
            </div>
          </Link>
          <button
            onClick={() => setShowSidebar(false)}
            className="md:hidden p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Chat Sessions
            </h3>
            <button
              onClick={handleStartNewChat}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition flex items-center gap-1 text-[11px] font-bold"
              title="Start brand new story branch"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Story</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {sidebarChats.map((c) => {
              const isSelected = c.id === chatId;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setShowSidebar(false);
                    const slug = c.character.name.toLowerCase().replace(/ /g, "-");
                    router.push(`/${slug}/${c.id}`);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-blue-600/15 border border-blue-500/30 text-white font-medium shadow-sm"
                      : "hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs shrink-0 overflow-hidden">
                    {c.character.profileUrl || (c.character.avatar.length > 2 && c.character.avatar.startsWith("http")) ? (
                      <img src={c.character.profileUrl || c.character.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      c.character.avatar
                    )}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <h4 className="font-semibold text-xs truncate leading-snug">{c.character.name}</h4>
                    <p className="text-[10px] text-zinc-500 truncate">{c.title || "Active Story Thread"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM USER PANEL */}
        <div className="pt-4 border-t border-zinc-800 mt-2">
          <div className="flex items-center justify-between mb-3 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs">⚡</span>
              <span className="text-xs font-bold text-zinc-300">Credits:</span>
              <span className="text-xs font-mono font-bold text-blue-400">{userCredits}</span>
            </div>
            <button
              onClick={() => router.push("/pricing")}
              className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition uppercase tracking-wider"
            >
              + Top up
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              {session?.user?.image ? (
                <img src={session.user.image} alt="" className="w-8 h-8 rounded-full border border-zinc-700" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white">
                  {session?.user?.name?.[0] || "U"}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{session?.user?.name || "User"}</p>
                <p className="text-[10px] text-zinc-500 truncate">{session?.user?.email || ""}</p>
              </div>
            </div>
            <button onClick={() => signOut()} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. CHAT CANVAS */}
      <section className="flex-1 flex flex-col h-full overflow-hidden bg-bg-page relative">
        {/* TOP BAR */}
        <header className="h-14 border-b border-divider/50 bg-bg-card/40 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition">
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm shrink-0 overflow-hidden">
                {activeChat?.character?.profileUrl || (activeChat?.character?.avatar?.length > 2 && activeChat?.character?.avatar?.startsWith("http")) ? (
                  <img src={activeChat?.character?.profileUrl || activeChat?.character?.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  activeChat?.character?.avatar || "🤖"
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">
                  {activeChat?.character?.name || "Roleplay"}
                </h2>
                <p className="text-[10px] text-zinc-500 truncate max-w-xs">
                  {activeChat?.character?.description || "Roleplay Partner"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                showConfig
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tuning</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <div className="flex-1 flex justify-center overflow-hidden relative">
          {/* MESSAGES LOG VIEW */}
          <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6 flex flex-col items-center bg-bg-page/10 custom-scrollbar relative w-full pb-24">
            <div className="space-y-6 flex flex-col w-full lg:max-w-[70%]">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const activeSwipeIndex = m.swipes ? m.swipes.findIndex((s) => s.selected !== false) : -1;
                const currentSwipeNum = (activeSwipeIndex >= 0 ? activeSwipeIndex : (m.swipes?.length || 1) - 1) + 1;
                const totalSwipes = m.swipes?.length || 1;

                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 max-w-[85%] ${
                      isUser ? "self-end flex-row-reverse" : "self-start"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none overflow-hidden bg-zinc-800 border border-zinc-700">
                      {isUser ? (
                        session?.user?.image ? (
                          <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          "U"
                        )
                      ) : activeChat?.character?.profileUrl ||
                        (activeChat?.character?.avatar?.length > 2 && activeChat?.character?.avatar?.startsWith("http")) ? (
                        <img src={activeChat?.character?.profileUrl || activeChat?.character?.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        activeChat?.character?.avatar || "🤖"
                      )}
                    </div>

                    {/* Bubble Content */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className={`flex items-center gap-2 text-[10px] text-zinc-500 ${isUser ? "justify-end" : "justify-start"}`}>
                        <span className="font-semibold text-zinc-400">{isUser ? "You" : activeChat?.character?.name || "AI"}</span>
                        <span>•</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>

                      <div
                        className={`px-4 py-3 rounded-xl text-sm leading-relaxed border backdrop-blur-sm shadow-md w-full relative group ${
                          isUser
                            ? "bg-zinc-800/80 border-zinc-700/60 text-zinc-100 rounded-tr-none"
                            : "bg-zinc-900/90 border-zinc-800 text-zinc-100 rounded-tl-none"
                        }`}
                      >
                        {/* Hover Actions: Inline Edit and Delete */}
                        <div
                          className={`absolute top-2 ${isUser ? "left-2" : "right-2"} opacity-0 group-hover:opacity-100 transition flex items-center gap-1 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded border border-zinc-700/60 z-10`}
                        >
                          <button
                            onClick={() => {
                              setEditingMessageId(m.id);
                              setEditingText(m.content);
                            }}
                            className="p-1 hover:text-blue-400 text-zinc-400 transition cursor-pointer"
                            title="Edit message"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(m.id)}
                            className="p-1 hover:text-red-400 text-zinc-400 transition cursor-pointer"
                            title="Delete turn"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Message Body or Inline Editor */}
                        {editingMessageId === m.id ? (
                          <div className="space-y-2 py-1">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={4}
                              className="w-full bg-zinc-950 border border-blue-500/60 rounded p-2.5 text-xs text-zinc-100 focus:outline-none resize-y custom-scrollbar"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] text-zinc-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEdit(m.id, editingText)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.imageUrl && (
                              <div className="mb-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 max-w-md">
                                <img src={m.imageUrl} alt="Attached asset" className="w-full max-h-72 object-cover" />
                              </div>
                            )}
                            <div className="markdown-content space-y-2 text-zinc-200">
                              {renderMarkdown(m.content)}
                            </div>
                          </>
                        )}

                        {/* Swipe navigation for assistant turns */}
                        {!isUser && (
                          <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400 select-none">
                            <div className="flex items-center gap-1.5">
                              {totalSwipes > 1 ? (
                                <>
                                  <button
                                    onClick={() => {
                                      if (currentSwipeNum > 1) {
                                        handleSelectSwipe(m.id, currentSwipeNum - 2, "prev");
                                      }
                                    }}
                                    disabled={currentSwipeNum <= 1 || isTyping || !!swipeLoading[m.id]}
                                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center min-w-[22px] min-h-[22px]"
                                    title={swipeLoading[m.id] === "prev" ? "Loading previous response..." : "Previous swipe"}
                                  >
                                    {swipeLoading[m.id] === "prev" ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                                    ) : (
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <span className="font-mono text-[10px] text-zinc-400 font-semibold px-1 flex items-center gap-1">
                                    {swipeLoading[m.id] === "generate" ? (
                                      <>
                                        <span>{currentSwipeNum} / {totalSwipes}</span>
                                        <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                      </>
                                    ) : (
                                      <span>{currentSwipeNum} / {totalSwipes}</span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (currentSwipeNum < totalSwipes) {
                                        handleSelectSwipe(m.id, currentSwipeNum, "next");
                                      } else {
                                        handleGenerateSwipe(m.id);
                                      }
                                    }}
                                    disabled={isTyping || !!swipeLoading[m.id]}
                                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center min-w-[22px] min-h-[22px]"
                                    title={
                                      swipeLoading[m.id] === "next" || swipeLoading[m.id] === "generate"
                                        ? "Loading next response..."
                                        : currentSwipeNum < totalSwipes
                                        ? "Next swipe"
                                        : "Next or new swipe"
                                    }
                                  >
                                    {swipeLoading[m.id] === "next" || swipeLoading[m.id] === "generate" ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </>
                              ) : null}
                              <button
                                onClick={() => handleGenerateSwipe(m.id)}
                                disabled={isTyping || !!swipeLoading[m.id]}
                                className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-blue-400 hover:text-blue-300 font-medium transition flex items-center gap-1 border border-zinc-700/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Generate alternate swipe"
                              >
                                {swipeLoading[m.id] === "generate" ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                ) : (
                                  <Sparkles className="w-2.5 h-2.5" />
                                )}
                                <span>{swipeLoading[m.id] === "generate" ? "Generating..." : "Swipe +"}</span>
                              </button>
                            </div>
                            {m.editedAt && (
                              <span className="text-[10px] italic text-zinc-500">
                                (edited)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex items-start gap-3 self-start">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs overflow-hidden border border-zinc-700">
                    🤖
                  </div>
                  <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl rounded-tl-none flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-xs text-zinc-400">Composing response...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* SLIDE-OUT TUNING DRAWER */}
          {showConfig && (
            <aside className="w-80 bg-zinc-900 border-l border-zinc-800 p-5 overflow-y-auto custom-scrollbar select-none z-20">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-5">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Model Tuning</span>
                </h3>
                <button onClick={() => setShowConfig(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-5 text-xs">
                {/* Model Selector */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-blue-500 text-xs"
                  >
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (Fast, standard)</option>
                    <option value="openai/gpt-4o">GPT-4o (Premium reasoning)</option>
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (Nuanced roleplay)</option>
                    <option value="deepseek/deepseek-r1">DeepSeek R1 (Deep thought)</option>
                  </select>
                </div>

                {/* Temperature */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Temperature
                    </label>
                    <span className="font-mono text-blue-400 font-bold">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <span className="text-[10px] text-zinc-500">Higher = more creative & varied speech.</span>
                </div>

                {/* Max Tokens */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Max Output Tokens
                    </label>
                    <span className="font-mono text-blue-400 font-bold">{maxTokens}</span>
                  </div>
                  <input
                    type="range"
                    min="256"
                    max="4096"
                    step="128"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* Reasoning Mode Toggle */}
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <div>
                    <span className="font-bold text-xs text-zinc-200 block">Extended Reasoning</span>
                    <span className="text-[10px] text-zinc-500">Enable inner monologue thinking</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={reasoning}
                    onChange={(e) => setReasoning(e.target.checked)}
                    className="accent-blue-500 h-4 w-4"
                  />
                </div>
              </div>
            </aside>
          )}
        </div>

        {/* 3. BOTTOM FLOATING ACTION BAR & INPUT */}
        <footer className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-4 pb-3 px-4 z-20">
          <div className="max-w-3xl mx-auto w-full">
            {/* ROLEPLAY ACTION BAR */}
            <div className="flex items-center justify-between px-2 py-1.5 mb-1.5 text-xs select-none">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isTyping || messages.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition disabled:opacity-40 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                  title="Regenerate last turn"
                >
                  {actionLoading === "regenerate" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  ) : (
                    <RotateCcw className="w-3 h-3 text-blue-400" />
                  )}
                  <span className="hidden sm:inline">
                    {actionLoading === "regenerate" ? "Regenerating..." : "Regenerate"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={isTyping || messages.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition disabled:opacity-40 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                  title="Continue AI reply"
                >
                  {actionLoading === "continue" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                  ) : (
                    <FastForward className="w-3 h-3 text-emerald-400" />
                  )}
                  <span className="hidden sm:inline">
                    {actionLoading === "continue" ? "Continuing..." : "Continue"}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleInspectPrompt}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
                  title="Inspect Assembled Prompt Context"
                >
                  <Eye className="w-3 h-3 text-purple-400" />
                  <span className="hidden sm:inline">Context</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fetchStoryMemory();
                    setShowMemoryModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
                  title="Story Memory & Pinned Facts"
                >
                  <BookOpen className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">Memory</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportChat("markdown")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
                  title="Export Transcript (Markdown)"
                >
                  <Download className="w-3 h-3 text-zinc-400" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>

            {/* MESSAGE INPUT BOX */}
            <form
              onSubmit={handleSendMessage}
              className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 shadow-xl flex flex-col gap-2"
            >
              {/* Attached thumbnail */}
              {attachedImages.length > 0 && (
                <div className="flex gap-2 p-1 overflow-x-auto">
                  {attachedImages.map((imgUrl, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = attachedImages.filter((_, i) => i !== idx);
                          setAttachedImages(updated);
                          setAttachedImage(updated[0] || null);
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/80 rounded-full text-zinc-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setShowPlusMenu(!showPlusMenu)}
                  className="h-8 w-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0"
                  title="Attach Image"
                >
                  <Plus className={`w-4 h-4 transition-transform ${showPlusMenu ? "rotate-45" : ""}`} />
                </button>

                {showPlusMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowPlusMenu(false)} />
                    <div className="absolute bottom-14 left-2 bg-zinc-800 border border-zinc-700 shadow-2xl rounded-lg overflow-hidden w-40 z-40 flex flex-col text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPlusMenu(false);
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-blue-600 hover:text-white text-zinc-300 transition text-left cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Upload Image</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPlusMenu(false);
                          toggleGallery();
                        }}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 text-zinc-300 transition text-left cursor-pointer"
                      >
                        <History className="w-4 h-4" />
                        <span>Recent files</span>
                      </button>
                    </div>
                  </>
                )}

                <textarea
                  value={inputMessage}
                  onChange={handleTextareaChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder="Speak in roleplay... (e.g. *walks over* What is this place?)"
                  rows={1}
                  className="w-full bg-transparent text-sm focus:outline-none text-zinc-100 placeholder-zinc-500 resize-none max-h-48 custom-scrollbar leading-relaxed"
                  style={{ height: "24px", minHeight: "24px" }}
                />

                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && attachedImages.length === 0) || isTyping}
                  className={`h-8 w-8 rounded-full transition duration-200 flex items-center justify-center cursor-pointer shrink-0 ${
                    (!inputMessage.trim() && attachedImages.length === 0) || isTyping
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-95"
                  }`}
                  title="Send message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </footer>
      </section>

      {/* 4. CONTEXT / PROMPT INSPECTOR MODAL */}
      {showPromptInspector && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm text-zinc-100">Prompt Context Inspector</h3>
              </div>
              <button onClick={() => setShowPromptInspector(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              {loadingPromptPreview ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
              ) : promptPreviewData ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Est. Tokens</span>
                      <span className="font-mono text-sm font-bold text-purple-400">~{promptPreviewData.estimatedTokens}</span>
                    </div>
                    <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Active Lore</span>
                      <span className="font-mono text-sm font-bold text-amber-400">{promptPreviewData.activeLoreEntriesCount} entries</span>
                    </div>
                    <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Turns Buffered</span>
                      <span className="font-mono text-sm font-bold text-emerald-400">{promptPreviewData.structuredTurnsCount} turns</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400">Assembled Prompt Blocks</h4>
                    {promptPreviewData.blocks?.map((b) => (
                      <div key={b.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 block">{b.title}</span>
                        <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto custom-scrollbar">
                          {b.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-zinc-500 text-center py-8">Failed to generate prompt preview.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. STORY MEMORY MODAL */}
      {showMemoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-zinc-100">Story Memory & Pinned Facts</h3>
              </div>
              <button onClick={() => setShowMemoryModal(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                  Rolling Story Summary
                </label>
                <textarea
                  value={storyMemory.summary}
                  onChange={(e) => setStoryMemory({ ...storyMemory, summary: e.target.value })}
                  placeholder="Summary of previous key events in this roleplay..."
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 resize-y custom-scrollbar"
                />
                <button
                  type="button"
                  onClick={handleSaveSummary}
                  disabled={savingMemory}
                  className="mt-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded text-[11px] font-bold cursor-pointer"
                >
                  Save Summary
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                  Pinned Key Facts
                </label>
                <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto custom-scrollbar">
                  {storyMemory.pinnedFacts.map((fact, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300">
                      <span>• {fact}</span>
                      <button onClick={() => handleRemoveFact(idx)} className="p-1 hover:text-red-400 text-zinc-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFactInput}
                    onChange={(e) => setNewFactInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddFact();
                      }
                    }}
                    placeholder="e.g. Jax owes a favor to the cyber-doc"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddFact}
                    disabled={savingMemory || !newFactInput.trim()}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-xs cursor-pointer disabled:opacity-40"
                  >
                    Pin Fact
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. IMAGE GALLERY DRAWER */}
      {showGallery && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-800 p-5 z-40 shadow-2xl flex flex-col animate-slideLeft select-none">
          <div className="flex justify-between items-center mb-6 pb-3 border-b border-zinc-800">
            <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              <span>Cross-Chat Image Gallery</span>
            </h3>
            <button onClick={() => setShowGallery(false)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {loadingGallery ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              </div>
            ) : galleryImages.length === 0 ? (
              <div className="h-48 border border-dashed border-zinc-800 rounded flex flex-col items-center justify-center p-4 text-center">
                <span className="text-2xl mb-2">🖼️</span>
                <span className="text-xs text-zinc-500 font-semibold">No media logs recorded</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {galleryImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => selectGalleryImage(img.url)}
                    className="group aspect-square rounded overflow-hidden border border-zinc-800 hover:border-blue-500/80 transition relative bg-black/40 hover:scale-[1.03]"
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
