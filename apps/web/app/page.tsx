"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Plus,
  Settings,
  Layers,
  Sparkles,
  RefreshCw,
  Search,
  Check,
  ArrowLeft,
  LogOut,
  Download,
  Trash2,
  Sun,
  Moon,
  Clipboard,
  WifiOff,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { api, useLibrary, type Library } from "@/lib/client";
import {
  dueCards,
  eligible,
  rateSchedule,
  type Card,
  type Backside,
  type Preset,
  type Wordlist,
  type Attempt,
} from "@/lib/domain";
import { languages, languageName } from "@/lib/languages";

type Config = { email: boolean; apple: boolean; preview: boolean; generation: boolean };
type Modal =
  | { kind: "add" }
  | { kind: "list"; list?: Wordlist }
  | { kind: "word"; cardId: string }
  | null;
const date = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const countLabel = (n: number, noun: string) => n + " " + noun + (n === 1 ? "" : "s");
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: readonly (readonly [string, string])[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      items={options.map(([value, label]) => ({ value, label }))}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Answer({ page, source }: { page: Backside; source: string | null }) {
  return (
    <div className="meanings" lang={page.language} dir="auto">
      {page.meanings.map((m, i) => (
        <section className="meaning" key={m.meaningId}>
          <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p>{m.explanation}</p>
            {m.example && (
              <blockquote>
                {m.example.original && (
                  <p lang={source ?? undefined} dir="auto">
                    {m.example.original}
                  </p>
                )}
                {m.example.translated && (
                  <p lang={page.language} dir="auto">
                    {m.example.translated}
                  </p>
                )}
              </blockquote>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
function ListEditor({
  list,
  onSave,
}: {
  list?: Wordlist;
  onSave: (name: string, preset: Preset) => Promise<void>;
}) {
  const [name, setName] = useState(list?.name ?? ""),
    [pages, setPages] = useState<Preset["pages"]>(list?.preset.pages ?? []),
    [language, setLanguage] = useState(""),
    [policy, setPolicy] = useState<Preset["examplePolicy"]>(list?.preset.examplePolicy ?? "both"),
    [visibility, setVisibility] = useState<Preset["optionalVisibility"]>(
      list?.preset.optionalVisibility ?? "after",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(name, { pages, examplePolicy: policy, optionalVisibility: visibility });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="form-stack">
      <label>
        Wordlist name
        <Input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Words from my reading"
          required
        />
      </label>
      <div>
        <h3 className="small-heading">Your answer languages</h3>
        <p className="muted small">
          Choose at least one Essential language. Each review tests one Essential page.
        </p>
      </div>
      {pages.map((p, i) => (
        <div className="preset-page" key={p.language}>
          <div className="row-between">
            <strong>{languageName(p.language)}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={"Remove " + languageName(p.language)}
              onClick={() => setPages(pages.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <label className="switch-row">
            <span>
              Essential <small>The answer you practice</small>
            </span>
            <Switch
              checked={p.role === "essential"}
              onCheckedChange={(checked) =>
                setPages(
                  pages.map((x, j) =>
                    i === j ? { ...x, role: checked ? "essential" : "optional" } : x,
                  ),
                )
              }
              aria-label={"Essential " + languageName(p.language)}
            />
          </label>
          <div className="switch-row">
            <span>
              Explanation <small>One for each common meaning</small>
            </span>
            <span className="small muted">Always on</span>
          </div>
          <label className="switch-row">
            <span>
              Examples <small>One matching sentence per meaning</small>
            </span>
            <Switch
              checked={p.examples}
              onCheckedChange={(checked) =>
                setPages(pages.map((x, j) => (i === j ? { ...x, examples: checked } : x)))
              }
              aria-label={"Examples " + languageName(p.language)}
            />
          </label>
        </div>
      ))}
      {pages.length < 6 && (
        <div className="inline-fields">
          <Choice
            value={language}
            onChange={setLanguage}
            options={languages.filter((l) => !pages.some((p) => p.language === l[0]))}
            label="Choose a language"
          />
          <button
            type="button"
            className="secondary"
            disabled={!language}
            onClick={() => {
              setPages([
                ...pages,
                {
                  language,
                  role: pages.length ? "optional" : "essential",
                  explanation: true,
                  examples: true,
                },
              ]);
              setLanguage("");
            }}
          >
            <Plus size={16} /> Add language
          </button>
        </div>
      )}
      <label>
        Example sentences
        <Choice
          value={policy}
          onChange={(v) => setPolicy(v as typeof policy)}
          options={[
            ["both", "Original + translated"],
            ["original", "Original only"],
            ["translated", "Answer language only"],
          ]}
          label="Example presentation"
        />
      </label>
      <label>
        Optional pages during review
        <Choice
          value={visibility}
          onChange={(v) => setVisibility(v as typeof visibility)}
          options={[
            ["after", "Available after reveal"],
            ["hidden", "Hidden in reviews"],
          ]}
          label="Optional page visibility"
        />
      </label>
      {list && (
        <p className="small muted">
          Changes apply to new words. To apply this preset to an existing word, regenerate its
          pages. Its review schedule is preserved.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !pages.length}>
        {busy ? "Saving…" : list ? "Save preset" : "Create wordlist"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function CaptureForm({
  state,
  onSave,
}: {
  state: Library;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [expression, setExpression] = useState(""),
    [context, setContext] = useState(""),
    [listId, setListId] = useState(state.preferences.defaultListId ?? state.lists[0]?.id ?? ""),
    [hint, setHint] = useState("auto"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const list = state.lists.find((l) => l.id === listId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        expression,
        context,
        listId,
        sourceHint: hint === "auto" ? null : hint,
        sourceUrl: "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Word or short expression
        <div className="inline-fields">
          <Input
            autoFocus
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="A word worth remembering"
            required
          />
          <button
            className="secondary"
            type="button"
            aria-label="Paste from clipboard"
            onClick={async () => {
              try {
                setExpression(await navigator.clipboard.readText());
              } catch {
                setError("Clipboard access is unavailable. Paste into the word field.");
              }
            }}
          >
            <Clipboard size={17} />
          </button>
        </div>
      </label>
      <label>
        Save to
        <Choice
          value={listId}
          onChange={setListId}
          options={state.lists.map((l) => [l.id, l.name])}
          label="Destination wordlist"
        />
      </label>
      <label>
        Source language
        <Choice
          value={hint}
          onChange={setHint}
          options={[["auto", "Detect automatically"], ...languages]}
          label="Source language"
        />
      </label>
      <label>
        Context <span className="muted">(optional)</span>
        <Textarea
          value={context}
          maxLength={1500}
          onChange={(e) => setContext(e.target.value)}
          placeholder="The sentence where you found it"
          rows={3}
        />
      </label>
      <div className="capture-cost">
        <Sparkles size={16} />
        <span>
          {list ? countLabel(list.preset.pages.length, "generation") : "Choose a wordlist"} ·{" "}
          {state.available} remaining
        </span>
      </div>
      {state.mode === "preview" && (
        <p className="small muted">
          Sample vocabulary: bank, serendipity, apprendre, 光, كتاب, Gift. Sample answer languages:
          English, German, French. Other words stay saved for live AI setup.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !listId}>
        {busy ? "Saving…" : "Add to my library"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function SignIn({
  config,
  onSignedIn,
}: {
  config: Config | null;
  onSignedIn: () => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(fn: () => Promise<unknown>) {
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
  return (
    <div className="signin-stage">
      <div className="signin-intro">
        <p className="eyebrow">A PLACE FOR THE WORDS YOU FIND</p>
        <h1>
          Your vocabulary.
          <br />
          <em>Remembered.</em>
        </h1>
        <p>Capture a word. Explore its meanings in your languages. Make it part of your world.</p>
        <div className="signin-rule" />
        <span className="muted small">
          One word. Separate language pages.
          <br />A single rhythm of review.
        </span>
      </div>
      <section className="signin-panel">
        <p className="eyebrow">YOUR LIBRARY AWAITS</p>
        <h2>Welcome to Vocabularium.</h2>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              if (challenge) {
                await api("auth/email/verify", { challengeId: challenge, code });
                await onSignedIn();
              } else {
                const r = await api<{ challengeId: string }>("auth/email/request", { email });
                setChallenge(r.challengeId);
              }
            });
          }}
        >
          <label>
            Email address
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!challenge || !config?.email}
              placeholder="you@example.com"
            />
          </label>
          {challenge && (
            <label>
              Six-digit verification code
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <button className="primary" disabled={busy || !config?.email}>
            {challenge ? "Open my library" : "Email me a code"}
            <ArrowRight size={16} />
          </button>
          {challenge && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setChallenge("");
                setCode("");
              }}
            >
              Use a different email
            </button>
          )}
        </form>
        <button
          className="secondary full"
          disabled={busy || !config?.apple}
          onClick={() =>
            void action(async () => {
              const r = await api<{ url: string }>("auth/apple/start", {});
              location.href = r.url;
            })
          }
        >
          Continue with Apple
        </button>
        {config?.preview && (
          <div className="preview-access">
            <p className="small muted">
              Email, Apple sign-in, and live AI are awaiting service setup. Explore a private
              workspace with sample generation.
            </p>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api("auth/preview", {});
                  await onSignedIn();
                })
              }
            >
              Open private preview <ArrowRight size={16} />
            </button>
          </div>
        )}
        {config && !config.email && !config.apple && !config.preview && (
          <p className="small muted">
            Live sign-in is not configured yet.{" "}
            <a className="text-button" href="/signin-with-chatgpt?return_to=/" target="_top">
              Sign in to the private preview
            </a>
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
export default function Home() {
  const lib = useLibrary(),
    { state } = lib;
  const [view, setView] = useState<"review" | "library" | "settings">("review"),
    [config, setConfig] = useState<Config | null>(null),
    [modal, setModal] = useState<Modal>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dark, setDark] = useState(false);
  const [queue, setQueue] = useState<string[]>([]),
    [sessionSize, setSessionSize] = useState(0),
    [activeLanguage, setActiveLanguage] = useState(""),
    [revealed, setRevealed] = useState(false),
    [confirm, setConfirm] = useState<{
      title: string;
      description: string;
      action: () => Promise<void>;
    } | null>(null),
    [interest, setInterest] = useState(""),
    [deviceToken, setDeviceToken] = useState("");
  const due = state ? dueCards({ ...state, receipts: {} }) : [];
  const attempt = state?.attempts.find((a) => a.id === queue[0]),
    card = state?.cards.find((c) => c.id === attempt?.cardId && !c.deletedAt);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    void api<Config>("auth/config")
      .then(setConfig)
      .catch(() => {});
    const d =
      localStorage.getItem("vocab-theme") === "dark" ||
      (!localStorage.getItem("vocab-theme") && matchMedia("(prefers-color-scheme:dark)").matches);
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
  }, []);
  useEffect(() => {
    if (attempt) {
      setActiveLanguage(attempt.language);
      setRevealed(Boolean(attempt.revealedAt));
    }
  }, [attempt?.id]);
  useEffect(() => {
    if (!state) return;
    const saved = sessionStorage.getItem("vocab-review-" + state.owner);
    if (!queue.length && saved) {
      try {
        const ids = JSON.parse(saved) as string[];
        const open = ids.filter((id) => state.attempts.some((a) => a.id === id && !a.completedAt));
        if (open.length) {
          setQueue(open);
          setSessionSize(ids.length);
        }
      } catch {}
    }
  }, [state?.owner]);
  useEffect(() => {
    if (state) sessionStorage.setItem("vocab-review-" + state.owner, JSON.stringify(queue));
  }, [queue, state?.owner]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!state) return;
    await act(async () => {
      const result = (await lib.submit("prepareReview", { cardIds: due.map((c) => c.id) })) as {
        attemptIds: string[];
      };
      setQueue(result.attemptIds);
      setSessionSize(result.attemptIds.length);
      setView("review");
    });
  }
  async function reveal() {
    if (!attempt) return;
    await act(async () => {
      await lib.submit("reveal", { attemptId: attempt.id });
      setRevealed(true);
    });
  }
  async function rate(rating: number) {
    if (!attempt || !revealed) return;
    await act(async () => {
      await lib.submit("rate", {
        attemptId: attempt.id,
        rating,
        occurredAt: new Date().toISOString(),
      });
      setQueue((q) => q.slice(1));
      setRevealed(false);
    });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        modal ||
        confirm ||
        busy ||
        view !== "review" ||
        target.closest('input,textarea,button,[role="combobox"],[role="tab"]')
      )
        return;
      if (e.code === "Space" && attempt && !revealed) {
        e.preventDefault();
        void reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [attempt, revealed, busy, modal, confirm, view]);
  async function sample() {
    await act(async () => {
      const r = (await lib.submit("createList", {
        name: "The sample collection",
        preset: {
          pages: [
            { language: "en", role: "essential", explanation: true, examples: false },
            { language: "de", role: "essential", explanation: true, examples: true },
          ],
          examplePolicy: "both",
          optionalVisibility: "after",
        },
      })) as { listId: string };
      for (const expression of ["serendipity", "bank", "apprendre"])
        await lib.submit("capture", {
          expression,
          listId: r.listId,
          context: "",
          sourceUrl: "",
          sourceHint: null,
        });
      setView("library");
      setNotice("Sample words saved. Their English and German pages are being prepared.");
    });
  }
  function switchTheme() {
    const d = !dark;
    setDark(d);
    localStorage.setItem("vocab-theme", d ? "dark" : "light");
    document.documentElement.classList.toggle("dark", d);
  }
  const nav = [
    ["review", "Review", Layers],
    ["library", "Wordlists", BookOpen],
    ["settings", "Settings", Settings],
  ] as const;
  const visibleCards =
    state?.cards.filter(
      (c) =>
        !c.deletedAt &&
        (filter === "all" || c.listId === filter) &&
        c.expression.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) ?? [];
  const detail =
    modal?.kind === "word"
      ? state?.cards.find((c) => c.id === modal.cardId && !c.deletedAt)
      : undefined;
  const pageOptions =
    attempt && card
      ? attempt.preset.pages.filter(
          (p) =>
            (p.role === "essential" || attempt.preset.optionalVisibility === "after") &&
            (p.language === attempt.language ||
              card.pages[p.language]?.inventoryId === attempt.inventoryId),
        )
      : [];
  return (
    <SidebarProvider className="shell">
      <Sidebar collapsible="none" className="navigation">
        <a className="brand" href="/">
          V<span>VOCABULARIUM</span>
        </a>
        <p className="eyebrow">YOUR LIBRARY</p>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {id === "review" && !!due.length && <span>{due.length}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-foot">
          <span className="status-dot" />
          {state?.mode === "preview"
            ? "Private preview"
            : state
              ? "Your learning space"
              : "Welcome"}
        </div>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <span>
            Library{" "}
            <span className="muted">
              / {view === "review" ? "Daily review" : view === "library" ? "Wordlists" : "Settings"}
            </span>
          </span>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={switchTheme}
              aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {state && (
              <button
                className="primary"
                onClick={() => setModal(state.lists.length ? { kind: "add" } : { kind: "list" })}
              >
                <Plus size={17} /> Add a word
              </button>
            )}
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {lib.error && (
          <div className="connection-banner" role="status">
            {!lib.online && <WifiOff size={16} />}
            <span>{lib.error}</span>
            <button className="text-button" onClick={() => void lib.sync()}>
              Try again
            </button>
          </div>
        )}
        {!!lib.pending.length && (
          <div className="connection-banner" role="status">
            {countLabel(lib.pending.length, "change")} saved on this device
            {lib.pending.some((p) => p.error) ? " · needs attention" : " · waiting to sync"}
          </div>
        )}
        {lib.loading && !state ? (
          <div className="empty-state">
            <p className="eyebrow">VOCABULARIUM</p>
            <h1>Opening your library…</h1>
          </div>
        ) : !state ? (
          <SignIn config={config} onSignedIn={lib.sync} />
        ) : (
          <>
            {view === "review" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">A LITTLE, EVERY DAY</p>
                    <h1>Your daily practice.</h1>
                  </div>
                  <span className="muted">
                    {new Date().toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="study-layout">
                  <div>
                    {attempt && card ? (
                      <>
                        <div className="study-meta">
                          <span>{state.lists.find((l) => l.id === card.listId)?.name}</span>
                          <span>
                            {String(sessionSize - queue.length + 1).padStart(2, "0")} /{" "}
                            {String(sessionSize).padStart(2, "0")}
                          </span>
                        </div>
                        <article className={"study-card " + (revealed ? "is-revealed" : "")}>
                          <div className="card-top">
                            <span className="eyebrow">
                              {languageName(card.sourceLanguage).toUpperCase()}{" "}
                              {card.inferred ? "· INFERRED" : ""}
                            </span>
                            <span className="target">
                              Answer in {languageName(attempt.language)}
                            </span>
                          </div>
                          <div className="word-front">
                            <span className="entry-label">
                              {countLabel(card.meanings.length, "common meaning").toUpperCase()}
                            </span>
                            <h2 dir="auto" lang={card.sourceLanguage ?? undefined}>
                              {card.expression}
                            </h2>
                            {!revealed && <p className="muted">Recall the meanings as a whole.</p>}
                            {card.context && (
                              <p className="context" dir="auto">
                                {card.context}
                              </p>
                            )}
                          </div>
                          {revealed && (
                            <Tabs
                              value={activeLanguage}
                              onValueChange={(v) => setActiveLanguage(String(v))}
                            >
                              <TabsList variant="line" className="language-index">
                                {pageOptions.map((p) => (
                                  <TabsTrigger key={p.language} value={p.language}>
                                    {languageName(p.language)}{" "}
                                    <span>
                                      {p.language === attempt.language
                                        ? "Your answer"
                                        : p.role === "essential"
                                          ? "Essential"
                                          : "Optional"}
                                    </span>
                                  </TabsTrigger>
                                ))}
                              </TabsList>
                              {pageOptions.map((p) => (
                                <TabsContent key={p.language} value={p.language}>
                                  <Answer
                                    page={
                                      p.language === attempt.language
                                        ? attempt.page
                                        : card.pages[p.language]
                                    }
                                    source={card.sourceLanguage}
                                  />
                                </TabsContent>
                              ))}
                            </Tabs>
                          )}
                          <div className="card-bottom">
                            {!revealed ? (
                              <>
                                <span className="muted">
                                  Take your time. Let the word come to you.
                                </span>
                                <button
                                  className="primary"
                                  onClick={() => void reveal()}
                                  disabled={busy}
                                >
                                  Reveal answer <ArrowRight size={17} />
                                </button>
                              </>
                            ) : (
                              <div className="rating-section">
                                <p>
                                  How well did you recall the meanings in{" "}
                                  {languageName(attempt.language)}?
                                </p>
                                <div className="ratings">
                                  {(["Again", "Hard", "Good", "Easy"] as const).map((label, i) => (
                                    <button
                                      key={label}
                                      className={"rating rating-" + i}
                                      disabled={busy}
                                      onClick={() => void rate(i + 1)}
                                    >
                                      <span>{label}</span>
                                      <small>{scheduleLabel(card, i + 1)}</small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                        <p className="study-hint">
                          Space to reveal · 1–4 to rate · One schedule for this word
                        </p>
                      </>
                    ) : (
                      <article className="study-card ready-stage">
                        <div className="card-top">
                          <span className="eyebrow">
                            {sessionSize ? "SESSION COMPLETE" : "YOUR NEXT CHAPTER"}
                          </span>
                          <BookOpen size={20} />
                        </div>
                        <div className="ready-content">
                          <span className="entry-label">
                            {state.lists.length
                              ? "MAKE A LITTLE ROOM FOR LEARNING"
                              : "START YOUR COLLECTION"}
                          </span>
                          <h2>
                            {!state.lists.length
                              ? "A world of words awaits."
                              : due.length
                                ? countLabel(due.length, "word") + " to remember."
                                : "A little more, remembered."}
                          </h2>
                          <p className="muted">
                            {!state.lists.length
                              ? "Choose the languages you want your words explained in."
                              : due.length
                                ? "Recall, reveal, reflect. A few minutes is a good beginning."
                                : state.cards.some((c) => c.status === "queued")
                                  ? "Your saved words are being prepared."
                                  : "You’re up to date. Come back when your next words are due."}
                          </p>
                          {!state.lists.length ? (
                            <div className="form-stack">
                              <button
                                className="primary"
                                onClick={() => setModal({ kind: "list" })}
                              >
                                Create my first wordlist <ArrowRight size={17} />
                              </button>
                              {state.mode === "preview" && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => void sample()}
                                >
                                  Explore samples in English + German
                                </button>
                              )}
                            </div>
                          ) : due.length ? (
                            <button
                              className="primary"
                              onClick={() => void start()}
                              disabled={busy}
                            >
                              Begin review <ArrowRight size={17} />
                            </button>
                          ) : (
                            <button className="secondary" onClick={() => setModal({ kind: "add" })}>
                              <Plus size={16} /> Find your next word
                            </button>
                          )}
                        </div>
                      </article>
                    )}
                  </div>
                  <aside className="session-panel">
                    <p className="eyebrow">TODAY’S SESSION</p>
                    <strong>
                      {String(due.length).padStart(2, "0")}
                      <span>words due for review</span>
                    </strong>
                    <hr />
                    <div className="stat-row">
                      <span>Reviewed today</span>
                      <b>
                        {
                          state.reviews.filter(
                            (r) =>
                              r.applied &&
                              new Date(r.receivedAt).toDateString() === new Date().toDateString(),
                          ).length
                        }
                      </b>
                    </div>
                    <div className="stat-row">
                      <span>In your library</span>
                      <b>{state.cards.filter((c) => !c.deletedAt).length}</b>
                    </div>
                    <hr />
                    <p className="muted">
                      Recall every common meaning on your selected answer page, then give one
                      rating.
                    </p>
                    <div className="session-note">
                      Your library takes shape,
                      <br />
                      <em>one word at a time.</em>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {view === "library" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">COLLECTED, NEVER FORGOTTEN</p>
                    <h1>Your wordlists.</h1>
                  </div>
                  <button className="secondary" onClick={() => setModal({ kind: "list" })}>
                    <Plus size={16} /> New wordlist
                  </button>
                </div>
                <div className="library-body">
                  <div className="wordlist-index">
                    {state.lists.map((l, i) => (
                      <button
                        className={filter === l.id ? "selected" : ""}
                        onClick={() => setFilter(filter === l.id ? "all" : l.id)}
                        key={l.id}
                      >
                        <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
                        <h2>{l.name}</h2>
                        <p>
                          {countLabel(
                            state.cards.filter((c) => c.listId === l.id && !c.deletedAt).length,
                            "word",
                          )}
                        </p>
                        <span className="small muted">
                          {l.preset.pages.map((p) => languageName(p.language)).join(" / ")}
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                  <div className="library-toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <Input
                        aria-label="Search words"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find a word in your library"
                      />
                    </div>
                    <Choice
                      value={filter}
                      onChange={setFilter}
                      options={[
                        ["all", "All wordlists"],
                        ...state.lists.map((l) => [l.id, l.name] as const),
                      ]}
                      label="Filter wordlist"
                    />
                    {filter !== "all" && (
                      <button
                        className="secondary"
                        onClick={() =>
                          setModal({ kind: "list", list: state.lists.find((l) => l.id === filter) })
                        }
                      >
                        <Settings size={16} /> Preset
                      </button>
                    )}
                  </div>
                  <div className="word-table">
                    <div className="word-table-head">
                      <span>EXPRESSION</span>
                      <span>LANGUAGE</span>
                      <span>STATUS</span>
                    </div>
                    {visibleCards.map((c) => (
                      <button
                        className="word-row"
                        key={c.id}
                        onClick={() => {
                          setModal({ kind: "word", cardId: c.id });
                          setActiveLanguage(c.preset.pages[0]?.language ?? "");
                        }}
                      >
                        <span
                          className="table-word"
                          lang={c.sourceLanguage ?? undefined}
                          dir="auto"
                        >
                          {c.expression}
                          <small>{state.lists.find((l) => l.id === c.listId)?.name}</small>
                        </span>
                        <span>{languageName(c.sourceLanguage)}</span>
                        <span className={"word-status " + c.status}>
                          {c.status === "ready"
                            ? new Date(c.schedule.due) <= new Date()
                              ? "Due now"
                              : "Due " + date(c.schedule.due)
                            : c.status === "queued"
                              ? "Preparing pages"
                              : c.status === "allowance"
                                ? "Saved · allowance used"
                                : c.status === "unknown"
                                  ? "Needs context"
                                  : c.status === "partial"
                                    ? "Some pages ready"
                                    : "Needs attention"}
                          <ChevronRight size={15} />
                        </span>
                      </button>
                    ))}
                    {!visibleCards.length && (
                      <div className="empty-state">
                        <h2>{search ? "No matching words." : "Your words will live here."}</h2>
                        <p className="muted">
                          {search
                            ? "Try another spelling."
                            : "Save a word from something you’re reading."}
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            setModal(state.lists.length ? { kind: "add" } : { kind: "list" })
                          }
                        >
                          <Plus size={16} />{" "}
                          {state.lists.length ? "Add a word" : "Create a wordlist"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {view === "settings" && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">MAKE IT YOURS</p>
                    <h1>Your learning space.</h1>
                  </div>
                  <span className="muted">{state.email}</span>
                </div>
                <div className="settings-body">
                  <section className="settings-section">
                    <div>
                      <p className="eyebrow">GENERATION ALLOWANCE</p>
                      <h2>
                        {state.available}
                        <span> of 100 remaining</span>
                      </h2>
                      <p className="muted">
                        Your one-time free allowance. Each completed language page uses one
                        generation, including all its meanings and examples.
                      </p>
                    </div>
                    <Progress
                      value={100 - state.available}
                      aria-label={state.available + " generations remaining"}
                      className="allowance-progress"
                    />
                    <p className="small muted">
                      {state.allowance.used} completed ·{" "}
                      {100 - state.allowance.used - state.available} reserved · Reviews are always
                      available.
                    </p>
                    {state.mode === "preview" && (
                      <p className="preview-note">
                        Private preview · sample generation, separate from a live account.
                      </p>
                    )}
                  </section>
                  <section className="settings-section">
                    <h2>Learning preferences</h2>
                    <label>
                      New words per day
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={state.preferences.newCardsPerDay}
                        key={"new-" + state.preferences.newCardsPerDay}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== state.preferences.newCardsPerDay)
                            void act(() =>
                              lib.submit("preferences", {
                                baseRevision: state.revision,
                                preferences: { ...state.preferences, newCardsPerDay: n },
                              }),
                            );
                        }}
                      />
                    </label>
                    <label>
                      Default capture wordlist
                      <Choice
                        value={state.preferences.defaultListId ?? ""}
                        onChange={(id) =>
                          void act(() =>
                            lib.submit("preferences", {
                              baseRevision: state.revision,
                              preferences: { ...state.preferences, defaultListId: id },
                            }),
                          )
                        }
                        options={state.lists.map((l) => [l.id, l.name])}
                        label="Default wordlist"
                      />
                    </label>
                    <div className="row-between">
                      <span className="small muted">
                        Study day time zone: {state.preferences.timeZone}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          void act(() =>
                            lib.submit("preferences", {
                              baseRevision: state.revision,
                              preferences: {
                                ...state.preferences,
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                              },
                            }),
                          )
                        }
                      >
                        Use this device’s time zone
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <h2>Interesting languages</h2>
                    <p className="muted">
                      Show a note when a word also has a meaning in one of these languages. This
                      does not change your answer languages.
                    </p>
                    <div className="interest-tags">
                      {state.preferences.interestingLanguages.map((l) => (
                        <button
                          className="interest-tag"
                          key={l}
                          onClick={() =>
                            void act(() =>
                              lib.submit("preferences", {
                                baseRevision: state.revision,
                                preferences: {
                                  ...state.preferences,
                                  interestingLanguages:
                                    state.preferences.interestingLanguages.filter((x) => x !== l),
                                },
                              }),
                            )
                          }
                        >
                          {languageName(l)} <span aria-label="Remove">×</span>
                        </button>
                      ))}
                    </div>
                    <div className="inline-fields">
                      <Choice
                        value={interest}
                        onChange={setInterest}
                        options={languages.filter(
                          (l) => !state.preferences.interestingLanguages.includes(l[0]),
                        )}
                        label="Choose an interesting language"
                      />
                      <button
                        className="secondary"
                        disabled={!interest || busy}
                        onClick={() =>
                          void act(async () => {
                            await lib.submit("preferences", {
                              baseRevision: state.revision,
                              preferences: {
                                ...state.preferences,
                                interestingLanguages: [
                                  ...state.preferences.interestingLanguages,
                                  interest,
                                ],
                              },
                            });
                            setInterest("");
                          })
                        }
                      >
                        <Plus size={16} /> Add
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <h2>Sync & devices</h2>
                    <p className="muted">
                      {lib.online ? "Connected" : "Offline"} ·{" "}
                      {lib.lastSync
                        ? "Last synced " + new Date(lib.lastSync).toLocaleTimeString()
                        : "Waiting for sync"}
                    </p>
                    <button className="secondary" onClick={() => void lib.sync()}>
                      <RefreshCw size={16} /> Sync now
                    </button>
                    {lib.pending
                      .filter((p) => p.error)
                      .map((p) => (
                        <div className="conflict" key={p.id}>
                          <p>{p.error}</p>
                          <button
                            className="text-button"
                            onClick={() => void act(() => lib.discard(p.id))}
                          >
                            Discard this rejected change
                          </button>
                        </div>
                      ))}
                    <p className="small muted">
                      Connect Chrome or iOS with a device token. Treat it like a password. Tokens
                      expire after 30 days.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const r = await api<{ token: string }>("devices/token", {});
                          setDeviceToken(r.token);
                        })
                      }
                    >
                      Create device token
                    </button>
                    {deviceToken && (
                      <label>
                        Device token
                        <Input readOnly value={deviceToken} onFocus={(e) => e.target.select()} />
                      </label>
                    )}
                  </section>
                  <section className="settings-section">
                    <h2>Account</h2>
                    <p className="muted">{state.email}</p>
                    <div className="inline-fields">
                      <a className="secondary" href="/api/account/export" download>
                        <Download size={16} /> Export my library
                      </a>
                      <button
                        className="secondary"
                        onClick={() =>
                          void act(async () => {
                            await lib.logout();
                            setQueue([]);
                            setDeviceToken("");
                          })
                        }
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                    <button
                      className="danger"
                      onClick={() =>
                        setConfirm({
                          title: "Delete your account?",
                          description:
                            "This permanently removes your saved words, settings, and learning history and revokes device access. Export your library first if you want a copy.",
                          action: async () => {
                            await api("account", undefined, "DELETE");
                            localStorage.removeItem("vocab-active-owner");
                            setQueue([]);
                            setDeviceToken("");
                            await lib.sync();
                          },
                        })
                      }
                    >
                      <Trash2 size={16} /> Delete account
                    </button>
                  </section>
                </div>
              </>
            )}
          </>
        )}
        <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
          <DialogContent className={"app-dialog " + (modal?.kind === "word" ? "word-dialog" : "")}>
            <DialogHeader>
              <DialogTitle>
                {modal?.kind === "add"
                  ? "A word worth keeping."
                  : modal?.kind === "list"
                    ? modal.list
                      ? "Shape your wordlist."
                      : "Begin a new collection."
                    : (detail?.expression ?? "Word")}
              </DialogTitle>
              <DialogDescription>
                {modal?.kind === "word"
                  ? "Explore one language page at a time."
                  : modal?.kind === "add"
                    ? "Save it now. We’ll prepare its meanings in your chosen languages."
                    : "Choose how your words become learning cards."}
              </DialogDescription>
            </DialogHeader>
            {modal?.kind === "add" && state && (
              <CaptureForm
                state={state}
                onSave={async (payload) => {
                  await lib.submit("capture", payload);
                  setModal(null);
                  setNotice(
                    lib.online
                      ? "Word saved. Your language pages are being prepared."
                      : "Word saved on this device. It will upload when you reconnect.",
                  );
                }}
              />
            )}
            {modal?.kind === "list" && (
              <ListEditor
                list={modal.list}
                onSave={async (name, preset) => {
                  await lib.submit(
                    modal.list ? "updateList" : "createList",
                    modal.list
                      ? { id: modal.list.id, baseRevision: modal.list.revision, name, preset }
                      : { name, preset },
                  );
                  setModal(null);
                  setNotice("Wordlist saved.");
                }}
              />
            )}
            {detail && state && (
              <div className="word-detail">
                <div className="row-between">
                  <span className="eyebrow">
                    {languageName(detail.sourceLanguage)} {detail.inferred ? "· inferred" : ""}
                  </span>
                  <span className="small muted">
                    {countLabel(detail.meanings.length, "meaning")}
                  </span>
                </div>
                {detail.error && <p className="preview-note">{detail.error}</p>}
                <Tabs value={activeLanguage} onValueChange={(v) => setActiveLanguage(String(v))}>
                  <TabsList variant="line" className="language-index">
                    {detail.preset.pages.map((p) => (
                      <TabsTrigger key={p.language} value={p.language}>
                        {languageName(p.language)}
                        <span>{p.role === "essential" ? "Essential" : "Optional"}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {detail.preset.pages.map((p) => (
                    <TabsContent value={p.language} key={p.language}>
                      {detail.pages[p.language] ? (
                        <Answer page={detail.pages[p.language]} source={detail.sourceLanguage} />
                      ) : (
                        <div className="empty-state">
                          <h3>
                            {detail.status === "queued"
                              ? "Preparing this page…"
                              : "This page is not ready."}
                          </h3>
                          <p className="muted">{detail.error ?? "Generation is pending."}</p>
                        </div>
                      )}
                      {detail.alternatives
                        .filter(
                          (a) =>
                            a.language !== detail.sourceLanguage &&
                            state.preferences.interestingLanguages.includes(a.language) &&
                            a.previews[p.language],
                        )
                        .map((a) => (
                          <details className="alternative-note" key={a.language}>
                            <summary>Also a word in {languageName(a.language)}</summary>
                            <p lang={p.language} dir="auto">
                              {a.previews[p.language]}
                            </p>
                            <button
                              className="text-button"
                              onClick={() =>
                                void act(async () => {
                                  await lib.submit("capture", {
                                    expression: detail.expression,
                                    listId: detail.listId,
                                    context: detail.context,
                                    sourceUrl: detail.sourceUrl,
                                    sourceHint: a.language,
                                  });
                                  setNotice("Alternative word saved as a separate card.");
                                })
                              }
                            >
                              Learn this meaning · {detail.preset.pages.length} generations
                            </button>
                          </details>
                        ))}
                    </TabsContent>
                  ))}
                </Tabs>
                <div className="detail-actions">
                  {!detail.preset.pages.every((p) => detail.pages[p.language]) && (
                    <button
                      className="secondary"
                      disabled={busy || detail.status === "queued"}
                      onClick={() => void act(() => lib.submit("retry", { cardId: detail.id }))}
                    >
                      <RefreshCw size={16} /> Retry missing pages
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy || detail.status === "queued"}
                    onClick={() =>
                      setConfirm({
                        title: "Regenerate these pages?",
                        description:
                          "This applies the current wordlist preset and uses one generation per successfully completed language page. Your review schedule and history stay intact.",
                        action: async () => {
                          await lib.submit("regenerate", { cardId: detail.id });
                        },
                      })
                    }
                  >
                    <Sparkles size={16} /> Regenerate
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label="Delete word"
                    onClick={() =>
                      setConfirm({
                        title: "Delete this word?",
                        description:
                          "It will be removed from your library and future reviews. Active generation will be cancelled.",
                        action: async () => {
                          await lib.submit("deleteCard", { cardId: detail.id });
                          setModal(null);
                        },
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <p className="small muted">
                  Saved {date(detail.createdAt)} · {detail.reviewRevision} reviews ·{" "}
                  {eligible(detail)
                    ? "One schedule · next due " + date(detail.schedule.due)
                    : "Review waits for Essential content"}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
          <AlertDialogContent className="app-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const action = confirm?.action;
                  setConfirm(null);
                  if (action) void act(action);
                }}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </SidebarProvider>
  );
}
function scheduleLabel(c: Card, rating: number) {
  const due = rateSchedule(c.schedule, rating, new Date()).due;
  const minutes = Math.round((+new Date(due) - Date.now()) / 60000);
  return minutes < 60
    ? minutes + " min"
    : minutes < 1440
      ? Math.round(minutes / 60) + " hr"
      : Math.round(minutes / 1440) + " days";
}
