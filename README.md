# n8n-nodes-paraplex

[Paraplex](https://paraplex.ai) in [n8n](https://n8n.io). Paraplex is a motion
design studio in the browser. With these nodes, a workflow can:

- render any Paraplex template into a video, with its words, numbers, colors and
  pictures filled from the workflow, on Paraplex's cloud;
- run a Paraplex automation with input of its own;
- start when a render finishes or an automation's run ends.

## Installation

In n8n: **Settings › Community Nodes › Install**, and enter `n8n-nodes-paraplex`.
See n8n's [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

The nodes use a Paraplex API key (it starts with `pxk_`). API keys come with
Paraplex Pro.

1. In Paraplex, open the **Account** window, then **API keys**.
2. Under **Paraplex API keys**, make a key. Tick **Render** so it can render
   and run automations.
3. Copy the key. It's shown only once.
4. In n8n, add a **Paraplex API** credential and paste the key in **API Key**.
   Leave **Base URL** as it is.

## Nodes

### Paraplex

| Resource | Operation | What it does |
| --- | --- | --- |
| Render | Create | Renders a template with its slots filled. **Wait for the Render to Finish** (on by default) holds the workflow until the film is made and passes on its download link. |
| Render | Get | A render's status, and its download link once made (the link works for an hour; read the render again for a new one). |
| Render | Get Many | The account's API renders, newest first (up to 50). |
| Render | Cancel | Stops a render that hasn't finished; its minutes come back. |
| Template | Get Many | Every template: its size, length and how many slots it has. |
| Template | Get | One template with its slots: each one's name, kind (text, number, color or picture) and what it holds now. |
| Automation | Run | Starts a run of an automation. Its steps read the input as `{{trigger.…}}`. **Wait for the Run to Finish** passes on the run's log and its steps' outputs. |
| Automation | Get, Get Many | Automations, their steps and their last run. |
| Automation | Get Run, Get Runs | A run with its log and outputs, or an automation's runs. |

Slots take: words for a text slot, a number for a counter, `#rrggbb` for a
color, and an `https` link to a PNG, JPEG, WebP or GIF for a picture. Slots you leave
out keep the template's own.

Render options: **Format** (MP4 or WebM), **Size** (1, 1.5 or 2 times the
template's), **Name**, **Design System** (restyle the template in one of
Paraplex's design systems, or the account's own), and **Webhook URL** (Paraplex
calls it, signed, when the render finishes).

### Paraplex Trigger

Starts a workflow when:

- **Render Finished**: a render made through the API (by this node, another
  workflow or any script with the account's key) is ready, with its download link;
- **Render Failed**: one failed or was cancelled;
- **Automation Run Ended**: a run of the automation you pick ended as done,
  failed or cancelled (you choose which), with its log and outputs.

It checks on n8n's schedule (**Poll Times**). The first check only notes what
has ended already, so turning a workflow on never replays old renders.

## Example

Every morning, read a sheet's new rows and make a video of each:

1. **Schedule Trigger**, every day.
2. **Google Sheets**, the new rows.
3. **Paraplex**, Render › Create: pick a template, and fill its slots from the
   row (`{{ $json.headline }}`, `{{ $json.photo }}`).
4. **Slack** or **Gmail**, with `{{ $json.downloadUrl }}`.

## Usage and limits

Renders draw on the account's cloud render minutes, as renders from the editor
do. A render usually starts within a minute or two, while a render machine
starts up. A run of an automation counts toward the account's runs for the
month.

## License

[MIT](LICENSE)
