// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// Same as 1-agent.js but now the tools are hosted by an MCP server.
// The server code is here: https://github.com/Programming-from-A-to-Z/MCP-Server-Example
// Run the server in one terminal and this in another: node 2-mcp-agent.js "your task"

import { Ollama } from 'ollama';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';

// Connect to the MCP server, the same address that went into LM Studio's mcp.json
const client = new Client({ name: 'a2z-agent', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp')));

// Ask the server what tools it has
const list = await client.listTools();

// Turn each MCP tool into the description Ollama expects.
// They are almost the same thing: a name, a description, and the parameters.
const tools = [];
for (let tool of list.tools) {
  console.log('Found a tool:', tool.name);
  tools.push({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  });
}

// Give it a task on the command line, the same way as 1-agent.js
const task =
  process.argv[2] ||
  'Say hello to the ITP students, then tell me the weather in New York City (latitude 40.73, longitude -73.99).';

const messages = [
  { role: 'system', content: 'Use tools as many times as you need, one after another.' },
  { role: 'user', content: task },
];

while (true) {
  // Query the model
  const response = await ollama.chat({ model: model, messages: messages, tools: tools });
  messages.push(response.message);

  // If there are no more tool calls, exit the loop!
  if (!response.message.tool_calls) {
    console.log(response.message.content);
    break;
  }

  for (let call of response.message.tool_calls) {
    // Instead of running a function here, ask the MCP server to run the tool
    const result = await client.callTool({ name: call.function.name, arguments: call.function.arguments });
    const text = result.content[0].text;
    console.log(call.function.name, call.function.arguments, '->', text);
    messages.push({ role: 'tool', tool_name: call.function.name, content: text });
  }
}

await client.close();
