"use client";

import { Bot, RotateCcw, Send, Square, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ label: string; count: number; dateFrom?: string; dateTo?: string; freshness?: string | null }>;
  freshness?: string | null;
  error?: boolean;
  tools?: string[];
}

type Status = "idle" | "consulting" | "thinking" | "answering";
const suggestions = ["Quel sera mon solde estimé dans 60 jours ?", "Quelles factures clients sont en retard ?", "Quelles sont les plus grosses sorties du mois ?"];

export function FinancialAssistant() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => { fetch("/api/assistant/chat", { cache: "no-store" }).then((response) => response.json()).then((data: { configured?: boolean }) => setConfigured(Boolean(data.configured))).catch(() => setConfigured(false)); }, []);
  useEffect(() => { if (open) window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button, textarea")?.focus(), 0); }, [open]);
  useEffect(() => { if (status !== "idle") endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, status]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const reset = () => { abortRef.current?.abort(); setMessages([]); setStatus("idle"); setInput(""); };
  const stop = () => { abortRef.current?.abort(); setStatus("idle"); };

  async function send(content = input) {
    const text = content.trim();
    if (!text || status !== "idle" || configured !== true) return;
    const user: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const nextMessages = [...messages, user];
    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setInput(""); setStatus("consulting");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map(({ role, content: bodyContent }) => ({ role, content: bodyContent })) }), signal: controller.signal });
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(body?.error?.message || "L’assistant est indisponible."); }
      if (!response.body) throw new Error("Réponse vide de l’assistant.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as Record<string, unknown>, assistantId);
        if (done) break;
      }
    } catch (error) {
      if (controller.signal.aborted) updateAssistant(assistantId, (message) => ({ ...message, content: message.content || "Réponse interrompue." }));
      else updateAssistant(assistantId, (message) => ({ ...message, content: error instanceof Error ? error.message : "Une erreur est survenue.", error: true }));
    } finally { setStatus("idle"); abortRef.current = null; }
  }

  function applyEvent(event: Record<string, unknown>, assistantId: string) {
    if (event.type === "status" && (event.status === "thinking" || event.status === "consulting" || event.status === "answering")) {
      setStatus(event.status);
      if (Array.isArray(event.tools)) {
        const tools = event.tools.filter((tool): tool is string => typeof tool === "string");
        updateAssistant(assistantId, (message) => ({ ...message, tools }));
      }
    }
    if (event.type === "delta" && typeof event.content === "string") updateAssistant(assistantId, (message) => ({ ...message, content: message.content + event.content }));
    if (event.type === "metadata") updateAssistant(assistantId, (message) => ({ ...message, sources: Array.isArray(event.sources) ? messageSources(event.sources) : [], freshness: typeof event.freshness === "string" ? event.freshness : null, tools: Array.isArray(event.tools) ? event.tools.filter((tool): tool is string => typeof tool === "string") : message.tools }));
    if (event.type === "error") updateAssistant(assistantId, (message) => ({ ...message, content: typeof event.message === "string" ? event.message : "Une erreur est survenue.", error: true }));
  }

  function updateAssistant(id: string, update: (message: Message) => Message) { setMessages((current) => current.map((message) => message.id === id ? update(message) : message)); }
  function onSubmit(event: FormEvent) { event.preventDefault(); void send(); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }
  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)") ?? [])];
    if (!focusable.length) return; const first = focusable[0]; const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <>
    {open && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onDialogKeyDown} className="fixed inset-0 z-50 flex flex-col bg-background sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(680px,calc(100vh-8rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><h2 id={titleId} className="font-bold">Assistant financier</h2><p className="text-xs text-muted-foreground">{configured === null ? "Vérification…" : configured ? "Microsoft Foundry configuré" : "Assistant non configuré"}</p></div>
        <div className="flex gap-1"><button type="button" onClick={reset} className="rounded-lg p-2 hover:bg-muted" aria-label="Nouvelle conversation"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={close} className="rounded-lg p-2 hover:bg-muted" aria-label="Fermer l’assistant financier"><X className="h-5 w-5" /></button></div>
      </header>
      <div className="flex-1 overflow-y-auto p-4" aria-live="polite">
        {configured === false ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><strong>Assistant non configuré.</strong><p className="mt-1">Renseignez les variables Microsoft Foundry dans le fichier local prévu. Le dashboard reste entièrement disponible.</p></div> : messages.length === 0 ? <div className="space-y-4"><div className="rounded-xl bg-muted p-4 text-sm">Bonjour. Je peux analyser en lecture seule les données financières synchronisées et les calculs du dashboard.</div><div className="grid gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={configured !== true} className="rounded-xl border border-border p-3 text-left text-sm hover:bg-muted disabled:opacity-50">{suggestion}</button>)}</div></div> : <div className="space-y-4">{messages.map((message) => <article key={message.id} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : message.error ? "border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100" : "bg-muted"}`}>{message.role === "assistant" && message.tools && message.tools.length > 0 && <p className="mb-2 text-[11px] text-muted-foreground">Outils consultés : {message.tools.map(toolLabel).join(", ")}</p>}<MarkdownContent content={message.content || "…"} />{message.sources && message.sources.length > 0 && <details className="mt-3 border-t border-current/15 pt-2 text-xs"><summary className="cursor-pointer font-semibold">Sources consultées</summary><ul className="mt-2 space-y-1">{message.sources.map((source) => <li key={source.label}>{source.label} : {source.count} élément{source.count > 1 ? "s" : ""}{source.dateFrom ? `, du ${formatDate(source.dateFrom)}${source.dateTo ? ` au ${formatDate(source.dateTo)}` : ""}` : ""}</li>)}</ul>{message.freshness && <p className="mt-2">Données Qonto synchronisées le {formatDateTime(message.freshness)}.</p>}</details>}</article>)}</div>}
        {status !== "idle" && <p className="mt-3 text-xs text-muted-foreground" role="status">{status === "consulting" ? "Consultation du contexte financier…" : status === "thinking" ? "Réflexion et sélection des outils…" : `Rédaction de la réponse${messages.at(-1)?.tools?.length ? ` — outils : ${messages.at(-1)!.tools!.map(toolLabel).join(", ")}` : ""}…`}</p>}<div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="border-t border-border p-3"><label htmlFor={`${titleId}-input`} className="sr-only">Votre question financière</label><textarea id={`${titleId}-input`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} disabled={configured !== true || status !== "idle"} maxLength={2000} rows={2} placeholder="Posez une question sur vos finances…" className="input resize-none" /><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">Réponses informatives, sans modification de données.</p>{status !== "idle" ? <button type="button" onClick={stop} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"><Square className="h-4 w-4" /> Arrêter</button> : <button type="submit" disabled={!input.trim() || configured !== true} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /> Envoyer</button>}</div></form>
    </div>}
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="Ouvrir l’assistant financier" aria-expanded={open} className={`fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-foreground/20 motion-reduce:transition-none ${open ? "pointer-events-none opacity-0" : ""}`}><Bot className="h-6 w-6" /></button>
  </>;
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return <div className="space-y-2 leading-relaxed">{blocks.map((block, index) => {
    const lines = block.split("\n");
    if (isMarkdownTable(lines)) return <MarkdownTable key={index} lines={lines} />;
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line) => <li key={line}>{inlineMarkdown(line.slice(2))}</li>)}</ul>;
    if (/^#{1,3} /.test(block)) return <h3 key={index} className="font-bold">{inlineMarkdown(block.replace(/^#{1,3} /, ""))}</h3>;
    return <p key={index} className="whitespace-pre-wrap">{inlineMarkdown(block)}</p>;
  })}</div>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return <div className="max-w-full overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-max border-collapse text-left text-xs"><thead className="bg-background/70"><tr>{header.map((cell, index) => <th key={index} className="border-b border-border px-3 py-2 font-semibold">{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border/60 last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table></div>;
}

function isMarkdownTable(lines: string[]) {
  return lines.length >= 2 && lines[0].includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[1]);
}

function inlineMarkdown(content: string) {
  return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-background/70 px-1 py-0.5">{part.slice(1, -1)}</code> : part);
}

function messageSources(value: unknown[]): NonNullable<Message["sources"]> { return value.filter((item): item is NonNullable<Message["sources"]>[number] => Boolean(item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { count?: unknown }).count === "number")); }
function toolLabel(value: string) { return value.replace(/^get_/, "").replace(/^search_/, "recherche ").replaceAll("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)); }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(date); }
