import { readFoundryConfig } from "@/lib/financial-assistant/config";
import { FoundryRequestError, runFoundryConversation, type ChatMessage } from "@/lib/financial-assistant/foundry";
import { buildFinancialContext } from "@/lib/financial-assistant/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 20;
const encoder = new TextEncoder();

export async function GET() {
  const config = readFoundryConfig();
  return Response.json({ configured: config.configured });
}

export async function POST(request: Request) {
  const config = readFoundryConfig();
  if (!config.configured) return errorResponse("NOT_CONFIGURED", "L’assistant Microsoft Foundry n’est pas configuré.", 503);

  let history: ChatMessage[];
  try {
    const body = await request.json() as { messages?: unknown };
    history = validateMessages(body.messages);
  } catch (error) {
    return errorResponse("INVALID_REQUEST", error instanceof Error ? error.message : "Requête invalide.", 400);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "status", status: "consulting" });
        const context = await buildFinancialContext();
        send({ type: "status", status: "thinking" });
        const answer = await runFoundryConversation(config.config, history, context, request.signal);
        send({ type: "status", status: "answering", tools: answer.toolsUsed });
        for (const chunk of chunkText(answer.content, 80)) send({ type: "delta", content: chunk });
        send({ type: "metadata", sources: answer.sources, freshness: answer.freshness, tools: answer.toolsUsed });
        send({ type: "done" });
      } catch (error) {
        const code = safeErrorCode(error);
        console.error("[assistant] Échec du traitement", debugError(error));
        send({ type: "error", code, message: errorMessage(code) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HISTORY_MESSAGES) {
    throw new Error(`La conversation doit contenir entre 1 et ${MAX_HISTORY_MESSAGES} messages.`);
  }
  const messages = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Format de message invalide.");
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") throw new Error("Format de message invalide.");
    const normalized = content.trim();
    if (!normalized || normalized.length > MAX_MESSAGE_LENGTH) throw new Error(`Chaque message doit contenir entre 1 et ${MAX_MESSAGE_LENGTH} caractères.`);
    return { role, content: normalized } as ChatMessage;
  });
  if (messages.at(-1)?.role !== "user") throw new Error("Le dernier message doit provenir de l’utilisateur.");
  return messages;
}

function chunkText(content: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += size) chunks.push(content.slice(index, index + size));
  return chunks;
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "REQUEST_ABORTED") return "ABORTED";
  if (message === "FOUNDRY_TIMEOUT") return "TIMEOUT";
  if (message === "TOOL_LIMIT") return "TOOL_LIMIT";
  return "FOUNDRY_UNAVAILABLE";
}

function debugError(error: unknown) {
  if (error instanceof FoundryRequestError) return { name: error.name, code: error.code, providerStatus: error.status, providerDetail: error.detail };
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

function errorMessage(code: string): string {
  if (code === "ABORTED") return "Réponse interrompue.";
  if (code === "TIMEOUT") return "Microsoft Foundry n’a pas répondu dans le délai prévu.";
  if (code === "TOOL_LIMIT") return "La demande nécessite trop de consultations de données. Précisez votre question.";
  return "L’assistant est temporairement indisponible. Le dashboard reste utilisable.";
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
