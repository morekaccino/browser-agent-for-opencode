# Chrome Web Store privacy practices

Use this when filling the **Privacy practices** tab.

## Single purpose

> An AI browser-automation side panel that connects to the user's locally installed opencode V2 agent to inspect and operate the active Chrome tab and run user-defined scheduled browser tasks.

## Remote code

Select **Yes, I am using remote code** and paste the justification from `store/permissions.md` → “Remote code declaration”.

Short version:

> The extension executes agent-supplied JavaScript only through Chrome's Debugger API (`Runtime.evaluate`), the documented MV3 exemption. No remote scripts or files are loaded into the extension. The extension itself contains all of its logic and uses no `eval()` or `new Function()`.

## Data usage

The extension is a client for a service the user runs on their own computer. It does not operate a developer server, and the developer receives no data. The extension still handles page content on the user's behalf, so disclose the categories that can be present when the user points the agent at a page.

Recommended selections (use the labels your dashboard shows):

| Category | Select | Explanation |
| --- | --- | --- |
| Personally identifiable information | Yes | Page content can contain names, email addresses, usernames, or account numbers. |
| Financial and payment information | Yes | The agent can be pointed at a page containing financial information. |
| Health information | Yes | The agent can be pointed at a page containing health information. |
| Authentication information | Yes | The extension stores the local opencode server username/password and bridge token; website credentials are only handled if the user asks the agent to type them. |
| Website content | Yes | Page text, DOM, screenshots, console output, and form values are sent to the local opencode service at the user's direction. |
| Form data | Yes | The agent can read and fill forms. |
| Web browsing activity | Yes | The active tab URL/title, open-tab list, and tab-group data are used for the agent's context. |
| Personal communications | Yes | The agent can read messages or email if the user points it at such a page. |
| User-generated content | Yes | Page content and workflow instructions are user-directed content. |

If the dashboard only offers a subset, select the closest categories. Do not claim “none” — the extension can transmit page content to the user's local service and model provider.

## Certifications

Select the statements that apply:

- **I do not sell or transfer user data to third parties, outside of the approved use cases.** — Yes.
- **I do not use or transfer user data for purposes that are unrelated to my item's single purpose.** — Yes.
- **I do not use or transfer user data to determine creditworthiness or for lending purposes.** — Yes.
- **I do not use or transfer user data for personalized advertising.** — Yes.
- **I do not allow humans to read user data.** — Yes; the developer has no access. The local opencode service and the user's model provider process data at the user's direction.

## Privacy policy URL

> https://morekaccino.github.io/browser-agent-for-opencode/privacy.html

The policy is also in the repository at `PRIVACY.md`. Keep the two in sync.

## Limited Use statement

The privacy policy includes:

> The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Data handling notes for reviewers

- The extension has no developer backend and no analytics.
- The only non-loopback request in the released build is none; provider marks are local initials. All functional traffic goes to the user's `localhost` opencode service.
- The first-run screen discloses what can be sent and requires affirmative consent before the composer is enabled.
- Settings → Data & privacy includes a policy link, a “review disclosure” button, and a “clear stored data” button.
- Workflows are read-only by default; submissions require a per-workflow opt-in.
