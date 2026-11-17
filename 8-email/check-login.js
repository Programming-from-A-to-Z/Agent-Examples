// A quick test of the email login, one step at a time, with the full error messages.
// Run it with: node check-login.js

import { ImapFlow } from 'imapflow';

process.loadEnvFile();

const account = process.env.EMAIL_ADDRESS;
const myAddress = account.replace('@', '+' + process.env.AGENT_NAME + '@');
console.log('Account: ' + account);
console.log('Password is ' + process.env.EMAIL_PASSWORD.replaceAll(' ', '').length + ' characters without spaces (an app password is 16)');

const inbox = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: account, pass: process.env.EMAIL_PASSWORD },
  logger: false,
});

let step = 'logging in';
try {
  await inbox.connect();
  console.log('1. Logged in.');
  step = 'opening the inbox';
  await inbox.mailboxOpen('INBOX');
  console.log('2. Opened the inbox.');
  step = 'searching';
  const ids = await inbox.search({ seen: false, to: myAddress });
  console.log('3. Searched. Unread emails to ' + myAddress + ': ' + ids.length);

  // A closer look: the newest messages in the inbox, and in spam
  for (let box of ['INBOX', '[Gmail]/Spam']) {
    const status = await inbox.mailboxOpen(box);
    console.log('\n' + box + ' has ' + status.exists + ' messages. The newest:');
    if (status.exists > 0) {
      const first = Math.max(status.exists - 4, 1);
      for await (let message of inbox.fetch(first + ':*', { envelope: true, flags: true })) {
        let to = [];
        for (let person of message.envelope.to || []) {
          to.push(person.address);
        }
        let read = message.flags.has('\\Seen') ? 'read' : 'UNREAD';
        console.log('- ' + read + ' | to: ' + to.join(', ') + ' | subject: ' + message.envelope.subject);
      }
    }
  }
  await inbox.logout();
} catch (error) {
  console.log('Failed while ' + step + ': ' + error.message);
  console.log('What Gmail said: ' + error.responseText);
  console.log('Wrong login? ' + error.authenticationFailed);
}
