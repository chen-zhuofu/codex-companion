# Codex Notes Companion

Chat with Codex beside your Obsidian notes. Attach the current note or selected text, paste images, invoke installed Codex skills, and keep intermediate progress separate from the final answer.

## ⌘L — Bring your notes into the conversation

**Select text → press ⌘L → ask Codex. No copying and pasting.**

Press **Command+L on macOS** (**Ctrl+L on Windows/Linux**) to open or focus the Codex sidebar and attach your selected text. With nothing selected, it attaches the current note instead.

For example, highlight a paragraph, press **⌘L**, and ask: *“Explain this in simpler terms”* or *“Rewrite this more clearly.”* Review the attachment, type your question, and press **Enter** to send.

An independent community project, not affiliated with OpenAI or Obsidian. The plugin interface is in English. Codex replies in the language you use.

## Features

- **⌘L / Ctrl+L: Attach your selection or current note and focus chat instantly.**
- Sidebar conversations, saved history, and independent pop-out conversations.
- Paste images and select installed Codex skills by typing `/`.
- Choose the models and reasoning levels returned by your local Codex installation.
- Stream progress inside an expandable execution section, collapsed after completion; keep the final reply prominent.
- Click vault note links to open the note; hold Cmd/Ctrl to open a new tab. Heading anchors are preserved.
- View proposed approvals, answer clarification requests, stop generation, and inspect file changes.
- Leave room for Obsidian's desktop status bar below the composer.

## Requirements

- Desktop Obsidian 1.13.7 or later. Tested on macOS; Windows and Linux have not been validated.
- A separately installed and authenticated Codex CLI with the `app-server` interface. Install and sign in using the [official Codex instructions](https://developers.openai.com/codex/cli/).
- An OpenAI account/authentication method supported by your Codex installation. Applicable subscription or API usage charges are determined by OpenAI. This plugin is free.

The plugin does not install, update, or authenticate Codex for you.

## Install

Install from **Settings → Community plugins → Browse** by searching for **Codex Notes Companion**.

To install manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/chen-zhuofu/codex-companion/releases/latest).
2. Put those three files in `<vault>/.obsidian/plugins/codex-companion/`.
3. In Obsidian, enable the plugin under **Settings → Community plugins**.
4. Under **Settings → Codex Notes Companion**, set the Codex executable. The default is `codex`; if Obsidian cannot find it, enter its absolute path (`which codex` on macOS/Linux).
5. Select **Connect to Codex** to connect, then use the ribbon icon or `Cmd/Ctrl+L`.

## Use

Type a prompt and press Enter to send; Shift+Enter inserts a newline. The square stop button or Escape interrupts a running response. Removing an attachment chip removes it from the next prompt.

Progress messages are identified using Codex's `commentary` phase. Final answers remain ordinary replies. Older messages without phase metadata are preserved; continuing an existing conversation backfills metadata when the Codex server provides it.

When a response requests an approval or clarification, review the dialog before proceeding. Codex can edit notes and execute commands in the vault in response to your requests. The plugin requests a workspace-write sandbox and on-request approvals; actual sandbox enforcement and approved access depend on Codex and the operating system.

## Privacy, network use, and local access

- Prompts, attached note content/selections, images, and task context are sent to the local Codex process, which communicates with the model service configured in Codex, normally OpenAI. Agent tasks may read additional vault files as needed. Only attach or request work on information you intend to share with that service.
- The plugin starts the user-configured executable with `app-server --stdio`. Configure only a trusted Codex executable.
- Codex accesses its authentication, configuration, skills, and session files outside the vault (normally under `~/.codex`). The plugin reuses that installation and does not ask you to paste an API key into Obsidian. Codex handles authentication and service communication.
- Prompts, replies, drafts, attachment references, and conversation IDs are stored locally in the plugin's `data.json`. Pasted images are stored in its `images/` directory. Codex may also retain session history outside the vault according to its own settings. These files may be copied by vault backups or sync tools.
- No plugin-added analytics, advertising, or telemetry is included. Service-side processing and retention are governed by your provider's terms and settings; see [OpenAI's privacy policy](https://openai.com/policies/privacy-policy/).
- The plugin does not automatically publish notes or conversations. The public release contains no personal conversations, images, credentials, or vault configuration.

## Development

Requires Node.js 20 or later.

```sh
npm ci
npm run check
npm test
npm run build
```

`src/plugin.js` contains the plugin and UI; `src/client.js` implements the local JSON-RPC client. The build bundles both into `main.js`, with the Obsidian API external. The release contains only `main.js`, `manifest.json`, and `styles.css`.

Tests simulate protocol events and UI rendering; they do not make paid model calls. A real Obsidian/Codex integration should also be checked before broad deployment. Keep personal `data.json`, image uploads, environment files, and credentials out of Git.

## License

[MIT](LICENSE).
