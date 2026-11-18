// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// An agent that reads and replies to emails. It uses a dummy account.
// It can only reply to emails (not autonomously decide to send one),
// and as a safety measure stops after 20 messages.
// A class can share one Gmail account: each agent gets its own address by adding a "+" and a name
// (classaccount+yourname@gmail.com) and reads only the mail sent to that address.

import { Ollama } from 'ollama';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// Load EMAIL_ADDRESS, EMAIL_PASSWORD (a Google "app password") and AGENT_NAME from the .env file
process.loadEnvFile();

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

// const model = 'qwen3';
// const model = 'gemma4';

const model = 'qwen3.8:27b';
const secondsBetween = 60;
// The most emails it will send before you have to restart it
const maxEmails = 20;

// classaccount@gmail.com becomes classaccount+yourname@gmail.com
const account = process.env.EMAIL_ADDRESS;
const myAddress = account.replace('@', '+' + process.env.AGENT_NAME + '@');

const systemPrompt = `You are a pen pal who writes short, strange postcards by email.
Your email address is ${myAddress}.
Every time you wake up:
1. Read your inbox with read_inbox.
2. If someone wrote to you, answer them with send_email, in under 50 words. Send it to the address the email came from.
3. If there is no new email, do nothing.`;

// For sending email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: account, pass: process.env.EMAIL_PASSWORD },
});

// The addresses that have written to this agent since it started
let senders = [];

// Read the unread email that was sent to this agent's address
async function readInbox(args) {
  const inbox = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account, pass: process.env.EMAIL_PASSWORD },
    logger: false,
  });
  await inbox.connect();
  await inbox.mailboxOpen('INBOX');

  // Look at all the unread email for this particular agent's address
  // (and skip what was sent to somebody else's agent)
  const ids = await inbox.search({ seen: false });
  let result = '';
  for (let id of ids) {
    const message = await inbox.fetchOne(id, { source: true });
    const email = await simpleParser(message.source);
    if (!email.to || !email.to.text.toLowerCase().includes(myAddress.toLowerCase())) {
      continue;
    }
    // Careful! This is text written by other people going straight to your agent!
    result +=
      'From: ' +
      email.from.value[0].address +
      '\nSubject: ' +
      email.subject +
      '\n' +
      email.text.slice(0, 1000) +
      '\n---\n';
    // Now the agent is allowed to write back to this address
    senders.push(email.from.value[0].address);
    // Mark it as read, so the agent only sees it once
    await inbox.messageFlagsAdd(id, ['\\Seen']);
  }
  await inbox.logout();

  if (result == '') {
    return 'No new email.';
  }
  return result;
}

// How many emails it has sent so far
let sent = 0;

async function sendEmail(args) {
  // Rule 1: only to someone who wrote first
  if (!senders.includes(args.to)) {
    return 'Not allowed. You can only write to an address that has written to you.';
  }
  // Rule 2: not too many
  if (sent >= maxEmails) {
    return 'Not allowed. You have sent ' + maxEmails + ' emails, which is the limit.';
  }
  sent++;

  console.log('\nTo: ' + args.to + '\nSubject: ' + args.subject + '\n\n' + args.text + '\n');

  await transporter.sendMail({
    from: myAddress,
    replyTo: myAddress,
    to: args.to,
    subject: args.subject,
    // Bots say they are bots
    text: args.text + '\n\n(This email was written by a bot.)',
  });
  return 'Sent.';
}

const functions = {
  read_inbox: readInbox,
  send_email: sendEmail,
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'read_inbox',
      description: 'Read the new email in your inbox',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'The email address to send to' },
          subject: { type: 'string', description: 'The subject line' },
          text: { type: 'string', description: 'The text of the email' },
        },
        required: ['to', 'subject', 'text'],
      },
    },
  },
];

// One "heartbeat" of the agent
async function wakeUp() {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'You wake up and read inbox.' },
  ];

  // The agent loop, with a limit of 5 steps
  for (let step = 0; step < 5; step++) {
    const response = await ollama.chat({ model: model, messages: messages, tools: tools });
    messages.push(response.message);
    if (!response.message.tool_calls) {
      break;
    }

    for (let call of response.message.tool_calls) {
      let result;
      try {
        const tool = functions[call.function.name];
        result = await tool(call.function.arguments);
      } catch (error) {
        result = 'Error: ' + error.message;
      }
      console.log(call.function.name, '->', String(result).slice(0, 200));
      messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
    }
  }
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

console.log('My address is ' + myAddress);

// Forever: wake up, then sleep. Stop it with control-C.
while (true) {
  await wakeUp();
  console.log('zzz');
  await sleep(secondsBetween);
}
