#!/usr/bin/env node
import {
  formatAskCueyResult,
  formatCueyErrorMessage,
  runAskCuey,
  writeLatestAskCueyResult,
} from "./ask-cuey-client.mjs";

const SERVER_NAME = "cuey-claude-mcp";
const SERVER_VERSION = "0.3.3";

const tools = [
  {
    name: "ask_cuey",
    description: "Run Ask Cuey multi-model fanout and synthesis. Call this tool whenever the user explicitly asks to use Cuey, asks for a Cuey comparison, or the message instructs you to use the Cuey MCP tool. The text content is the final synthesis: return it verbatim without adding analysis, commentary, or a separate answer.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["ask", "compare", "verify", "summarize"],
          description: "Cuey mode for the request.",
        },
        question: {
          type: "string",
          description: "The user's current question or instruction.",
        },
        context: {
          type: "string",
          description: "Relevant Claude-visible context to include.",
        },
        models: {
          type: "array",
          items: { type: "string" },
          description: "Up to three model IDs to fan out to.",
        },
        reasoningLevel: {
          type: "string",
          enum: ["standard", "advanced"],
          description: "Reasoning level selected by the user.",
        },
        source: {
          type: "string",
          description: "Caller source metadata.",
        },
      },
      required: ["question"],
    },
  },
];

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  writeMessage({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function serverCapabilities() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };
}

async function handleRequest(message) {
  const id = message?.id;
  const method = String(message?.method || "");

  try {
    if (method === "initialize") {
      result(id, serverCapabilities());
      return;
    }
    if (method === "notifications/initialized") {
      return;
    }
    if (method === "ping") {
      result(id, {});
      return;
    }
    if (method === "tools/list") {
      result(id, { tools });
      return;
    }
    if (method === "tools/call") {
      const name = String(message?.params?.name || "");
      if (name !== "ask_cuey") {
        error(id, -32601, `Unknown tool: ${name}`);
        return;
      }
      const args = message?.params?.arguments || {};
      const cueyResult = await runAskCuey(args);
      try {
        await writeLatestAskCueyResult(cueyResult);
      } catch (writeErr) {
        console.error(`[${SERVER_NAME}] failed to write latest Cuey result: ${writeErr?.message || writeErr}`);
      }
      result(id, {
        content: [
          {
            type: "text",
            text: formatAskCueyResult(cueyResult),
          },
        ],
      });
      return;
    }

    if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    const safeMessage = formatCueyErrorMessage(err);
    const data = {
      status: err?.status || null,
      body: err?.body ? safeMessage : null,
      candidates: err?.candidates || null,
    };
    error(id, -32000, safeMessage, data);
  }
}

function parseContentLengthMessages(buffer) {
  const messages = [];
  let rest = buffer;
  while (true) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const header = rest.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (rest.length < bodyEnd) break;
    messages.push(rest.slice(bodyStart, bodyEnd));
    rest = rest.slice(bodyEnd);
  }
  return { messages, rest };
}

let buffer = "";
const pendingRequests = new Set();

function enqueueRequest(message) {
  const promise = Promise.resolve()
    .then(() => handleRequest(message))
    .catch((err) => {
      error(message?.id ?? null, -32000, err?.message || String(err));
    })
    .finally(() => {
      pendingRequests.delete(promise);
    });
  pendingRequests.add(promise);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  if (buffer.includes("Content-Length:")) {
    const parsed = parseContentLengthMessages(buffer);
    buffer = parsed.rest;
    for (const raw of parsed.messages) {
      try {
        enqueueRequest(JSON.parse(raw));
      } catch (err) {
        error(null, -32700, err?.message || String(err));
      }
    }
    return;
  }

  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      try {
        enqueueRequest(JSON.parse(line));
      } catch (err) {
        error(null, -32700, err?.message || String(err));
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});

process.stdin.on("end", async () => {
  if (pendingRequests.size > 0) {
    await Promise.allSettled([...pendingRequests]);
  }
  process.exit(0);
});
