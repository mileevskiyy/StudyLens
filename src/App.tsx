import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  BookOpen,
  Layers,
  Sun,
  BarChart3,
  X,
  ArrowLeft,
  Check,
  Download,
  Upload,
  Trash2,
  Pencil,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Leaf,
} from "lucide-react";
import type { Card, Deck, Note, Grade, View } from "./types";
const gradeNames: Grade[] = ["again", "hard", "good", "easy"];
const date = (n: number) =>
  new Date(n).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const duration = (ms: number) =>
  ms < 3600000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 86400000)}d`;
function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Leaf size={21} />
      </span>
      study<span>lens</span>
      <sup>®</sup>
    </span>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [csrf, setCsrf] = useState(""),
    [ready, setReady] = useState(false),
    [w, setW] = useState<any>(null),
    [view, setView] = useState<View>("today"),
    [deckId, setDeckId] = useState<string | null>(null),
    [tab, setTab] = useState("cards"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<any>(null),
    [review, setReview] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function request(
    path: string,
    method = "GET",
    body?: any,
    credential = csrf,
  ) {
    const res = await fetch("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": credential,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setW(null);
        setCsrf("");
      }
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }
  async function load(token = csrf) {
    const data = await request("/workspace", "GET", undefined, token);
    setW(data);
    return data;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        const s = await request("/session");
        if (s.authenticated) {
          setCsrf(s.csrf);
          const data = await load(s.csrf);
          setReview(Boolean(data.study && data.study.finishedAt === null));
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const deck: Deck | undefined = w?.decks.find((d: Deck) => d.id === deckId),
    study = w?.study;
  async function begin(id: string | null) {
    await run(async () => {
      await request("/review/start", "POST", { deckId: id });
      await load();
      setReview(true);
    });
  }
  async function reveal() {
    await run(async () => {
      await request("/review/reveal", "POST", { sessionId: study.id });
      await load();
    });
  }
  async function rate(grade: Grade) {
    const key = crypto.randomUUID();
    await run(async () => {
      await request("/review/rate", "POST", {
        sessionId: study.id,
        cardId: study.current.id,
        grade,
        key,
      });
      await load();
    });
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !review ||
        !study?.current ||
        busy ||
        modal ||
        (e.target as HTMLElement)?.closest("input,textarea,select,button")
      )
        return;
      if (e.code === "Space" && !study.revealed) {
        e.preventDefault();
        void reveal();
      }
      if (study.revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(gradeNames[Number(e.key) - 1]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [review, study, busy, modal, csrf]);
  const due = (id: string) =>
    w.cards.filter((c: Card) => c.deckId === id && c.dueAt <= w.now).length;
  const count = (id: string) =>
    w.cards.filter((c: Card) => c.deckId === id).length;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      if (modal.kind === "deck") {
        const data = {
          title: form.get("title"),
          subject: form.get("subject"),
          description: form.get("description"),
          color: form.get("color"),
        };
        const d = await request(
          "/decks" + (modal.item ? "/" + modal.item.id : ""),
          modal.item ? "PUT" : "POST",
          data,
        );
        setDeckId(d.id);
        setView("library");
        setTab("cards");
      }
      if (modal.kind === "card") {
        const data = {
          front: form.get("front"),
          back: form.get("back"),
          tags: String(form.get("tags") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          version: modal.item?.version,
        };
        await request(
          modal.item ? "/cards/" + modal.item.id : `/decks/${deckId}/cards`,
          modal.item ? "PUT" : "POST",
          data,
        );
      }
      if (modal.kind === "note")
        await request(
          `/decks/${deckId}/notes` + (modal.item ? "/" + modal.item.id : ""),
          modal.item ? "PUT" : "POST",
          { title: form.get("title"), body: form.get("body") },
        );
      if (modal.kind === "goal")
        await request("/goal", "PUT", { goal: Number(form.get("goal")) });
      await load();
      setModal(null);
      setNotice("Saved. A little more knowledge, organized.");
    });
  }
  async function importFile(f: File | undefined) {
    if (!f) return;
    await run(async () => {
      if (f.size > 1400000)
        throw new Error("Choose a library file smaller than 1.4 MB.");
      let data;
      try {
        data = JSON.parse(await f.text());
      } catch {
        throw new Error("This file is not valid JSON.");
      }
      const result = await request("/import", "POST", data);
      await load();
      setView("library");
      setDeckId(null);
      setNotice(
        `Imported ${result.decks} collection(s) and ${result.cards} card(s). Scheduling starts fresh.`,
      );
    });
    if (file.current) file.current.value = "";
  }
  function go(v: View) {
    setView(v);
    setDeckId(null);
    setQuery("");
    setError("");
  }
  const collections = (w?.decks || []).filter((d: Deck) =>
    [
      d.title,
      d.subject,
      d.description,
      ...w.cards
        .filter((c: Card) => c.deckId === d.id)
        .flatMap((c: Card) => [c.front, c.back, ...c.tags]),
      ...w.notes
        .filter((n: Note) => n.deckId === d.id)
        .flatMap((n: Note) => [n.title, n.body]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function collectionCard(d: Deck, i: number) {
    return (
      <button
        key={d.id}
        className={`collection ${d.color}`}
        onClick={() => {
          setDeckId(d.id);
          setTab("cards");
          setQuery("");
          setView("library");
        }}
      >
        <div className="collection-top">
          <span className="small-label">{d.subject}</span>
          <ArrowUpRight size={20} />
        </div>
        <div className="book-symbol" aria-hidden="true">
          {["✳", "◒", "⌘", "∑", "⌁"][i % 5]}
        </div>
        <h3>{d.title}</h3>
        <p>{d.description || "A new space for your next discovery."}</p>
        <div className="collection-bottom">
          <span>
            <Layers size={14} />
            {count(d.id)} cards
          </span>
          <span className="due-pill">
            {due(d.id) ? `${due(d.id)} to review` : "All caught up"}
          </span>
        </div>
      </button>
    );
  }
  if (!ready)
    return (
      <div className="loading">
        <Logo />
        <p>Opening your notebook…</p>
      </div>
    );
  if (!w)
    return (
      <div className="entry">
        <header>
          <Logo />
          <span className="small-label">A little every day.</span>
        </header>
        <main className="entry-grid">
          <div>
            <div className="eyebrow">
              <span className="tiny-dot" /> YOUR MIND. A LITTLE MORE ORGANIZED.
            </div>
            <h1>
              Make room
              <br />
              for what
              <br />
              you <em>know.</em>
            </h1>
            <p className="entry-copy">
              A thoughtful space for your notes, flashcards and daily practice.
              Less cramming. More connecting the dots.
            </p>
            <button
              className="primary large"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const s = await request("/demo", "POST", {});
                  setCsrf(s.csrf);
                  await load(s.csrf);
                })
              }
            >
              {busy ? "Opening your space…" : "Try the demo"}
              <ArrowUpRight size={20} />
            </button>
            <p className="entry-fine">
              Your own sample workspace. No account needed.
              <br />
              Expires after 24 hours of inactivity or a demo restart.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <div className="entry-art" aria-hidden="true">
            <span className="art-caption">
              COLLECT IDEAS.
              <br />
              MAKE CONNECTIONS.
            </span>
            <div className="art-circle" />
            <div className="art-book book-one">
              <span>THE ART OF</span>
              <strong>remembering.</strong>
              <i>✳</i>
            </div>
            <div className="art-book book-two">
              <span>FIELD NOTES / 001</span>
              <strong>
                Stay
                <br />
                curious.
              </strong>
              <i>↗</i>
            </div>
            <span className="art-sticker">
              one small
              <br />
              step today.
            </span>
          </div>
        </main>
        <footer>
          <span>StudyLens · An independent learning workspace</span>
          <span>Notes → Cards → Connections</span>
        </footer>
      </div>
    );
  return (
    <div className={"app " + (review ? "in-review" : "")}>
      <header className="topbar">
        <button
          className="brand-button"
          onClick={() => {
            if (!review) go("today");
          }}
          aria-label="StudyLens home"
        >
          <Logo />
        </button>
        <span className="top-tag">A SPACE TO GROW.</span>
        <div className="top-actions">
          <span className="session-dot" />
          Your demo workspace
          <button
            className="avatar"
            aria-label="Workspace options"
            onClick={() => setModal({ kind: "workspace" })}
          >
            Y
          </button>
        </div>
      </header>
      {!review && (
        <aside className="rail">
          <span className="rail-label">YOUR WORKSPACE</span>
          <nav>
            {(
              [
                ["today", "Today", Sun],
                ["library", "Collections", BookOpen],
                ["insights", "Your progress", BarChart3],
              ] as const
            ).map(([v, label, Icon], i) => (
              <button
                key={v}
                aria-label={label}
                className={view === v ? "active" : ""}
                onClick={() => go(v)}
              >
                <Icon size={19} />
                <span>{label}</span>
                <small>0{i + 1}</small>
              </button>
            ))}
          </nav>
          <div className="rail-note">
            <span>✳</span>
            <p>
              “Learning is
              <br />a practice,
              <br />
              not a race.”
            </p>
            <small>A REMINDER FOR TODAY</small>
          </div>
          <button
            className="rail-backup"
            onClick={() => setModal({ kind: "workspace" })}
          >
            <Download size={16} /> Library & settings
          </button>
        </aside>
      )}
      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={17} />
            {notice}
          </div>
        )}
        {review ? (
          <section className="review-space">
            <div className="review-top">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await request("/review/leave", "POST", {});
                    await load();
                    setReview(false);
                  })
                }
              >
                <ArrowLeft size={16} />
                Back to workspace
              </button>
              <span className="eyebrow">FOCUS ON ONE THING</span>
              <span>
                {study?.index || 0} / {study?.total || 0}
              </span>
            </div>
            {study?.current && study.finishedAt === null ? (
              <>
                <div className="review-progress">
                  <span
                    style={{ width: `${(study.index / study.total) * 100}%` }}
                  />
                </div>
                <div
                  className={"flashcard " + (study.revealed ? "revealed" : "")}
                >
                  <div className="flashcard-meta">
                    <span>
                      {
                        w.decks.find((d: Deck) => d.id === study.current.deckId)
                          ?.title
                      }
                    </span>
                    <span>CARD {study.index + 1}</span>
                  </div>
                  <span className="card-side">
                    {study.revealed
                      ? "MAKE THE CONNECTION"
                      : "A SMALL QUESTION"}
                  </span>
                  <h1>{study.current.front}</h1>
                  {study.revealed ? (
                    <div className="answer">
                      <span className="eyebrow">THE ANSWER</span>
                      <p>{study.current.back}</p>
                    </div>
                  ) : (
                    <div className="thinking-mark" aria-hidden="true">
                      ✳
                    </div>
                  )}
                </div>
                {!study.revealed ? (
                  <div className="review-controls">
                    <button
                      className="primary large"
                      disabled={busy}
                      onClick={reveal}
                    >
                      Reveal answer
                      <ArrowRight size={18} />
                    </button>
                    <p>
                      Take a moment to recall it. <kbd>space</kbd> to reveal.
                    </p>
                  </div>
                ) : (
                  <div className="rating-area">
                    <p>How well did you remember?</p>
                    <div className="ratings">
                      {gradeNames.map((g, i) => (
                        <button
                          key={g}
                          className={"rating " + g}
                          disabled={busy}
                          onClick={() => rate(g)}
                        >
                          <span>
                            <kbd>{i + 1}</kbd>
                            {g[0].toUpperCase() + g.slice(1)}
                          </span>
                          <small>{duration(study.current.intervals[g])}</small>
                        </button>
                      ))}
                    </div>
                    <small>
                      Your rating sets the next review. Again returns in 10
                      minutes.
                    </small>
                  </div>
                )}
              </>
            ) : (
              <div className="review-complete">
                <span className="completion-art">✳</span>
                <span className="eyebrow">A LITTLE MORE CONNECTED</span>
                <h1>
                  That’s a good
                  <br />
                  <em>place to pause.</em>
                </h1>
                <p>
                  You reviewed {study?.results.length || 0} card
                  {study?.results.length === 1 ? "" : "s"} in this session.
                  <br />
                  Your next review dates are saved.
                </p>
                <div className="summary-grades">
                  {gradeNames.map((g) => (
                    <div key={g}>
                      <strong>
                        {study?.results.filter((r: any) => r.grade === g)
                          .length || 0}
                      </strong>
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="primary large"
                  onClick={() => {
                    setReview(false);
                    go("today");
                  }}
                >
                  Back to today
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            {view === "today" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {new Date(w.now)
                        .toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          timeZone: "UTC",
                        })
                        .toUpperCase()}{" "}
                      · UTC
                    </span>
                    <h1>
                      A little progress.
                      <br />
                      <em>A lot of possibility.</em>
                    </h1>
                  </div>
                  <span className="heading-note">
                    No rush. Just a little
                    <br />
                    more than yesterday.<span>↙</span>
                  </span>
                </div>
                <div className="today-grid">
                  <section className="practice-banner">
                    <div>
                      <span className="eyebrow">YOUR DAILY PRACTICE</span>
                      <h2>
                        Keep the
                        <br />
                        connections alive.
                      </h2>
                      <p>
                        {w.stats.due
                          ? `${w.stats.due} cards are ready for a fresh look.`
                          : "You’re all caught up. Come back when your cards are due."}
                      </p>
                      <button
                        className="dark-button"
                        disabled={busy || !w.stats.due}
                        onClick={() => begin(null)}
                      >
                        Start reviewing
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <div className="banner-art" aria-hidden="true">
                      <span className="orbit o1" />
                      <span className="orbit o2" />
                      <span className="orbit o3" />
                      <span className="orbit-center">✳</span>
                      <span className="art-label">ONE IDEA AT A TIME.</span>
                    </div>
                  </section>
                  <section className="goal-card">
                    <div className="section-line">
                      <span className="eyebrow">TODAY’S INTENTION</span>
                      <button
                        className="icon"
                        aria-label="Change daily goal"
                        onClick={() => setModal({ kind: "goal" })}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                    <div
                      className="goal-ring"
                      style={
                        {
                          "--progress": `${Math.min(100, (w.stats.reviewedToday / w.goal) * 100)}%`,
                        } as any
                      }
                    >
                      <div>
                        <strong>
                          {w.stats.reviewedToday}
                          <small>/{w.goal}</small>
                        </strong>
                        <span>reviews today</span>
                      </div>
                    </div>
                    <p>
                      {w.stats.reviewedToday >= w.goal
                        ? "A promise to yourself, kept."
                        : "Small steps add up."}
                    </p>
                    <small>Every rating counts. Days use UTC.</small>
                  </section>
                </div>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">PICK UP A THREAD</span>
                    <h2>
                      Your collections
                      <span className="count">{w.decks.length}</span>
                    </h2>
                  </div>
                  <button className="text-button" onClick={() => go("library")}>
                    View all
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="collection-grid">
                  {w.decks.slice(0, 4).map(collectionCard)}
                </div>
                <div className="bottom-note">
                  <Sparkles size={18} />
                  <p>A note becomes a card. A card becomes a connection.</p>
                  <button
                    className="text-button"
                    onClick={() => setModal({ kind: "deck" })}
                  >
                    Make something new
                    <Plus size={16} />
                  </button>
                </div>
              </>
            )}
            {view === "library" && !deck && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">YOUR PERSONAL SHELF</span>
                    <h1>
                      Curiosity,
                      <br />
                      <em>collected.</em>
                    </h1>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setModal({ kind: "deck" })}
                  >
                    <Plus size={18} />
                    New collection
                  </button>
                </div>
                <div className="library-toolbar">
                  <label className="search">
                    <Search size={18} />
                    <input
                      aria-label="Search library"
                      placeholder="Search collections, cards and notes…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>
                    {collections.length} collections · {w.cards.length} cards
                  </span>
                </div>
                <div className="collection-grid">
                  {collections.map(collectionCard)}
                  {!query && (
                    <button
                      className="new-collection"
                      onClick={() => setModal({ kind: "deck" })}
                    >
                      <span>
                        <Plus size={28} />
                      </span>
                      <h3>A space for your next idea.</h3>
                      <p>Create a collection</p>
                    </button>
                  )}
                </div>
                {!collections.length && query && (
                  <div className="empty">
                    <Search />
                    <h2>No matching threads.</h2>
                    <p>Try a subject, a question or a word from your notes.</p>
                  </div>
                )}
              </>
            )}
            {view === "library" && deck && (
              <>
                <button
                  className="text-button back-link"
                  onClick={() => {
                    setDeckId(null);
                    setQuery("");
                  }}
                >
                  <ArrowLeft size={16} />
                  All collections
                </button>
                <section className={`deck-heading ${deck.color}`}>
                  <div>
                    <span className="eyebrow">{deck.subject}</span>
                    <h1>{deck.title}</h1>
                    <p>{deck.description}</p>
                    <div className="deck-facts">
                      <span>
                        <Layers size={15} />
                        {count(deck.id)} cards
                      </span>
                      <span>
                        {
                          w.notes.filter((n: Note) => n.deckId === deck.id)
                            .length
                        }{" "}
                        notes
                      </span>
                      <span>{due(deck.id)} due now</span>
                    </div>
                  </div>
                  <div className="deck-heading-actions">
                    <button
                      className="icon"
                      aria-label="Edit collection"
                      onClick={() => setModal({ kind: "deck", item: deck })}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      className="dark-button"
                      disabled={busy || !due(deck.id)}
                      onClick={() => begin(deck.id)}
                    >
                      Review collection
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </section>
                <div className="detail-toolbar">
                  <div className="tabs">
                    <button
                      className={tab === "cards" ? "selected" : ""}
                      onClick={() => {
                        setTab("cards");
                        setQuery("");
                      }}
                    >
                      Flashcards <span>{count(deck.id)}</span>
                    </button>
                    <button
                      className={tab === "notes" ? "selected" : ""}
                      onClick={() => {
                        setTab("notes");
                        setQuery("");
                      }}
                    >
                      Notes{" "}
                      <span>
                        {
                          w.notes.filter((n: Note) => n.deckId === deck.id)
                            .length
                        }
                      </span>
                    </button>
                  </div>
                  <button
                    className="primary small"
                    onClick={() =>
                      setModal({ kind: tab === "cards" ? "card" : "note" })
                    }
                  >
                    <Plus size={16} />
                    {tab === "cards" ? "Add card" : "Add note"}
                  </button>
                </div>
                <label className="search detail-search">
                  <Search size={17} />
                  <input
                    aria-label="Search collection"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      tab === "cards"
                        ? "Find a question, answer or tag…"
                        : "Find something in your notes…"
                    }
                  />
                </label>
                {tab === "cards" ? (
                  <div className="card-list">
                    {w.cards
                      .filter(
                        (c: Card) =>
                          c.deckId === deck.id &&
                          [c.front, c.back, ...c.tags]
                            .join(" ")
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((c: Card, i: number) => (
                        <article key={c.id} className="library-card">
                          <span className="card-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="library-card-content">
                            <div className="card-topline">
                              <span
                                className={
                                  "status " +
                                  (c.dueAt <= w.now ? "due" : "scheduled")
                                }
                              >
                                {c.dueAt <= w.now
                                  ? "Ready to review"
                                  : `Next: ${date(c.dueAt)}`}
                              </span>
                              <span className="state-label">{c.state}</span>
                            </div>
                            <h3>{c.front}</h3>
                            <details>
                              <summary>
                                Read answer
                                <ChevronRight size={14} />
                              </summary>
                              <p>{c.back}</p>
                            </details>
                            <div className="tags">
                              {c.tags.map((t) => (
                                <span key={t}>#{t}</span>
                              ))}
                            </div>
                          </div>
                          <div className="item-actions">
                            <button
                              className="icon"
                              aria-label={"Edit card " + (i + 1)}
                              onClick={() =>
                                setModal({ kind: "card", item: c })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon"
                              aria-label={"Delete card " + (i + 1)}
                              onClick={() =>
                                setModal({
                                  kind: "delete",
                                  type: "card",
                                  item: c,
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    {!count(deck.id) && (
                      <div className="empty">
                        <Layers />
                        <h2>The first connection starts here.</h2>
                        <p>
                          Add a question and an answer, then come back to
                          practice.
                        </p>
                        <button
                          className="primary"
                          onClick={() => setModal({ kind: "card" })}
                        >
                          Add your first card
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                    {count(deck.id) > 0 &&
                      !w.cards.some(
                        (c: Card) =>
                          c.deckId === deck.id &&
                          [c.front, c.back, ...c.tags]
                            .join(" ")
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      ) && <div className="empty">No matching cards.</div>}
                  </div>
                ) : (
                  <div className="note-grid">
                    {w.notes
                      .filter(
                        (n: Note) =>
                          n.deckId === deck.id &&
                          [n.title, n.body]
                            .join(" ")
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((n: Note) => (
                        <article className="note-paper" key={n.id}>
                          <div className="note-meta">
                            <span>FIELD NOTE · {date(n.updatedAt)}</span>
                            <div className="item-actions">
                              <button
                                className="icon"
                                aria-label={"Edit note " + n.title}
                                onClick={() =>
                                  setModal({ kind: "note", item: n })
                                }
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon"
                                aria-label={"Delete note " + n.title}
                                onClick={() =>
                                  setModal({
                                    kind: "delete",
                                    type: "note",
                                    item: n,
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <h2>{n.title}</h2>
                          <p>{n.body}</p>
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({
                                kind: "card",
                                front: n.title,
                                back: n.body.slice(0, 3000),
                              })
                            }
                          >
                            Turn an idea into a card
                            <ArrowUpRight size={16} />
                          </button>
                        </article>
                      ))}
                    {!w.notes.filter(
                      (n: Note) =>
                        n.deckId === deck.id &&
                        [n.title, n.body]
                          .join(" ")
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    ).length && (
                      <div className="empty">
                        <BookOpen />
                        <h2>A blank page is a beginning.</h2>
                        <p>Add a note to collect your thoughts.</p>
                      </div>
                    )}
                  </div>
                )}
                <button
                  className="delete-collection text-button"
                  onClick={() =>
                    setModal({ kind: "delete", type: "deck", item: deck })
                  }
                >
                  <Trash2 size={14} />
                  Delete collection
                </button>
              </>
            )}
            {view === "insights" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">THE BIGGER PICTURE</span>
                    <h1>
                      Look how far
                      <br />
                      <em>you’ve come.</em>
                    </h1>
                  </div>
                  <span className="heading-note">
                    Progress has
                    <br />
                    many shapes.<span>✳</span>
                  </span>
                </div>
                <div className="insight-numbers">
                  <div>
                    <span className="eyebrow">REVIEW EVENTS</span>
                    <strong>{w.stats.totalReviewed}</strong>
                    <p>Every time you showed up.</p>
                  </div>
                  <div>
                    <span className="eyebrow">CARDS IN REVIEW</span>
                    <strong>
                      {w.stats.learned}
                      <small>/{w.cards.length}</small>
                    </strong>
                    <p>Scheduled for another day.</p>
                  </div>
                  <div>
                    <span className="eyebrow">READY FOR YOU</span>
                    <strong>{w.stats.due}</strong>
                    <p>A chance to reconnect.</p>
                  </div>
                </div>
                <section className="activity-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">LAST 28 DAYS · UTC</span>
                      <h2>A habit, taking shape.</h2>
                    </div>
                    <span className="legend">
                      <i />
                      No reviews
                      <i className="level-1" />
                      1–4
                      <i className="level-2" />
                      5–9
                      <i className="level-3" />
                      10+
                    </span>
                  </div>
                  <div className="activity-grid">
                    {w.stats.calendar.map((d: any) => (
                      <div
                        key={d.day}
                        className={
                          "activity-day level-" +
                          (d.count === 0
                            ? 0
                            : d.count < 5
                              ? 1
                              : d.count < 10
                                ? 2
                                : 3)
                        }
                        title={`${d.day}: ${d.count} reviews`}
                      >
                        <span>
                          {new Date(d.day + "T12:00:00Z").toLocaleDateString(
                            "en-GB",
                            { weekday: "short", timeZone: "UTC" },
                          )}
                        </span>
                        <strong>{Number(d.day.slice(-2))}</strong>
                        <small>{d.count || "—"}</small>
                      </div>
                    ))}
                  </div>
                  <p className="muted">
                    This chart starts with your own practice. Sample collections
                    do not add fictional review history.
                  </p>
                </section>
                <div className="insight-grid">
                  <section className="paper-panel">
                    <span className="eyebrow">HOW PRACTICE FELT</span>
                    <h2>Recall, in your words.</h2>
                    {w.stats.grades.map((g: any) => (
                      <div key={g.grade} className="grade-bar">
                        <span>{g.grade}</span>
                        <div>
                          <i
                            className={g.grade}
                            style={{
                              width: `${w.stats.totalReviewed ? (g.count / w.stats.totalReviewed) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <strong>{g.count}</strong>
                      </div>
                    ))}
                    <p className="muted">
                      Ratings describe your self-assessment, not a measured
                      retention score.
                    </p>
                  </section>
                  <section className="paper-panel forecast">
                    <span className="eyebrow">LOOKING AHEAD</span>
                    <h2>Room for tomorrow.</h2>
                    {w.stats.forecast.map((d: any, i: number) => (
                      <div key={d.day}>
                        <span>
                          {i === 0
                            ? "Today & overdue"
                            : date(Date.parse(d.day + "T12:00:00Z"))}
                        </span>
                        <strong>
                          {d.count} <small>cards</small>
                        </strong>
                      </div>
                    ))}
                    <p className="muted">
                      Current schedule, next 7 UTC dates. Ratings can change
                      these dates.
                    </p>
                  </section>
                </div>
              </>
            )}
            <footer className="workspace-footer">
              <Logo />
              <span>Small steps. Lasting connections.</span>
              <span>Demo data stays in your own workspace.</span>
            </footer>
          </>
        )}
      </main>
      {modal && (
        <Dialog
          title={
            modal.kind === "deck"
              ? modal.item
                ? "Edit collection"
                : "A new collection"
              : modal.kind === "card"
                ? modal.item
                  ? "Edit flashcard"
                  : "Make a connection"
                : modal.kind === "note"
                  ? modal.item
                    ? "Edit note"
                    : "A fresh page"
                  : modal.kind === "goal"
                    ? "Your daily intention"
                    : modal.kind === "delete"
                      ? "Let this one go?"
                      : "Your workspace"
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          {["deck", "card", "note", "goal"].includes(modal.kind) && (
            <form onSubmit={save}>
              {modal.kind === "deck" && (
                <>
                  <label>
                    Collection title
                    <input
                      name="title"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={modal.item?.title}
                      placeholder="e.g. The logic behind the code"
                    />
                  </label>
                  <label>
                    Subject
                    <input
                      name="subject"
                      required
                      maxLength={50}
                      defaultValue={modal.item?.subject}
                      placeholder="Computer science"
                    />
                  </label>
                  <label>
                    A little description
                    <textarea
                      name="description"
                      maxLength={300}
                      rows={2}
                      defaultValue={modal.item?.description}
                    />
                  </label>
                  <fieldset>
                    <legend>Cover colour</legend>
                    <div className="color-options">
                      {["coral", "sage", "lavender", "butter", "blue"].map(
                        (c, i) => (
                          <label key={c} className={c}>
                            <input
                              type="radio"
                              name="color"
                              value={c}
                              defaultChecked={
                                modal.item ? modal.item.color === c : i === 0
                              }
                            />
                            <span>{c}</span>
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>
                </>
              )}
              {modal.kind === "card" && (
                <>
                  <p className="form-hint">
                    One clear question. One useful answer. Your future self will
                    thank you.
                  </p>
                  <label>
                    Question
                    <textarea
                      name="front"
                      required
                      rows={3}
                      maxLength={1200}
                      defaultValue={modal.item?.front || modal.front}
                    />
                  </label>
                  <label>
                    Answer
                    <textarea
                      name="back"
                      required
                      rows={5}
                      maxLength={3000}
                      defaultValue={modal.item?.back || modal.back}
                    />
                  </label>
                  <label>
                    Tags <small>(up to 6, separated by commas)</small>
                    <input
                      name="tags"
                      defaultValue={modal.item?.tags.join(", ")}
                      placeholder="networks, fundamentals"
                      maxLength={180}
                    />
                  </label>
                  {modal.item && (
                    <p className="form-hint">
                      Editing keeps the existing review schedule. Active reviews
                      detect the changed card.
                    </p>
                  )}
                </>
              )}
              {modal.kind === "note" && (
                <>
                  <label>
                    Note title
                    <input
                      name="title"
                      required
                      maxLength={100}
                      defaultValue={modal.item?.title}
                    />
                  </label>
                  <label>
                    Your thoughts
                    <textarea
                      name="body"
                      rows={12}
                      required
                      maxLength={16000}
                      defaultValue={modal.item?.body}
                      placeholder="Write an explanation, connect ideas, leave a question…"
                    />
                  </label>
                  <p className="form-hint">
                    Plain text, with your line breaks preserved. No formatting
                    syntax needed.
                  </p>
                </>
              )}
              {modal.kind === "goal" && (
                <>
                  <p className="form-hint">
                    Choose a pace that feels sustainable. Each card rating
                    counts as one review.
                  </p>
                  <label>
                    Reviews per day
                    <input
                      type="number"
                      name="goal"
                      min={5}
                      max={100}
                      required
                      defaultValue={w.goal}
                    />
                  </label>
                </>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : modal.item
                      ? "Save changes"
                      : modal.kind === "card"
                        ? "Create card"
                        : modal.kind === "deck"
                          ? "Create collection"
                          : modal.kind === "goal"
                            ? "Set intention"
                            : "Save note"}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {modal.kind === "delete" && (
            <>
              <p>
                This removes{" "}
                {modal.type === "deck"
                  ? "this collection and all its cards and notes"
                  : "this " + modal.type}{" "}
                from your workspace. Existing review events remain in your
                progress history.
              </p>
              <div className="form-actions">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep it
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request(
                        "/" + modal.type + "s/" + modal.item.id,
                        "DELETE",
                      );
                      if (modal.type === "deck") setDeckId(null);
                      await load();
                      setModal(null);
                      setNotice("Removed from your library.");
                    })
                  }
                >
                  Delete {modal.type}
                  <Trash2 size={16} />
                </button>
              </div>
            </>
          )}
          {modal.kind === "workspace" && (
            <>
              <p className="form-hint">
                This is your own disposable demo. It expires after 24 hours
                without activity and resets when the server restarts. Export
                your library to keep a copy.
              </p>
              <div className="settings-actions">
                <a href="/api/export" className="setting-row">
                  <Download size={20} />
                  <span>
                    <strong>Export library</strong>
                    <small>
                      Notes and cards as JSON. Review history is excluded.
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </a>
                <button
                  className="setting-row"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  <Upload size={20} />
                  <span>
                    <strong>Import library</strong>
                    <small>
                      Add collections from a StudyLens JSON export. Schedules
                      start fresh.
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="setting-row"
                  onClick={() => setModal({ kind: "goal" })}
                >
                  <Sun size={20} />
                  <span>
                    <strong>Daily intention</strong>
                    <small>Currently {w.goal} reviews per UTC day.</small>
                  </span>
                  <Pencil size={17} />
                </button>
                <button
                  className="setting-row"
                  onClick={() => setModal({ kind: "reset" })}
                >
                  <RotateCcw size={20} />
                  <span>
                    <strong>Close this demo workspace</strong>
                    <small>
                      Delete this workspace and return to the start.
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <p className="form-hint">
                Practice uses a transparent, simplified scheduling model. It
                helps plan repetition; it does not predict memory retention.
              </p>
            </>
          )}
          {modal.kind === "reset" && (
            <>
              <p>
                Your cards, notes and review history in this demo will be
                deleted. Export your library first if you want to keep it.
              </p>
              <div className="form-actions">
                <button
                  className="text-button"
                  onClick={() => setModal({ kind: "workspace" })}
                >
                  Go back
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request("/logout", "POST", {});
                      setW(null);
                      setCsrf("");
                      setModal(null);
                      setReview(false);
                      go("today");
                    })
                  }
                >
                  Close workspace
                </button>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      <input
        type="file"
        accept="application/json,.json"
        hidden
        ref={file}
        aria-label="Import library file"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
    </div>
  );
}
